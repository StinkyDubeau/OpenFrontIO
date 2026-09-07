export type DebugPlaytestPreset = "great-lakes" | "enormous-earth";

export const DEBUG_QUICK_START_PREFIX =
  "Server playtest - Great Lakes - Trade 5x - Trains 5x - Attack 15x slower - ";
export const DEBUG_ENORMOUS_EARTH_PREFIX =
  "Server playtest - Enormous Earth - Trade 5x - Trains 5x - Attack 15x slower - ";

export const DEBUG_QUICK_START_TRADE_MULTIPLIER = 5;
export const DEBUG_QUICK_START_TRAIN_MULTIPLIER = 5;
export const DEBUG_QUICK_START_ATTACK_SPEED_DIVISOR = 15;

export function debugPlaytestPrefix(preset: DebugPlaytestPreset): string {
  return preset === "great-lakes"
    ? DEBUG_QUICK_START_PREFIX
    : DEBUG_ENORMOUS_EARTH_PREFIX;
}

export function debugPlaytestLabel(preset: DebugPlaytestPreset): string {
  return preset === "great-lakes" ? "Great Lakes" : "Enormous Earth";
}

export function debugPlaytestPresetForWorldName(
  name: string,
): DebugPlaytestPreset | null {
  if (name.startsWith(DEBUG_QUICK_START_PREFIX)) return "great-lakes";
  if (name.startsWith(DEBUG_ENORMOUS_EARTH_PREFIX)) return "enormous-earth";
  return null;
}

export function isDebugQuickStartWorldName(
  name: string,
  preset?: DebugPlaytestPreset,
): boolean {
  const detected = debugPlaytestPresetForWorldName(name);
  return preset === undefined ? detected !== null : detected === preset;
}
