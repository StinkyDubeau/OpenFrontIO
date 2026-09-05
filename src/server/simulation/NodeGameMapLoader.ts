import fs from "node:fs/promises";
import path from "node:path";
import { GameMapType } from "../../core/game/Game";
import type { GameMapLoader, MapData } from "../../core/game/GameMapLoader";

export class NodeGameMapLoader implements GameMapLoader {
  constructor(private mapsDir: string) {}
  getMapData(map: GameMapType): MapData {
    const key = Object.keys(GameMapType).find(
      (k) => GameMapType[k as keyof typeof GameMapType] === map,
    );
    if (!key) throw new Error(`Unknown map: ${map}`);
    const dir = path.resolve(this.mapsDir, key.toLowerCase());
    const read = async (name: string) => {
      const file = path.resolve(dir, name);
      if (!file.startsWith(dir + path.sep))
        throw new Error("Map path escaped asset directory");
      return new Uint8Array(await fs.readFile(file));
    };
    return {
      mapBin: () => read("map.bin"),
      map4xBin: () => read("map4x.bin"),
      map16xBin: () => read("map16x.bin"),
      mapPageBin: read,
      manifest: async () =>
        JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8")),
      webpPath: path.join(dir, "thumbnail.webp"),
      layerPng: async () => {
        throw new Error("Simulation does not load visual layers");
      },
    };
  }
}
