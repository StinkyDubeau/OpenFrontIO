export type MassiveWorldDuration = "1h" | "1d" | "7d";

export const MASSIVE_WORLD_COLUMNS = 64;
export const MASSIVE_WORLD_ROWS = 32;
export const MASSIVE_WORLD_SECTORS = MASSIVE_WORLD_COLUMNS * MASSIVE_WORLD_ROWS;
export const TACTICAL_TILES_PER_SECTOR = 2_000_000;

export const enum MassiveSectorTerrain {
  Ocean = 0,
  Land = 1,
  River = 2,
}

export interface MassiveWorldPacing {
  duration: MassiveWorldDuration;
  label: string;
  commandCap: number;
  commandRegenPerWorldSecond: number;
  oceanUnlockAtMs: number;
  prototypeTimeScale: number;
  botEventIntervalMs: number;
}

export const MASSIVE_WORLD_PACING: Record<
  MassiveWorldDuration,
  MassiveWorldPacing
> = {
  "1h": {
    duration: "1h",
    label: "One hour",
    commandCap: 180,
    commandRegenPerWorldSecond: 0.105,
    oceanUnlockAtMs: 8 * 60_000,
    prototypeTimeScale: 8,
    botEventIntervalMs: 2_000,
  },
  "1d": {
    duration: "1d",
    label: "One day",
    commandCap: 240,
    commandRegenPerWorldSecond: 0.006_222_222_222_222_223,
    oceanUnlockAtMs: 3 * 60 * 60_000,
    prototypeTimeScale: 60,
    botEventIntervalMs: 30_000,
  },
  "7d": {
    duration: "7d",
    label: "One week",
    commandCap: 320,
    commandRegenPerWorldSecond: 0.001_244_444_444_444_444_5,
    oceanUnlockAtMs: 20 * 60 * 60_000,
    prototypeTimeScale: 240,
    botEventIntervalMs: 240_000,
  },
};

export interface MassiveSectorView {
  index: number;
  x: number;
  y: number;
  name: string;
  terrain: MassiveSectorTerrain;
  owner: number;
  strength: number;
  isPlayer: boolean;
  isAttackable: boolean;
  route: "held" | "border" | "river" | "ocean" | "distant";
}

export interface MassiveWorldAttackResult {
  accepted: boolean;
  captured: boolean;
  damage: number;
  commandSpent: number;
  reason?: "water-locked" | "out-of-range" | "already-held" | "no-command";
}

export interface MassiveWorldTacticalOutcome {
  outcomeId: string;
  targetIndex: number;
  result: "victory" | "defeat" | "abandoned";
  survivingForceRatio?: number;
}

export interface MassiveWorldTacticalOutcomeResult {
  accepted: boolean;
  captured: boolean;
  commandSpent: number;
  strength: number;
  reason?:
    | "invalid-outcome"
    | "tactical-loss"
    | "tactical-abandoned"
    | "already-applied"
    | "already-held"
    | "ocean-sector"
    | "unreachable";
}

export interface MassiveWorldStats {
  heldSectors: number;
  landSectors: number;
  simulatedNations: number;
  logicalTiles: number;
  command: number;
  commandCap: number;
  oceanUnlocked: boolean;
  oceanProgress: number;
  worldElapsedMs: number;
}

interface MassiveWorldSnapshot {
  version: 1;
  seed: number;
  duration: MassiveWorldDuration;
  createdAt: number;
  lastRealAt: number;
  worldElapsedMs: number;
  command: number;
  selectedIndex: number;
  capitalIndex: number;
  simulationTick: number;
  appliedTacticalOutcomeIds?: string[];
  terrain: number[];
  owners: number[];
  strengths: number[];
}

const STORAGE_PREFIX = "idlefront.experimental.massive-world.v1";
const TACTICAL_OUTCOME_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const NAME_PREFIXES = [
  "Amber",
  "Ash",
  "Cinder",
  "Copper",
  "Dawn",
  "Deep",
  "Emerald",
  "Frost",
  "Glass",
  "High",
  "Iron",
  "Jade",
  "Long",
  "Mist",
  "North",
  "Quiet",
  "Red",
  "Silver",
  "South",
  "Verdant",
] as const;
const NAME_SUFFIXES = [
  "Basin",
  "Cape",
  "Coast",
  "Delta",
  "Expanse",
  "Fields",
  "Frontier",
  "Gate",
  "Hollow",
  "March",
  "Narrows",
  "Plateau",
  "Reach",
  "Rift",
  "Sound",
  "Strait",
  "Vale",
  "Wilds",
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hash32(seed: number, x: number, y: number): number {
  let value = (seed ^ Math.imul(x + 0x9e37, 0x85ebca6b)) >>> 0;
  value = (value ^ Math.imul(y + 0x7f4a, 0xc2b2ae35)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function hash01(seed: number, x: number, y: number): number {
  return hash32(seed, x, y) / 0xffffffff;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function valueNoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const a = hash01(seed, x0, y0);
  const b = hash01(seed, x0 + 1, y0);
  const c = hash01(seed, x0, y0 + 1);
  const d = hash01(seed, x0 + 1, y0 + 1);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

function continentalNoise(seed: number, x: number, y: number): number {
  let total = 0;
  let amplitude = 0.58;
  let frequency = 0.095;
  let normalizer = 0;
  for (let octave = 0; octave < 4; octave++) {
    total +=
      valueNoise(seed + octave * 1013, x * frequency, y * frequency) *
      amplitude;
    normalizer += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  const latitude = Math.abs((y / (MASSIVE_WORLD_ROWS - 1)) * 2 - 1);
  const continentalWave =
    Math.sin(x * 0.21 + seed * 0.0003) * 0.08 +
    Math.cos(y * 0.37 - x * 0.055) * 0.06;
  return total / normalizer + continentalWave - latitude * 0.19;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isTacticalOutcomeId(value: unknown): value is string {
  return typeof value === "string" && TACTICAL_OUTCOME_ID_PATTERN.test(value);
}

function isSnapshot(value: unknown): value is MassiveWorldSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MassiveWorldSnapshot>;
  if (
    candidate.duration !== "1h" &&
    candidate.duration !== "1d" &&
    candidate.duration !== "7d"
  ) {
    return false;
  }
  const pacing = MASSIVE_WORLD_PACING[candidate.duration];
  return (
    candidate.version === 1 &&
    Number.isSafeInteger(candidate.seed) &&
    (candidate.seed ?? -1) >= 0 &&
    isFiniteNumber(candidate.createdAt) &&
    candidate.createdAt >= 0 &&
    isFiniteNumber(candidate.lastRealAt) &&
    candidate.lastRealAt >= 0 &&
    isFiniteNumber(candidate.worldElapsedMs) &&
    candidate.worldElapsedMs >= 0 &&
    isFiniteNumber(candidate.command) &&
    candidate.command >= 0 &&
    candidate.command <= pacing.commandCap &&
    Number.isInteger(candidate.selectedIndex) &&
    (candidate.selectedIndex ?? -1) >= 0 &&
    (candidate.selectedIndex ?? MASSIVE_WORLD_SECTORS) <
      MASSIVE_WORLD_SECTORS &&
    Number.isInteger(candidate.capitalIndex) &&
    (candidate.capitalIndex ?? -1) >= 0 &&
    (candidate.capitalIndex ?? MASSIVE_WORLD_SECTORS) < MASSIVE_WORLD_SECTORS &&
    Number.isSafeInteger(candidate.simulationTick) &&
    (candidate.simulationTick ?? -1) >= 0 &&
    (candidate.simulationTick ?? Number.POSITIVE_INFINITY) <=
      Math.floor(candidate.worldElapsedMs / pacing.botEventIntervalMs) &&
    (candidate.appliedTacticalOutcomeIds === undefined ||
      (Array.isArray(candidate.appliedTacticalOutcomeIds) &&
        candidate.appliedTacticalOutcomeIds.length <= MASSIVE_WORLD_SECTORS &&
        candidate.appliedTacticalOutcomeIds.every(isTacticalOutcomeId) &&
        new Set(candidate.appliedTacticalOutcomeIds).size ===
          candidate.appliedTacticalOutcomeIds.length)) &&
    Array.isArray(candidate.terrain) &&
    candidate.terrain.length === MASSIVE_WORLD_SECTORS &&
    candidate.terrain.every(
      (terrain) =>
        Number.isInteger(terrain) &&
        terrain >= MassiveSectorTerrain.Ocean &&
        terrain <= MassiveSectorTerrain.River,
    ) &&
    Array.isArray(candidate.owners) &&
    candidate.owners.length === MASSIVE_WORLD_SECTORS &&
    candidate.owners.every(
      (owner) => Number.isInteger(owner) && owner >= 0 && owner <= 0xffff,
    ) &&
    Array.isArray(candidate.strengths) &&
    candidate.strengths.length === MASSIVE_WORLD_SECTORS &&
    candidate.strengths.every(
      (strength) => isFiniteNumber(strength) && strength >= 0,
    )
  );
}

export class MassiveWorldModel {
  readonly columns = MASSIVE_WORLD_COLUMNS;
  readonly rows = MASSIVE_WORLD_ROWS;
  readonly terrain: Uint8Array;
  readonly owners: Uint16Array;
  readonly strengths: Float32Array;
  readonly pacing: MassiveWorldPacing;
  readonly seed: number;
  readonly createdAt: number;
  readonly capitalIndex: number;

  command: number;
  selectedIndex: number;
  worldElapsedMs: number;
  lastRealAt: number;
  simulationTick: number;

  private readonly appliedTacticalOutcomeIds: Set<string>;

  private constructor(snapshot: MassiveWorldSnapshot) {
    this.seed = snapshot.seed;
    this.pacing = MASSIVE_WORLD_PACING[snapshot.duration];
    this.createdAt = snapshot.createdAt;
    this.lastRealAt = snapshot.lastRealAt;
    this.worldElapsedMs = snapshot.worldElapsedMs;
    this.command = snapshot.command;
    this.selectedIndex = snapshot.selectedIndex;
    this.capitalIndex = snapshot.capitalIndex;
    this.simulationTick = snapshot.simulationTick;
    this.appliedTacticalOutcomeIds = new Set(
      snapshot.appliedTacticalOutcomeIds ?? [],
    );
    this.terrain = Uint8Array.from(snapshot.terrain);
    this.owners = Uint16Array.from(snapshot.owners);
    this.strengths = Float32Array.from(snapshot.strengths);
  }

  static create(
    duration: MassiveWorldDuration = "1d",
    seed: number = Math.floor(Math.random() * 0x7fffffff),
    now: number = Date.now(),
  ): MassiveWorldModel {
    const terrain = new Array<number>(MASSIVE_WORLD_SECTORS);
    const owners = new Array<number>(MASSIVE_WORLD_SECTORS);
    const strengths = new Array<number>(MASSIVE_WORLD_SECTORS);
    let closestLand = -1;
    let closestDistance = Number.POSITIVE_INFINITY;
    const centerX = (MASSIVE_WORLD_COLUMNS - 1) / 2;
    const centerY = (MASSIVE_WORLD_ROWS - 1) / 2;

    for (let y = 0; y < MASSIVE_WORLD_ROWS; y++) {
      for (let x = 0; x < MASSIVE_WORLD_COLUMNS; x++) {
        const index = y * MASSIVE_WORLD_COLUMNS + x;
        const elevation = continentalNoise(seed, x, y);
        const land = elevation > 0.485;
        const riverSignal = Math.abs(
          Math.sin(x * 0.67 + y * 0.41 + seed * 0.00017),
        );
        terrain[index] = land
          ? riverSignal < 0.14
            ? MassiveSectorTerrain.River
            : MassiveSectorTerrain.Land
          : MassiveSectorTerrain.Ocean;
        owners[index] = land ? index + 2 : 0;
        strengths[index] = land ? 38 + hash01(seed + 17, x, y) * 72 : 0;
        if (land) {
          const distance = Math.hypot(x - centerX, (y - centerY) * 1.35);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestLand = index;
          }
        }
      }
    }

    if (closestLand < 0) {
      closestLand =
        Math.floor(MASSIVE_WORLD_ROWS / 2) * MASSIVE_WORLD_COLUMNS +
        Math.floor(MASSIVE_WORLD_COLUMNS / 2);
      terrain[closestLand] = MassiveSectorTerrain.River;
    }

    // A capital on a one-cell island leaves the demo with no legal first move.
    // Preserve the generated coast whenever it already has a frontier; only for
    // an isolated capital, turn the highest-elevation cardinal water cell into
    // one river-mouth sector. This changes the minimum possible amount of the
    // procedural continent and remains fully deterministic for a given seed.
    const capitalX = closestLand % MASSIVE_WORLD_COLUMNS;
    const capitalY = Math.floor(closestLand / MASSIVE_WORLD_COLUMNS);
    const capitalNeighbors: number[] = [];
    if (capitalX > 0) capitalNeighbors.push(closestLand - 1);
    if (capitalX + 1 < MASSIVE_WORLD_COLUMNS) {
      capitalNeighbors.push(closestLand + 1);
    }
    if (capitalY > 0) {
      capitalNeighbors.push(closestLand - MASSIVE_WORLD_COLUMNS);
    }
    if (capitalY + 1 < MASSIVE_WORLD_ROWS) {
      capitalNeighbors.push(closestLand + MASSIVE_WORLD_COLUMNS);
    }
    if (
      !capitalNeighbors.some(
        (index) => terrain[index] !== MassiveSectorTerrain.Ocean,
      )
    ) {
      let frontierIndex = capitalNeighbors[0];
      let frontierElevation = Number.NEGATIVE_INFINITY;
      for (const index of capitalNeighbors) {
        const x = index % MASSIVE_WORLD_COLUMNS;
        const y = Math.floor(index / MASSIVE_WORLD_COLUMNS);
        const elevation = continentalNoise(seed, x, y);
        if (elevation > frontierElevation) {
          frontierIndex = index;
          frontierElevation = elevation;
        }
      }
      const frontierX = frontierIndex % MASSIVE_WORLD_COLUMNS;
      const frontierY = Math.floor(frontierIndex / MASSIVE_WORLD_COLUMNS);
      terrain[frontierIndex] = MassiveSectorTerrain.River;
      owners[frontierIndex] = frontierIndex + 2;
      strengths[frontierIndex] =
        38 + hash01(seed + 17, frontierX, frontierY) * 72;
    }
    owners[closestLand] = 1;
    strengths[closestLand] = 100;

    return new MassiveWorldModel({
      version: 1,
      seed,
      duration,
      createdAt: now,
      lastRealAt: now,
      worldElapsedMs: 0,
      command: MASSIVE_WORLD_PACING[duration].commandCap * 0.72,
      selectedIndex: closestLand,
      capitalIndex: closestLand,
      simulationTick: 0,
      appliedTacticalOutcomeIds: [],
      terrain,
      owners,
      strengths,
    });
  }

  static restore(
    duration: MassiveWorldDuration = "1d",
    storage: Pick<Storage, "getItem"> = localStorage,
  ): MassiveWorldModel | null {
    try {
      const raw = storage.getItem(MassiveWorldModel.storageKey(duration));
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isSnapshot(parsed) ? new MassiveWorldModel(parsed) : null;
    } catch {
      return null;
    }
  }

  static storageKey(duration: MassiveWorldDuration): string {
    return `${STORAGE_PREFIX}.${duration}`;
  }

  save(storage: Pick<Storage, "setItem"> = localStorage): void {
    storage.setItem(
      MassiveWorldModel.storageKey(this.pacing.duration),
      JSON.stringify(this.snapshot()),
    );
  }

  snapshot(): MassiveWorldSnapshot {
    return {
      version: 1,
      seed: this.seed,
      duration: this.pacing.duration,
      createdAt: this.createdAt,
      lastRealAt: this.lastRealAt,
      worldElapsedMs: this.worldElapsedMs,
      command: this.command,
      selectedIndex: this.selectedIndex,
      capitalIndex: this.capitalIndex,
      simulationTick: this.simulationTick,
      appliedTacticalOutcomeIds: Array.from(this.appliedTacticalOutcomeIds),
      terrain: Array.from(this.terrain),
      owners: Array.from(this.owners),
      strengths: Array.from(
        this.strengths,
        (value) => Math.round(value * 10) / 10,
      ),
    };
  }

  reset(storage: Pick<Storage, "removeItem"> = localStorage): void {
    storage.removeItem(MassiveWorldModel.storageKey(this.pacing.duration));
  }

  index(x: number, y: number): number {
    if (!this.isValidCoordinate(x, y)) return -1;
    return y * this.columns + x;
  }

  coordinates(index: number): { x: number; y: number } {
    return { x: index % this.columns, y: Math.floor(index / this.columns) };
  }

  isValidCoordinate(x: number, y: number): boolean {
    return (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      y >= 0 &&
      x < this.columns &&
      y < this.rows
    );
  }

  select(x: number, y: number): MassiveSectorView | null {
    const index = this.index(x, y);
    if (index < 0) return null;
    this.selectedIndex = index;
    return this.sector(index);
  }

  sector(index: number = this.selectedIndex): MassiveSectorView {
    const { x, y } = this.coordinates(index);
    const owner = this.owners[index];
    const terrain = this.terrain[index] as MassiveSectorTerrain;
    const route = this.routeTo(index);
    return {
      index,
      x,
      y,
      name: this.sectorName(index),
      terrain,
      owner,
      strength: this.strengths[index],
      isPlayer: owner === 1,
      isAttackable:
        terrain !== MassiveSectorTerrain.Ocean &&
        owner !== 1 &&
        (route === "border" || route === "river" || route === "ocean"),
      route,
    };
  }

  sectorName(index: number): string {
    const { x, y } = this.coordinates(index);
    const prefix =
      NAME_PREFIXES[hash32(this.seed + 31, x, y) % NAME_PREFIXES.length];
    const suffix =
      NAME_SUFFIXES[hash32(this.seed + 67, x, y) % NAME_SUFFIXES.length];
    return `${prefix} ${suffix}`;
  }

  stats(): MassiveWorldStats {
    let heldSectors = 0;
    let landSectors = 0;
    for (let i = 0; i < this.terrain.length; i++) {
      if (this.terrain[i] !== MassiveSectorTerrain.Ocean) landSectors++;
      if (this.owners[i] === 1) heldSectors++;
    }
    return {
      heldSectors,
      landSectors,
      simulatedNations: landSectors * 8,
      logicalTiles: MASSIVE_WORLD_SECTORS * TACTICAL_TILES_PER_SECTOR,
      command: this.command,
      commandCap: this.pacing.commandCap,
      oceanUnlocked: this.oceanUnlocked(),
      oceanProgress: clamp(
        this.worldElapsedMs / this.pacing.oceanUnlockAtMs,
        0,
        1,
      ),
      worldElapsedMs: this.worldElapsedMs,
    };
  }

  oceanUnlocked(): boolean {
    return this.worldElapsedMs >= this.pacing.oceanUnlockAtMs;
  }

  routeTo(targetIndex: number): MassiveSectorView["route"] {
    if (targetIndex < 0 || targetIndex >= this.owners.length) return "distant";
    if (this.owners[targetIndex] === 1) return "held";
    if (this.terrain[targetIndex] === MassiveSectorTerrain.Ocean) {
      return this.oceanUnlocked() ? "ocean" : "distant";
    }
    const target = this.coordinates(targetIndex);
    let nearestDistance = Number.POSITIVE_INFINITY;
    let adjacentRiver = false;
    for (let index = 0; index < this.owners.length; index++) {
      if (this.owners[index] !== 1) continue;
      const held = this.coordinates(index);
      const distance =
        Math.abs(target.x - held.x) + Math.abs(target.y - held.y);
      nearestDistance = Math.min(nearestDistance, distance);
      if (
        distance === 1 &&
        (this.terrain[index] === MassiveSectorTerrain.River ||
          this.terrain[targetIndex] === MassiveSectorTerrain.River)
      ) {
        adjacentRiver = true;
      }
    }
    if (nearestDistance === 1) return adjacentRiver ? "river" : "border";
    if (this.oceanUnlocked() && this.hasOceanRoute(targetIndex)) return "ocean";
    return "distant";
  }

  canAttack(targetIndex: number): boolean {
    if (targetIndex < 0 || targetIndex >= this.owners.length) return false;
    if (this.terrain[targetIndex] === MassiveSectorTerrain.Ocean) return false;
    if (this.owners[targetIndex] === 1) return false;
    const route = this.routeTo(targetIndex);
    return route === "border" || route === "river" || route === "ocean";
  }

  attack(
    targetIndex: number,
    intensity: number = 0.7,
  ): MassiveWorldAttackResult {
    if (this.owners[targetIndex] === 1) {
      return {
        accepted: false,
        captured: false,
        damage: 0,
        commandSpent: 0,
        reason: "already-held",
      };
    }
    if (!this.canAttack(targetIndex)) {
      return {
        accepted: false,
        captured: false,
        damage: 0,
        commandSpent: 0,
        reason:
          !this.oceanUnlocked() && this.hasOceanRoute(targetIndex)
            ? "water-locked"
            : "out-of-range",
      };
    }
    if (this.command < 1) {
      return {
        accepted: false,
        captured: false,
        damage: 0,
        commandSpent: 0,
        reason: "no-command",
      };
    }

    const normalizedIntensity = clamp(
      Number.isFinite(intensity) ? intensity : 0.7,
      0.1,
      1,
    );
    const commandSpent = Math.min(this.command, 4 + normalizedIntensity * 7);
    const terrainResistance =
      this.terrain[targetIndex] === MassiveSectorTerrain.River ? 0.9 : 1;
    const damage =
      commandSpent * (0.82 + normalizedIntensity * 0.68) * terrainResistance;
    this.command -= commandSpent;
    this.strengths[targetIndex] = Math.max(
      0,
      this.strengths[targetIndex] - damage,
    );
    const captured = this.strengths[targetIndex] <= 0;
    if (captured) {
      this.owners[targetIndex] = 1;
      this.strengths[targetIndex] = 24 + commandSpent * 0.8;
    }
    return { accepted: true, captured, damage, commandSpent };
  }

  applyTacticalOutcome(
    outcome: MassiveWorldTacticalOutcome,
  ): MassiveWorldTacticalOutcomeResult;
  applyTacticalOutcome(outcome: unknown): MassiveWorldTacticalOutcomeResult {
    if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) {
      return this.rejectedTacticalOutcome("invalid-outcome");
    }
    const candidate = outcome as Partial<MassiveWorldTacticalOutcome>;
    if (
      !isTacticalOutcomeId(candidate.outcomeId) ||
      !Number.isInteger(candidate.targetIndex) ||
      (candidate.targetIndex ?? -1) < 0 ||
      (candidate.targetIndex ?? MASSIVE_WORLD_SECTORS) >=
        MASSIVE_WORLD_SECTORS ||
      (candidate.result !== "victory" &&
        candidate.result !== "defeat" &&
        candidate.result !== "abandoned") ||
      (candidate.survivingForceRatio !== undefined &&
        (!isFiniteNumber(candidate.survivingForceRatio) ||
          candidate.survivingForceRatio < 0 ||
          candidate.survivingForceRatio > 1))
    ) {
      return this.rejectedTacticalOutcome("invalid-outcome");
    }

    if (this.appliedTacticalOutcomeIds.has(candidate.outcomeId)) {
      return this.rejectedTacticalOutcome("already-applied");
    }
    if (candidate.result === "defeat") {
      return this.rejectedTacticalOutcome("tactical-loss");
    }
    if (candidate.result === "abandoned") {
      return this.rejectedTacticalOutcome("tactical-abandoned");
    }

    // The integer/range guard above establishes this despite
    // Number.isInteger not being declared as a TypeScript type predicate.
    const targetIndex = candidate.targetIndex as number;
    if (this.owners[targetIndex] === 1) {
      return this.rejectedTacticalOutcome("already-held");
    }
    if (this.terrain[targetIndex] === MassiveSectorTerrain.Ocean) {
      return this.rejectedTacticalOutcome("ocean-sector");
    }
    const route = this.routeTo(targetIndex);
    if (route !== "border" && route !== "river" && route !== "ocean") {
      return this.rejectedTacticalOutcome("unreachable");
    }

    // Tactical combat has already paid the moment-to-moment troop cost under
    // stock OpenFront rules. The macro layer records surviving occupation
    // strength and a small logistics cost without replaying tactical combat.
    const survivingForceRatio = candidate.survivingForceRatio ?? 0.5;
    const strength = Math.round((28 + survivingForceRatio * 52) * 10) / 10;
    const requestedCommandCost =
      Math.round((6 + (1 - survivingForceRatio) * 10) * 10) / 10;
    const commandSpent = Math.min(this.command, requestedCommandCost);

    this.owners[targetIndex] = 1;
    this.strengths[targetIndex] = strength;
    this.command -= commandSpent;
    this.selectedIndex = targetIndex;
    this.appliedTacticalOutcomeIds.add(candidate.outcomeId);

    return {
      accepted: true,
      captured: true,
      commandSpent,
      strength,
    };
  }

  advance(realNow: number = Date.now()): void {
    if (!Number.isFinite(realNow)) return;
    const realDelta = clamp(realNow - this.lastRealAt, 0, 7 * 24 * 60 * 60_000);
    if (realDelta <= 0) return;
    const worldDelta = realDelta * this.pacing.prototypeTimeScale;
    this.lastRealAt = realNow;
    this.worldElapsedMs += worldDelta;
    this.command = Math.min(
      this.pacing.commandCap,
      this.command +
        (worldDelta / 1000) * this.pacing.commandRegenPerWorldSecond,
    );

    // Derive the scheduler from cumulative world time rather than rounding each
    // frame's delta independently. Otherwise ordinary 60 fps advances never
    // reach an event interval and bot activity only happens after a tab sleeps.
    // The duration presets deliberately top out at ~2.42m O(1) events for the
    // seven-day offline clamp, so catch-up can remain exact and deterministic
    // without retaining an event queue or sampling away frontier history.
    const targetSimulationTick = Math.floor(
      this.worldElapsedMs / this.pacing.botEventIntervalMs,
    );
    for (let tick = this.simulationTick; tick < targetSimulationTick; tick++) {
      this.advanceBotFront(tick);
    }
    this.simulationTick = targetSimulationTick;
  }

  rendererState(): Uint8Array {
    const pixels = new Uint8Array(this.owners.length * 4);
    for (let index = 0; index < this.owners.length; index++) {
      const offset = index * 4;
      const owner = this.owners[index];
      pixels[offset] = owner & 0xff;
      pixels[offset + 1] = owner >>> 8;
      pixels[offset + 2] = Math.round(
        clamp(this.strengths[index] / 120, 0, 1) * 255,
      );
      pixels[offset + 3] =
        this.terrain[index] | (this.owners[index] === 1 ? 0b100 : 0);
    }
    return pixels;
  }

  private advanceBotFront(tick: number): void {
    const eventSeed = hash32(this.seed + 401, tick, 17);
    const source = eventSeed % this.owners.length;
    if (
      this.terrain[source] === MassiveSectorTerrain.Ocean ||
      this.owners[source] <= 1
    ) {
      return;
    }
    const x = source % this.columns;
    const y = Math.floor(source / this.columns);
    let target = -1;
    switch ((eventSeed >>> 8) & 3) {
      case 0:
        if (x + 1 < this.columns) target = source + 1;
        break;
      case 1:
        if (x > 0) target = source - 1;
        break;
      case 2:
        if (y + 1 < this.rows) target = source + this.columns;
        break;
      default:
        if (y > 0) target = source - this.columns;
        break;
    }
    if (
      target < 0 ||
      this.terrain[target] === MassiveSectorTerrain.Ocean ||
      this.owners[target] <= 1 ||
      this.owners[target] === this.owners[source]
    ) {
      return;
    }
    const pressure = 1.2 + ((eventSeed >>> 16) % 100) / 38;
    this.strengths[target] -= pressure;
    this.strengths[source] = Math.max(
      12,
      this.strengths[source] - pressure * 0.08,
    );
    if (this.strengths[target] <= 8) {
      this.owners[target] = this.owners[source];
      this.strengths[target] = 18 + ((eventSeed >>> 24) % 24);
    }
  }

  private rejectedTacticalOutcome(
    reason: NonNullable<MassiveWorldTacticalOutcomeResult["reason"]>,
  ): MassiveWorldTacticalOutcomeResult {
    return {
      accepted: false,
      captured: false,
      commandSpent: 0,
      strength: 0,
      reason,
    };
  }

  /**
   * Tests whether two coasts are joined by a deliberately short ocean lane.
   * The macro atlas never uploads tactical terrain: it only answers the travel
   * question needed to decide which unchanged OpenFront sector may be entered.
   */
  private hasOceanRoute(targetIndex: number): boolean {
    if (
      targetIndex < 0 ||
      targetIndex >= this.terrain.length ||
      this.terrain[targetIndex] === MassiveSectorTerrain.Ocean
    ) {
      return false;
    }

    const targetWater = new Uint8Array(this.terrain.length);
    for (const neighbor of this.cardinalNeighbors(targetIndex)) {
      if (this.terrain[neighbor] === MassiveSectorTerrain.Ocean) {
        targetWater[neighbor] = 1;
      }
    }
    if (!targetWater.some((value) => value === 1)) return false;

    const distance = new Int16Array(this.terrain.length);
    distance.fill(-1);
    const queue = new Int32Array(this.terrain.length);
    let head = 0;
    let tail = 0;
    for (let index = 0; index < this.owners.length; index++) {
      if (this.owners[index] !== 1) continue;
      for (const neighbor of this.cardinalNeighbors(index)) {
        if (
          this.terrain[neighbor] === MassiveSectorTerrain.Ocean &&
          distance[neighbor] === -1
        ) {
          // Count water cells, not edges, so the configured limit is the
          // actual maximum width of an ocean crossing.
          distance[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }

    const maximumWaterSectors =
      this.pacing.duration === "1h"
        ? 10
        : this.pacing.duration === "1d"
          ? 7
          : 5;
    while (head < tail) {
      const current = queue[head++];
      if (targetWater[current] === 1) return true;
      if (distance[current] >= maximumWaterSectors) continue;
      for (const neighbor of this.cardinalNeighbors(current)) {
        if (
          this.terrain[neighbor] !== MassiveSectorTerrain.Ocean ||
          distance[neighbor] !== -1
        ) {
          continue;
        }
        distance[neighbor] = distance[current] + 1;
        queue[tail++] = neighbor;
      }
    }
    return false;
  }

  private cardinalNeighbors(index: number): number[] {
    const { x, y } = this.coordinates(index);
    const neighbors: number[] = [];
    if (x > 0) neighbors.push(index - 1);
    if (x + 1 < this.columns) neighbors.push(index + 1);
    if (y > 0) neighbors.push(index - this.columns);
    if (y + 1 < this.rows) neighbors.push(index + this.columns);
    return neighbors;
  }
}
