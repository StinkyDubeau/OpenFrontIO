import type { GameMap } from "../../../../core/game/GameMap";
import type { RenderSettings } from "../RenderSettings";
import {
  createMapQuad,
  createProgram,
  createTexture2D,
} from "../utils/GlUtils";

const OVERVIEW_TEXEL_BUDGET = 8 * 1024 * 1024;
const OVERVIEW_MAX_EDGE = 4096;
export const DETAIL_PAGE_SIZE = 256;
const DETAIL_PAGE_CAPACITY = 96;

const VERTEX_SOURCE = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
uniform mat3 uCamera;
uniform vec2 uWorldSize;
out vec2 vWorldPos;
void main() {
  vec3 clip = uCamera * vec3(aPos, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  vWorldPos = aPos;
}`;

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
precision highp usampler2D;
in vec2 vWorldPos;
uniform highp usampler2D uTerrain;
uniform highp usampler2D uTiles;
uniform highp usampler2DArray uDetailTerrain;
uniform highp usampler2DArray uDetailTiles;
uniform highp usampler2D uPageTable;
uniform sampler2D uPalette;
uniform ivec2 uRasterSize;
uniform ivec2 uPageGrid;
uniform vec2 uWorldSize;
uniform uint uHighlightOwner;
uniform float uTerritoryAlpha;
out vec4 outColor;

vec3 terrainColor(uint t) {
  bool land = (t & 128u) != 0u;
  if (!land) return vec3(0.255, 0.518, 0.690);
  uint magnitude = t & 31u;
  if (magnitude >= 31u) return vec3(0.267, 0.267, 0.267);
  if (magnitude < 10u) return vec3(0.694, 0.788, 0.541);
  if (magnitude < 20u) return vec3(0.588, 0.680, 0.455);
  return vec3(0.465, 0.533, 0.376);
}

ivec2 overviewPos(ivec2 world) {
  vec2 uv = (vec2(world) + vec2(0.5)) / uWorldSize;
  return clamp(ivec2(uv * vec2(uRasterSize)), ivec2(0), uRasterSize - ivec2(1));
}

uint detailLayer(ivec2 world) {
  ivec2 page = world / ${DETAIL_PAGE_SIZE};
  if (any(lessThan(page, ivec2(0))) || any(greaterThanEqual(page, uPageGrid))) return 0u;
  return texelFetch(uPageTable, page, 0).r;
}

uint terrainAt(ivec2 world) {
  uint layer = detailLayer(world);
  if (layer != 0u) {
    ivec2 local = world - (world / ${DETAIL_PAGE_SIZE}) * ${DETAIL_PAGE_SIZE};
    return texelFetch(uDetailTerrain, ivec3(local, int(layer - 1u)), 0).r;
  }
  return texelFetch(uTerrain, overviewPos(world), 0).r;
}

uint tileAt(ivec2 world) {
  uint layer = detailLayer(world);
  if (layer != 0u) {
    ivec2 local = world - (world / ${DETAIL_PAGE_SIZE}) * ${DETAIL_PAGE_SIZE};
    return texelFetch(uDetailTiles, ivec3(local, int(layer - 1u)), 0).r;
  }
  return texelFetch(uTiles, overviewPos(world), 0).r;
}

uint ownerAt(ivec2 world) {
  world = clamp(world, ivec2(0), ivec2(uWorldSize) - ivec2(1));
  return tileAt(world) & 4095u;
}

void main() {
  ivec2 world = clamp(ivec2(vWorldPos), ivec2(0), ivec2(uWorldSize) - ivec2(1));
  uint terrain = terrainAt(world);
  uint tile = tileAt(world);
  uint owner = tile & 4095u;
  vec3 color = terrainColor(terrain);
  if (owner != 0u) {
    vec3 territory = texelFetch(uPalette, ivec2(int(owner), 0), 0).rgb;
    if (owner == uHighlightOwner) territory = mix(territory, vec3(1.0), 0.22);
    color = mix(color, territory, uTerritoryAlpha);
    bool border = ownerAt(world + ivec2(1, 0)) != owner ||
                  ownerAt(world + ivec2(-1, 0)) != owner ||
                  ownerAt(world + ivec2(0, 1)) != owner ||
                  ownerAt(world + ivec2(0, -1)) != owner;
    if (border) color *= 0.56;
  }
  if ((tile & 8192u) != 0u) color = mix(color, vec3(0.20, 0.17, 0.15), 0.72);
  outColor = vec4(color, 1.0);
}`;

export interface OverviewRasterSize {
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}

export function chooseOverviewRasterSize(
  worldWidth: number,
  worldHeight: number,
): OverviewRasterSize {
  const scaleForBudget = Math.sqrt(
    (worldWidth * worldHeight) / OVERVIEW_TEXEL_BUDGET,
  );
  const scaleForEdge = Math.max(
    worldWidth / OVERVIEW_MAX_EDGE,
    worldHeight / OVERVIEW_MAX_EDGE,
  );
  const scale = Math.max(1, scaleForBudget, scaleForEdge);
  const width = Math.max(1, Math.ceil(worldWidth / scale));
  const height = Math.max(1, Math.ceil(worldHeight / scale));
  return {
    width,
    height,
    scaleX: worldWidth / width,
    scaleY: worldHeight / height,
  };
}

/**
 * Fixed-budget whole-world LOD. Logical coordinates remain exact; only the
 * raster backing the distant overview is bounded. Camera-local exact pages
 * can therefore be overlaid later without changing inputs or simulation.
 */
export class OverviewMapPass {
  readonly raster: OverviewRasterSize;
  private readonly terrain: Uint8Array;
  private readonly tiles: Uint16Array;
  private readonly terrainTex: WebGLTexture;
  private readonly tileTex: WebGLTexture;
  private readonly detailTerrainTex: WebGLTexture;
  private readonly detailTileTex: WebGLTexture;
  private readonly pageTableTex: WebGLTexture;
  private readonly pageTable: Uint16Array;
  private readonly pageGridWidth: number;
  private readonly pageGridHeight: number;
  private readonly detailCapacity: number;
  private readonly resident = new Map<number, { slot: number; used: number }>();
  private clock = 0;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly uCamera: WebGLUniformLocation;
  private readonly uHighlightOwner: WebGLUniformLocation;
  private highlightOwner = 0;
  private pendingCells = new Set<number>();
  private fullUploadPending = true;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly map: GameMap,
    private readonly paletteTex: WebGLTexture,
    settings: RenderSettings,
  ) {
    this.raster = chooseOverviewRasterSize(map.width(), map.height());
    this.terrain = new Uint8Array(this.raster.width * this.raster.height);
    this.tiles = new Uint16Array(this.raster.width * this.raster.height);
    this.rebuildCpuRaster();

    this.terrainTex = createTexture2D(gl, {
      width: this.raster.width,
      height: this.raster.height,
      internalFormat: gl.R8UI,
      format: gl.RED_INTEGER,
      type: gl.UNSIGNED_BYTE,
      data: this.terrain,
      filter: gl.NEAREST,
    });
    this.tileTex = createTexture2D(gl, {
      width: this.raster.width,
      height: this.raster.height,
      internalFormat: gl.R16UI,
      format: gl.RED_INTEGER,
      type: gl.UNSIGNED_SHORT,
      data: this.tiles,
      filter: gl.NEAREST,
    });
    this.pageGridWidth = Math.ceil(map.width() / DETAIL_PAGE_SIZE);
    this.pageGridHeight = Math.ceil(map.height() / DETAIL_PAGE_SIZE);
    this.pageTable = new Uint16Array(
      this.pageGridWidth * this.pageGridHeight,
    );
    this.detailCapacity = Math.max(
      1,
      Math.min(
        DETAIL_PAGE_CAPACITY,
        Number(gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS)),
      ),
    );
    this.detailTerrainTex = this.createArrayTexture(
      gl.R8UI,
      gl.RED_INTEGER,
      gl.UNSIGNED_BYTE,
    );
    this.detailTileTex = this.createArrayTexture(
      gl.R16UI,
      gl.RED_INTEGER,
      gl.UNSIGNED_SHORT,
    );
    this.pageTableTex = createTexture2D(gl, {
      width: this.pageGridWidth,
      height: this.pageGridHeight,
      internalFormat: gl.R16UI,
      format: gl.RED_INTEGER,
      type: gl.UNSIGNED_SHORT,
      data: this.pageTable,
      filter: gl.NEAREST,
    });
    this.program = createProgram(gl, VERTEX_SOURCE, FRAGMENT_SOURCE);
    this.vao = createMapQuad(gl, map.width(), map.height());
    this.uCamera = gl.getUniformLocation(this.program, "uCamera")!;
    this.uHighlightOwner = gl.getUniformLocation(
      this.program,
      "uHighlightOwner",
    )!;
    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, "uTerrain"), 0);
    gl.uniform1i(gl.getUniformLocation(this.program, "uTiles"), 1);
    gl.uniform1i(gl.getUniformLocation(this.program, "uPalette"), 2);
    gl.uniform1i(gl.getUniformLocation(this.program, "uDetailTerrain"), 3);
    gl.uniform1i(gl.getUniformLocation(this.program, "uDetailTiles"), 4);
    gl.uniform1i(gl.getUniformLocation(this.program, "uPageTable"), 5);
    gl.uniform2f(
      gl.getUniformLocation(this.program, "uWorldSize"),
      map.width(),
      map.height(),
    );
    gl.uniform2i(
      gl.getUniformLocation(this.program, "uRasterSize"),
      this.raster.width,
      this.raster.height,
    );
    gl.uniform2i(
      gl.getUniformLocation(this.program, "uPageGrid"),
      this.pageGridWidth,
      this.pageGridHeight,
    );
    gl.uniform1f(
      gl.getUniformLocation(this.program, "uTerritoryAlpha"),
      settings.mapOverlay.territoryAlpha,
    );
  }

  rebuild(): void {
    this.rebuildCpuRaster();
    this.pendingCells.clear();
    this.fullUploadPending = true;
  }

  applyChangedTiles(refs: readonly number[]): void {
    const worldW = this.map.width();
    for (const ref of refs) {
      if (!this.map.isValidRef(ref)) continue;
      const x = ref % worldW;
      const y = (ref - x) / worldW;
      const rx = Math.min(
        this.raster.width - 1,
        Math.floor(x / this.raster.scaleX),
      );
      const ry = Math.min(
        this.raster.height - 1,
        Math.floor(y / this.raster.scaleY),
      );
      const index = ry * this.raster.width + rx;
      this.sampleCell(rx, ry, index);
      this.pendingCells.add(index);
      this.uploadResidentTile(ref, x, y);
    }
  }

  /**
   * Keep exact pages for the visible camera footprint plus one-page prefetch.
   * At whole-world zoom the fixed overview remains active; once the footprint
   * fits the cache, native-resolution tiles replace it page by page.
   */
  updateCamera(
    centerX: number,
    centerY: number,
    zoom: number,
    viewportWidth: number,
    viewportHeight: number,
  ): void {
    if (zoom <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return;
    const halfW = viewportWidth / (2 * zoom);
    const halfH = viewportHeight / (2 * zoom);
    const minPageX = Math.max(
      0,
      Math.floor((centerX - halfW) / DETAIL_PAGE_SIZE) - 1,
    );
    const maxPageX = Math.min(
      this.pageGridWidth - 1,
      Math.floor((centerX + halfW) / DETAIL_PAGE_SIZE) + 1,
    );
    const minPageY = Math.max(
      0,
      Math.floor((centerY - halfH) / DETAIL_PAGE_SIZE) - 1,
    );
    const maxPageY = Math.min(
      this.pageGridHeight - 1,
      Math.floor((centerY + halfH) / DETAIL_PAGE_SIZE) + 1,
    );
    const count =
      (maxPageX - minPageX + 1) * (maxPageY - minPageY + 1);
    if (count > this.detailCapacity) return;
    for (let pageY = minPageY; pageY <= maxPageY; pageY++) {
      for (let pageX = minPageX; pageX <= maxPageX; pageX++) {
        this.ensureResident(pageX, pageY);
      }
    }
  }

  private createArrayTexture(
    internalFormat: number,
    format: number,
    type: number,
  ): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error("Unable to allocate detail page atlas");
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.texStorage3D(
      gl.TEXTURE_2D_ARRAY,
      1,
      internalFormat,
      DETAIL_PAGE_SIZE,
      DETAIL_PAGE_SIZE,
      this.detailCapacity,
    );
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  private ensureResident(pageX: number, pageY: number): void {
    const pageIndex = pageY * this.pageGridWidth + pageX;
    const existing = this.resident.get(pageIndex);
    if (existing) {
      existing.used = ++this.clock;
      return;
    }
    let slot = this.resident.size;
    if (slot >= this.detailCapacity) {
      let oldestPage = -1;
      let oldestUsed = Infinity;
      for (const [candidate, record] of this.resident) {
        if (record.used < oldestUsed) {
          oldestUsed = record.used;
          oldestPage = candidate;
          slot = record.slot;
        }
      }
      if (oldestPage >= 0) {
        this.resident.delete(oldestPage);
        this.pageTable[oldestPage] = 0;
        this.uploadPageTableEntry(oldestPage);
      }
    }

    const terrain = new Uint8Array(DETAIL_PAGE_SIZE * DETAIL_PAGE_SIZE);
    const tiles = new Uint16Array(DETAIL_PAGE_SIZE * DETAIL_PAGE_SIZE);
    const originX = pageX * DETAIL_PAGE_SIZE;
    const originY = pageY * DETAIL_PAGE_SIZE;
    const width = Math.min(DETAIL_PAGE_SIZE, this.map.width() - originX);
    const height = Math.min(DETAIL_PAGE_SIZE, this.map.height() - originY);
    for (let localY = 0; localY < height; localY++) {
      for (let localX = 0; localX < width; localX++) {
        const worldX = originX + localX;
        const ref = (originY + localY) * this.map.width() + worldX;
        const target = localY * DETAIL_PAGE_SIZE + localX;
        terrain[target] = this.map.terrainByte(ref);
        tiles[target] = this.map.tileState(ref);
      }
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.detailTerrainTex);
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      0,
      0,
      slot,
      DETAIL_PAGE_SIZE,
      DETAIL_PAGE_SIZE,
      1,
      gl.RED_INTEGER,
      gl.UNSIGNED_BYTE,
      terrain,
    );
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.detailTileTex);
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      0,
      0,
      slot,
      DETAIL_PAGE_SIZE,
      DETAIL_PAGE_SIZE,
      1,
      gl.RED_INTEGER,
      gl.UNSIGNED_SHORT,
      tiles,
    );
    this.resident.set(pageIndex, { slot, used: ++this.clock });
    this.pageTable[pageIndex] = slot + 1;
    this.uploadPageTableEntry(pageIndex);
  }

  private uploadPageTableEntry(pageIndex: number): void {
    const x = pageIndex % this.pageGridWidth;
    const y = (pageIndex - x) / this.pageGridWidth;
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.pageTableTex);
    this.gl.texSubImage2D(
      this.gl.TEXTURE_2D,
      0,
      x,
      y,
      1,
      1,
      this.gl.RED_INTEGER,
      this.gl.UNSIGNED_SHORT,
      this.pageTable.subarray(pageIndex, pageIndex + 1),
    );
  }

  private uploadResidentTile(ref: number, x: number, y: number): void {
    const pageX = Math.floor(x / DETAIL_PAGE_SIZE);
    const pageY = Math.floor(y / DETAIL_PAGE_SIZE);
    const record = this.resident.get(pageY * this.pageGridWidth + pageX);
    if (!record) return;
    const localX = x - pageX * DETAIL_PAGE_SIZE;
    const localY = y - pageY * DETAIL_PAGE_SIZE;
    const terrain = new Uint8Array([this.map.terrainByte(ref)]);
    const tile = new Uint16Array([this.map.tileState(ref)]);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.detailTerrainTex);
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      localX,
      localY,
      record.slot,
      1,
      1,
      1,
      gl.RED_INTEGER,
      gl.UNSIGNED_BYTE,
      terrain,
    );
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.detailTileTex);
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      localX,
      localY,
      record.slot,
      1,
      1,
      1,
      gl.RED_INTEGER,
      gl.UNSIGNED_SHORT,
      tile,
    );
    record.used = ++this.clock;
  }

  applyTerrainDelta(refs: readonly number[]): void {
    this.applyChangedTiles(refs);
  }

  setHighlightOwner(owner: number): void {
    this.highlightOwner = owner;
  }

  private rebuildCpuRaster(): void {
    let index = 0;
    for (let y = 0; y < this.raster.height; y++) {
      for (let x = 0; x < this.raster.width; x++, index++) {
        this.sampleCell(x, y, index);
      }
    }
  }

  private sampleCell(rx: number, ry: number, index: number): void {
    const worldX = Math.min(
      this.map.width() - 1,
      Math.floor((rx + 0.5) * this.raster.scaleX),
    );
    const worldY = Math.min(
      this.map.height() - 1,
      Math.floor((ry + 0.5) * this.raster.scaleY),
    );
    const ref = worldY * this.map.width() + worldX;
    this.terrain[index] = this.map.terrainByte(ref);
    this.tiles[index] = this.map.tileState(ref);
  }

  private flush(): void {
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (this.fullUploadPending) {
      gl.bindTexture(gl.TEXTURE_2D, this.terrainTex);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        this.raster.width,
        this.raster.height,
        gl.RED_INTEGER,
        gl.UNSIGNED_BYTE,
        this.terrain,
      );
      gl.bindTexture(gl.TEXTURE_2D, this.tileTex);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        this.raster.width,
        this.raster.height,
        gl.RED_INTEGER,
        gl.UNSIGNED_SHORT,
        this.tiles,
      );
      this.fullUploadPending = false;
      return;
    }
    if (this.pendingCells.size === 0) return;
    const terrainOne = new Uint8Array(1);
    const tileOne = new Uint16Array(1);
    for (const index of this.pendingCells) {
      const x = index % this.raster.width;
      const y = (index - x) / this.raster.width;
      terrainOne[0] = this.terrain[index];
      tileOne[0] = this.tiles[index];
      gl.bindTexture(gl.TEXTURE_2D, this.terrainTex);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        x,
        y,
        1,
        1,
        gl.RED_INTEGER,
        gl.UNSIGNED_BYTE,
        terrainOne,
      );
      gl.bindTexture(gl.TEXTURE_2D, this.tileTex);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        x,
        y,
        1,
        1,
        gl.RED_INTEGER,
        gl.UNSIGNED_SHORT,
        tileOne,
      );
    }
    this.pendingCells.clear();
  }

  draw(camera: Float32Array): void {
    this.flush();
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uCamera, false, camera);
    gl.uniform1ui(this.uHighlightOwner, this.highlightOwner);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.terrainTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tileTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.detailTerrainTex);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.detailTileTex);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.pageTableTex);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  dispose(): void {
    this.gl.deleteTexture(this.terrainTex);
    this.gl.deleteTexture(this.tileTex);
    this.gl.deleteTexture(this.detailTerrainTex);
    this.gl.deleteTexture(this.detailTileTex);
    this.gl.deleteTexture(this.pageTableTex);
    this.gl.deleteProgram(this.program);
    this.gl.deleteVertexArray(this.vao);
  }
}
