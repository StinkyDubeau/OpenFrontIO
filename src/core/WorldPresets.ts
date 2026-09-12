import { GameMapType } from "./game/Game";

export const WORLD_PRESETS = {
  "fog-earth-27x": {
    label: "Discovery Earth · 27× (v0.2 preview)",
    map: GameMapType.PixelEarth27v1,
    trade: 5,
    trains: 5,
    attackDivisor: 1,
    fog: "v0.2",
  },
  "pixel-earth-27x": {
    label: "Pixel Earth · 27× (experimental)",
    map: GameMapType.PixelEarth27v1,
    trade: 5,
    trains: 5,
    attackDivisor: 1,
  },
  "uhd-earth-27x": {
    label: "UHD Earth · 27× (experimental)",
    map: GameMapType.ExpandedGiantWorldUHD27v1,
    trade: 5,
    trains: 5,
    attackDivisor: 1,
  },
  "scheduled-earth": {
    label: "Enormous Earth · 4×",
    map: GameMapType.ExpandedGiantWorld,
    trade: 1,
    trains: 1,
    attackDivisor: 1,
  },
  "great-lakes": {
    label: "Great Lakes",
    map: GameMapType.GreatLakes,
    trade: 10,
    trains: 10,
    attackDivisor: 1,
  },
  "enormous-earth": {
    label: "Enormous Earth · 16×",
    map: GameMapType.ExpandedGiantWorldUltra,
    trade: 5,
    trains: 5,
    attackDivisor: 1,
  },
  "hd-earth-9x": {
    label: "HD Earth · 9×",
    map: GameMapType.ExpandedGiantWorldLargeHDv1,
    trade: 5,
    trains: 5,
    attackDivisor: 1,
  },
} as const;

export type WorldPreset = keyof typeof WORLD_PRESETS;
export const CUSTOM_WORLD_PRESETS = [
  "great-lakes",
  "enormous-earth",
  "hd-earth-9x",
  "uhd-earth-27x",
  "pixel-earth-27x",
  "fog-earth-27x",
] as const;
