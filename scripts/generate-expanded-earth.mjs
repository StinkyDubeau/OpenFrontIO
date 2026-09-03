import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function integerArg(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

const scale = integerArg("scale", 2);
const pageSize = integerArg("page-size", 1024);
const sourceName = "giantworldmap";
const outputName = "expandedgiantworld";
const sourceDir = join(repo, "resources", "maps", sourceName);
const outputDir = join(repo, "resources", "maps", outputName);
const pagesDir = join(outputDir, "pages");

const sourceManifest = JSON.parse(
  readFileSync(join(sourceDir, "manifest.json"), "utf8"),
);
const source = readFileSync(join(sourceDir, "map.bin"));
const sourceWidth = sourceManifest.map.width;
const sourceHeight = sourceManifest.map.height;
if (source.length !== sourceWidth * sourceHeight) {
  throw new Error("Giant Earth map.bin does not match its manifest dimensions");
}

const width = sourceWidth * scale;
const height = sourceHeight * scale;
const pagesWide = Math.ceil(width / pageSize);
const pagesHigh = Math.ceil(height / pageSize);

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(pagesDir, { recursive: true });

const pages = [];
for (let pageY = 0; pageY < pagesHigh; pageY++) {
  for (let pageX = 0; pageX < pagesWide; pageX++) {
    const pageWidth = Math.min(pageSize, width - pageX * pageSize);
    const pageHeight = Math.min(pageSize, height - pageY * pageSize);
    const page = Buffer.allocUnsafe(pageWidth * pageHeight);
    const originX = pageX * pageSize;
    const originY = pageY * pageSize;

    for (let localY = 0; localY < pageHeight; localY++) {
      const sourceY = Math.floor((originY + localY) / scale);
      const sourceRow = sourceY * sourceWidth;
      const outputRow = localY * pageWidth;
      for (let localX = 0; localX < pageWidth; localX++) {
        const sourceX = Math.floor((originX + localX) / scale);
        page[outputRow + localX] = source[sourceRow + sourceX];
      }
    }

    const fileName = `${pageX}-${pageY}.bin`;
    writeFileSync(join(pagesDir, fileName), page);
    pages.push({
      x: pageX,
      y: pageY,
      width: pageWidth,
      height: pageHeight,
      path: `pages/${fileName}`,
      byte_length: page.length,
      sha256: createHash("sha256").update(page).digest("hex"),
    });
  }
}

function scaleCoordinates(entries = []) {
  return entries.map((entry) => ({
    ...entry,
    coordinates: entry.coordinates?.map((coordinate) => coordinate * scale),
  }));
}

function scaleSpawnAreas(groups) {
  if (!groups) return undefined;
  return Object.fromEntries(
    Object.entries(groups).map(([key, areas]) => [
      key,
      areas.map((area) => ({
        x: area.x * scale,
        y: area.y * scale,
        width: area.width * scale,
        height: area.height * scale,
      })),
    ]),
  );
}

const manifest = {
  ...sourceManifest,
  id: "ExpandedGiantWorld",
  name: "Expanded Earth",
  translation_key: "map.expandedgiantworld",
  multiplayer_frequency: 0,
  map: {
    format: "paged-v1",
    width,
    height,
    num_land_tiles: sourceManifest.map.num_land_tiles * scale * scale,
    page_size: pageSize,
    pages_wide: pagesWide,
    pages_high: pagesHigh,
    pages,
  },
  // The normal renderer/pathfinder LOD is one half the linear world size.
  map4x: sourceManifest.map,
  map16x: sourceManifest.map4x,
  nations: scaleCoordinates(sourceManifest.nations),
  additionalNations: scaleCoordinates(sourceManifest.additionalNations),
  teamGameSpawnAreas: scaleSpawnAreas(sourceManifest.teamGameSpawnAreas),
};

writeFileSync(
  join(outputDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
copyFileSync(join(sourceDir, "map.bin"), join(outputDir, "map4x.bin"));
copyFileSync(join(sourceDir, "map4x.bin"), join(outputDir, "map16x.bin"));
copyFileSync(
  join(sourceDir, "thumbnail.webp"),
  join(outputDir, "thumbnail.webp"),
);

console.log(
  `Expanded Earth: ${width}x${height}, ${pagesWide}x${pagesHigh} pages, scale ${scale}x`,
);
