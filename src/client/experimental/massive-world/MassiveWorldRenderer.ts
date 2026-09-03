import {
  MASSIVE_WORLD_COLUMNS,
  MASSIVE_WORLD_ROWS,
  MassiveWorldModel,
} from "./MassiveWorldModel";

const VERTEX_SHADER = `#version 300 es
precision highp float;
const vec2 POSITIONS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);
void main() {
  gl_Position = vec4(POSITIONS[gl_VertexID], 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp usampler2D;

uniform vec2 u_resolution;
uniform vec2 u_camera;
uniform float u_zoom;
uniform float u_time;
uniform ivec2 u_grid;
uniform ivec2 u_selected;
uniform ivec2 u_attack_sector;
uniform float u_attack_age;
uniform sampler2D u_state;

out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float inverseSmoothstep(float inner, float outer, float value) {
  return 1.0 - smoothstep(inner, outer, value);
}

vec4 stateAt(ivec2 coordinate) {
  return texelFetch(u_state, clamp(coordinate, ivec2(0), u_grid - 1), 0);
}

float ownerFromState(vec4 state) {
  return floor(state.r * 255.0 + 0.5) + floor(state.g * 255.0 + 0.5) * 256.0;
}

float terrainFromState(vec4 state) {
  return mod(floor(state.a * 255.0 + 0.5), 4.0);
}

bool sameRegion(vec4 first, vec4 second) {
  return ownerFromState(first) == ownerFromState(second) &&
    terrainFromState(first) == terrainFromState(second);
}

vec3 botColor(float owner) {
  float phase = fract(owner * 0.61803398875);
  return 0.49 + 0.21 * cos(6.2831853 * (phase + vec3(0.03, 0.37, 0.69)));
}

float lineDistance(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 screen = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  vec2 world = (screen - u_resolution * 0.5) / u_zoom + u_camera;
  ivec2 sector = ivec2(floor(world));
  if (sector.x < 0 || sector.y < 0 || sector.x >= u_grid.x || sector.y >= u_grid.y) {
    float vignette = 0.76 + 0.24 * inverseSmoothstep(0.2, 0.9, length(screen / u_resolution - 0.5));
    outColor = vec4(vec3(0.012, 0.022, 0.019) * vignette, 1.0);
    return;
  }

  vec4 state = stateAt(sector);
  float owner = ownerFromState(state);
  float strength = state.b;
  float metadata = floor(state.a * 255.0 + 0.5);
  float terrain = terrainFromState(state);
  bool player = metadata >= 4.0;
  vec2 local = fract(world);
  vec2 pixelLocal = floor(local * vec2(96.0, 56.0)) / vec2(96.0, 56.0);
  float grain = hash21(pixelLocal + vec2(sector) * 11.73);
  float onePixel = 1.0 / max(u_zoom, 1.0);
  float closeDetail = smoothstep(18.0, 54.0, u_zoom);

  vec3 color;
  if (terrain < 0.5) {
    float wave = sin((world.x * 17.0 + world.y * 9.0) + u_time * 0.42) * 0.5 + 0.5;
    color = mix(vec3(0.055, 0.19, 0.27), vec3(0.09, 0.31, 0.41), wave * 0.34);
    color *= 0.86 + grain * 0.12;
    float lane = abs(fract((world.x + world.y * 0.57) * 3.0 - u_time * 0.018) - 0.5);
    color += vec3(0.08, 0.16, 0.18) * inverseSmoothstep(0.46, 0.49, lane) * 0.25;
  } else {
    vec3 ownership = player
      ? vec3(0.18, 0.67, 0.48)
      : mix(botColor(owner), vec3(0.32, 0.34, 0.27), 0.22);
    float relief = 0.78 + grain * 0.18 + strength * 0.12;
    color = ownership * relief;

    vec2 micro = fract(local * vec2(8.0, 5.0));
    float microBorder = min(min(micro.x, 1.0 - micro.x), min(micro.y, 1.0 - micro.y));
    float microCells = mix(0.72, 1.0, smoothstep(onePixel * 0.6, onePixel * 1.8, microBorder));
    color *= mix(1.0, microCells, closeDetail);

    vec2 city = vec2(
      0.24 + hash21(vec2(sector) + 3.1) * 0.52,
      0.23 + hash21(vec2(sector.yx) + 7.4) * 0.54
    );
    float road = lineDistance(local, vec2(0.5), city);
    float roadInk = inverseSmoothstep(onePixel * 0.55, onePixel * 1.8, road) * closeDetail;
    color = mix(color, color * 0.58, roadInk);
    float cityDistance = length(local - city);
    float cityInk = inverseSmoothstep(
      max(0.014, onePixel * 1.2),
      max(0.035, onePixel * 3.6),
      cityDistance
    ) * smoothstep(9.0, 24.0, u_zoom);
    color = mix(
      color,
      player ? vec3(1.0, 0.86, 0.39) : vec3(0.94, 0.89, 0.72),
      cityInk
    );

    if (terrain > 1.5) {
      float riverY = 0.52 + sin(local.x * 8.0 + float(sector.x - sector.y)) * 0.105;
      float river = abs(local.y - riverY);
      color = mix(
        color,
        vec3(0.08, 0.36, 0.49),
        inverseSmoothstep(onePixel * 0.8, onePixel * 2.6, river)
      );
    }
  }

  float edge = min(min(local.x, 1.0 - local.x), min(local.y, 1.0 - local.y));
  float borderWidth = clamp(onePixel * 0.45, 0.003, 0.035);
  vec3 borderColor = player ? vec3(1.0, 0.78, 0.28) : vec3(0.025, 0.045, 0.038);
  float borderOuter = borderWidth * 2.25;
  float borderAlpha = 0.0;
  if (!sameRegion(state, stateAt(sector + ivec2(-1, 0)))) {
    borderAlpha = max(borderAlpha, inverseSmoothstep(borderWidth, borderOuter, local.x));
  }
  if (!sameRegion(state, stateAt(sector + ivec2(1, 0)))) {
    borderAlpha = max(borderAlpha, inverseSmoothstep(borderWidth, borderOuter, 1.0 - local.x));
  }
  if (!sameRegion(state, stateAt(sector + ivec2(0, -1)))) {
    borderAlpha = max(borderAlpha, inverseSmoothstep(borderWidth, borderOuter, local.y));
  }
  if (!sameRegion(state, stateAt(sector + ivec2(0, 1)))) {
    borderAlpha = max(borderAlpha, inverseSmoothstep(borderWidth, borderOuter, 1.0 - local.y));
  }
  color = mix(color, borderColor, borderAlpha);

  if (all(equal(sector, u_selected))) {
    float selection = inverseSmoothstep(borderWidth * 1.5, borderWidth * 4.8, edge);
    color = mix(color, vec3(1.0, 0.91, 0.56), selection * (0.72 + sin(u_time * 4.0) * 0.12));
  }

  if (all(equal(sector, u_attack_sector)) && u_attack_age >= 0.0 && u_attack_age < 1.15) {
    float ringRadius = u_attack_age * 0.72;
    float ring = abs(length(local - 0.5) - ringRadius);
    float ringAlpha = inverseSmoothstep(0.008, 0.045, ring) * (1.0 - u_attack_age / 1.15);
    color = mix(color, vec3(1.0, 0.43, 0.22), ringAlpha);
  }

  vec2 uv = screen / u_resolution;
  float vignette = inverseSmoothstep(0.25, 0.78, length(uv - 0.5));
  color *= 0.78 + vignette * 0.22;
  outColor = vec4(color, 1.0);
}`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to allocate shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to allocate WebGL program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "Unknown link error";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

export class MassiveWorldRenderer {
  private readonly gl: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private texture!: WebGLTexture;
  private resolutionLocation!: WebGLUniformLocation;
  private cameraLocation!: WebGLUniformLocation;
  private zoomLocation!: WebGLUniformLocation;
  private timeLocation!: WebGLUniformLocation;
  private gridLocation!: WebGLUniformLocation;
  private selectedLocation!: WebGLUniformLocation;
  private attackSectorLocation!: WebGLUniformLocation;
  private attackAgeLocation!: WebGLUniformLocation;
  private animationFrame: number | null = null;
  private wantsAnimation = false;
  private contextLost = false;
  private destroyed = false;
  private startedAt = performance.now();
  private attackStartedAt = 0;
  private attackSector = { x: -1, y: -1 };
  private model: MassiveWorldModel;

  cameraX = MASSIVE_WORLD_COLUMNS / 2;
  cameraY = MASSIVE_WORLD_ROWS / 2;
  zoom = 12;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    model: MassiveWorldModel,
    private readonly onContextStatus: (message: string | null) => void = () =>
      undefined,
  ) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("This preview requires WebGL 2");
    this.gl = gl;
    this.model = model;
    this.createResources();
    canvas.addEventListener("webglcontextlost", this.handleContextLost, false);
    canvas.addEventListener(
      "webglcontextrestored",
      this.handleContextRestored,
      false,
    );
  }

  private createResources(): void {
    const gl = this.gl;
    this.program = createProgram(gl);
    const texture = gl.createTexture();
    if (!texture) throw new Error("Unable to allocate world-state texture");
    this.texture = texture;

    const uniform = (name: string): WebGLUniformLocation => {
      const location = gl.getUniformLocation(this.program, name);
      if (!location) throw new Error(`Missing shader uniform ${name}`);
      return location;
    };
    this.resolutionLocation = uniform("u_resolution");
    this.cameraLocation = uniform("u_camera");
    this.zoomLocation = uniform("u_zoom");
    this.timeLocation = uniform("u_time");
    this.gridLocation = uniform("u_grid");
    this.selectedLocation = uniform("u_selected");
    this.attackSectorLocation = uniform("u_attack_sector");
    this.attackAgeLocation = uniform("u_attack_age");

    gl.useProgram(this.program);
    gl.uniform1i(uniform("u_state"), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.uploadState();
  }

  start(): void {
    this.wantsAnimation = true;
    if (this.animationFrame !== null || this.contextLost || this.destroyed) {
      return;
    }
    this.constrainCamera();
    this.startedAt = performance.now();
    const draw = () => {
      if (!this.wantsAnimation || this.contextLost || this.destroyed) {
        this.animationFrame = null;
        return;
      }
      this.draw();
      this.animationFrame = requestAnimationFrame(draw);
    };
    this.animationFrame = requestAnimationFrame(draw);
  }

  stop(): void {
    this.wantsAnimation = false;
    this.cancelScheduledFrame();
  }

  suspend(): void {
    this.stop();
  }

  resume(): void {
    this.start();
  }

  destroy(): void {
    this.stop();
    this.destroyed = true;
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener(
      "webglcontextrestored",
      this.handleContextRestored,
    );
    if (!this.contextLost) {
      this.gl.deleteTexture(this.texture);
      this.gl.deleteProgram(this.program);
    }
  }

  fit(): void {
    const width = Math.max(this.canvas.clientWidth, 1);
    const height = Math.max(this.canvas.clientHeight, 1);
    this.zoom = Math.max(
      3,
      Math.max(width / MASSIVE_WORLD_COLUMNS, height / MASSIVE_WORLD_ROWS) *
        1.08,
    );
    const capital = this.model.coordinates(this.model.capitalIndex);
    this.cameraX = capital.x + 0.5;
    this.cameraY = capital.y + 0.5;
    this.constrainCamera(width, height);
  }

  updateState(model: MassiveWorldModel): void {
    this.model = model;
    if (this.contextLost || this.destroyed) return;
    this.uploadState();
  }

  private uploadState(): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      MASSIVE_WORLD_COLUMNS,
      MASSIVE_WORLD_ROWS,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.model.rendererState(),
    );
  }

  focus(index: number, close = false): void {
    const { x, y } = this.model.coordinates(index);
    this.cameraX = x + 0.5;
    this.cameraY = y + 0.5;
    if (close) this.zoom = Math.max(this.zoom, 74);
    this.constrainCamera();
  }

  pulseAttack(index: number): void {
    this.attackSector = this.model.coordinates(index);
    this.attackStartedAt = performance.now();
  }

  pan(screenDeltaX: number, screenDeltaY: number): void {
    this.cameraX -= screenDeltaX / this.zoom;
    this.cameraY -= screenDeltaY / this.zoom;
    this.constrainCamera();
  }

  zoomAt(factor: number, clientX: number, clientY: number): void {
    const before = this.worldAt(clientX, clientY);
    this.zoom = Math.max(3, Math.min(180, this.zoom * factor));
    const after = this.worldAt(clientX, clientY);
    this.cameraX += before.x - after.x;
    this.cameraY += before.y - after.y;
    this.constrainCamera();
  }

  worldAt(clientX: number, clientY: number): { x: number; y: number } {
    const bounds = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - bounds.left - bounds.width / 2) / this.zoom + this.cameraX,
      y: (clientY - bounds.top - bounds.height / 2) / this.zoom + this.cameraY,
    };
  }

  sectorAt(clientX: number, clientY: number): { x: number; y: number } | null {
    const point = this.worldAt(clientX, clientY);
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    return this.model.isValidCoordinate(x, y) ? { x, y } : null;
  }

  private constrainCamera(
    viewportWidth = Math.max(this.canvas.clientWidth, 1),
    viewportHeight = Math.max(this.canvas.clientHeight, 1),
  ): void {
    const halfViewportWidth = viewportWidth / (2 * this.zoom);
    const halfViewportHeight = viewportHeight / (2 * this.zoom);
    this.cameraX = this.constrainAxis(
      this.cameraX,
      MASSIVE_WORLD_COLUMNS,
      halfViewportWidth,
    );
    this.cameraY = this.constrainAxis(
      this.cameraY,
      MASSIVE_WORLD_ROWS,
      halfViewportHeight,
    );
  }

  private constrainAxis(
    center: number,
    worldSize: number,
    halfViewport: number,
  ): number {
    if (halfViewport >= worldSize / 2) return worldSize / 2;
    return Math.max(halfViewport, Math.min(worldSize - halfViewport, center));
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const clientWidth = Math.max(this.canvas.clientWidth, 1);
    const clientHeight = Math.max(this.canvas.clientHeight, 1);
    const width = Math.max(1, Math.floor(clientWidth * dpr));
    const height = Math.max(1, Math.floor(clientHeight * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.constrainCamera(clientWidth, clientHeight);
    }
    this.gl.viewport(0, 0, width, height);
  }

  private draw(): void {
    if (this.contextLost || this.destroyed) return;
    this.resize();
    const gl = this.gl;
    const selected = this.model.coordinates(this.model.selectedIndex);
    const now = performance.now();
    gl.useProgram(this.program);
    gl.uniform2f(
      this.resolutionLocation,
      this.canvas.width,
      this.canvas.height,
    );
    gl.uniform2f(this.cameraLocation, this.cameraX, this.cameraY);
    gl.uniform1f(
      this.zoomLocation,
      this.zoom * (this.canvas.width / Math.max(this.canvas.clientWidth, 1)),
    );
    gl.uniform1f(this.timeLocation, (now - this.startedAt) / 1000);
    gl.uniform2i(this.gridLocation, MASSIVE_WORLD_COLUMNS, MASSIVE_WORLD_ROWS);
    gl.uniform2i(this.selectedLocation, selected.x, selected.y);
    gl.uniform2i(
      this.attackSectorLocation,
      this.attackSector.x,
      this.attackSector.y,
    );
    gl.uniform1f(this.attackAgeLocation, (now - this.attackStartedAt) / 1000);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private cancelScheduledFrame(): void {
    if (this.animationFrame === null) return;
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
  }

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.cancelScheduledFrame();
    this.onContextStatus(
      "Map graphics paused while this device restores them.",
    );
  };

  private readonly handleContextRestored = (): void => {
    if (this.destroyed) return;
    try {
      this.createResources();
      this.contextLost = false;
      this.onContextStatus(null);
      if (this.wantsAnimation) this.start();
    } catch (error) {
      this.contextLost = true;
      console.error("Unable to restore massive-world renderer", error);
      this.onContextStatus(
        error instanceof Error
          ? `Map graphics could not recover: ${error.message}`
          : "Map graphics could not recover.",
      );
    }
  };
}
