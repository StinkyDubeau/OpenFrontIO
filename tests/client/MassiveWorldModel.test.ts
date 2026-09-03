import { describe, expect, it } from "vitest";
import {
  MASSIVE_WORLD_PACING,
  MASSIVE_WORLD_SECTORS,
  MassiveSectorTerrain,
  MassiveWorldModel,
  TACTICAL_TILES_PER_SECTOR,
} from "../../src/client/experimental/massive-world/MassiveWorldModel";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function cardinalNeighbors(model: MassiveWorldModel, index: number): number[] {
  const { x, y } = model.coordinates(index);
  return [
    model.index(x - 1, y),
    model.index(x + 1, y),
    model.index(x, y - 1),
    model.index(x, y + 1),
  ].filter((neighbor) => neighbor >= 0);
}

function firstAttackableSector(model: MassiveWorldModel): number {
  return Array.from(model.owners).findIndex((_, index) =>
    model.canAttack(index),
  );
}

describe("experimental massive world model", () => {
  it("builds a deterministic multi-billion-tile stitched atlas", () => {
    const first = MassiveWorldModel.create("1d", 12_345, 1_000);
    const second = MassiveWorldModel.create("1d", 12_345, 1_000);

    expect(first.snapshot()).toEqual(second.snapshot());
    expect(first.terrain).toHaveLength(MASSIVE_WORLD_SECTORS);
    expect(first.rendererState()).toHaveLength(MASSIVE_WORLD_SECTORS * 4);

    const stats = first.stats();
    expect(stats.logicalTiles).toBe(
      MASSIVE_WORLD_SECTORS * TACTICAL_TILES_PER_SECTOR,
    );
    expect(stats.logicalTiles).toBeGreaterThan(4_000_000_000);
    expect(stats.landSectors).toBeGreaterThan(300);
    expect(stats.simulatedNations).toBeGreaterThan(2_000);
    expect(first.terrain).toContain(MassiveSectorTerrain.Ocean);
    expect(first.terrain).toContain(MassiveSectorTerrain.River);
    expect(
      first.terrain.byteLength +
        first.owners.byteLength +
        first.strengths.byteLength,
    ).toBe(14_336);

    const highOwnerIndex = Array.from(first.owners).findIndex(
      (owner) => owner > 255,
    );
    const rendererState = first.rendererState();
    const offset = highOwnerIndex * 4;
    expect(rendererState[offset] | (rendererState[offset + 1] << 8)).toBe(
      first.owners[highOwnerIndex],
    );
  });

  it("lets repeated pressure capture a reachable neighboring sector", () => {
    const model = MassiveWorldModel.create("1h", 99, 2_000);
    const target = firstAttackableSector(model);
    expect(target).toBeGreaterThanOrEqual(0);

    const heldBefore = model.stats().heldSectors;
    const malformedIntensityResult = model.attack(target, Number.NaN);
    expect(malformedIntensityResult.accepted).toBe(true);
    expect(Number.isFinite(malformedIntensityResult.damage)).toBe(true);
    expect(Number.isFinite(model.command)).toBe(true);
    let captured = false;
    for (let attempt = 0; attempt < 40 && !captured; attempt++) {
      captured = model.attack(target, 1).captured;
    }

    expect(captured).toBe(true);
    expect(model.sector(target).isPlayer).toBe(true);
    expect(model.stats().heldSectors).toBe(heldBefore + 1);
  });

  it("applies a tactical victory to a currently reachable frontier", () => {
    const model = MassiveWorldModel.create("1d", 8_181, 0);
    const targetIndex = firstAttackableSector(model);
    const commandBefore = model.command;

    const result = model.applyTacticalOutcome({
      outcomeId: "match-8181:victory-1",
      targetIndex,
      result: "victory",
      survivingForceRatio: 0.75,
    });

    expect(result).toEqual({
      accepted: true,
      captured: true,
      commandSpent: 8.5,
      strength: 67,
    });
    expect(model.owners[targetIndex]).toBe(1);
    expect(model.strengths[targetIndex]).toBe(67);
    expect(model.command).toBeCloseTo(commandBefore - 8.5, 10);
    expect(model.selectedIndex).toBe(targetIndex);
  });

  it("rejects tactical losses and abandoned battles without mutating the atlas", () => {
    const model = MassiveWorldModel.create("1d", 9_191, 0);
    const targetIndex = firstAttackableSector(model);
    const before = model.snapshot();

    expect(
      model.applyTacticalOutcome({
        outcomeId: "match-9191:defeat-1",
        targetIndex,
        result: "defeat",
      }),
    ).toMatchObject({ accepted: false, reason: "tactical-loss" });
    expect(
      model.applyTacticalOutcome({
        outcomeId: "match-9191:abandoned-1",
        targetIndex,
        result: "abandoned",
      }),
    ).toMatchObject({ accepted: false, reason: "tactical-abandoned" });
    expect(model.snapshot()).toEqual(before);
  });

  it("rejects malformed, ocean, and unreachable tactical outcomes", () => {
    const model = MassiveWorldModel.create("1d", 12_345, 0);
    const targetIndex = firstAttackableSector(model);
    const oceanIndex = Array.from(model.terrain).findIndex(
      (terrain) => terrain === MassiveSectorTerrain.Ocean,
    );
    const unreachableIndex = Array.from(model.terrain).findIndex(
      (terrain, index) =>
        terrain !== MassiveSectorTerrain.Ocean &&
        model.owners[index] !== 1 &&
        model.routeTo(index) === "distant",
    );
    const before = model.snapshot();

    expect(
      model.applyTacticalOutcome({
        outcomeId: "",
        targetIndex,
        result: "victory",
      }),
    ).toMatchObject({ accepted: false, reason: "invalid-outcome" });
    expect(
      model.applyTacticalOutcome({
        outcomeId: "match-12345:ocean-1",
        targetIndex: oceanIndex,
        result: "victory",
      }),
    ).toMatchObject({ accepted: false, reason: "ocean-sector" });
    expect(unreachableIndex).toBeGreaterThanOrEqual(0);
    expect(
      model.applyTacticalOutcome({
        outcomeId: "match-12345:distant-1",
        targetIndex: unreachableIndex,
        result: "victory",
      }),
    ).toMatchObject({ accepted: false, reason: "unreachable" });
    expect(model.snapshot()).toEqual(before);
  });

  it("persists tactical victory idempotency across a cold reload", () => {
    const storage = new MemoryStorage();
    const model = MassiveWorldModel.create("7d", 7_171, 0);
    const targetIndex = firstAttackableSector(model);
    const outcome = {
      outcomeId: "match-7171:victory-1",
      targetIndex,
      result: "victory" as const,
      survivingForceRatio: 0.4,
    };

    expect(model.applyTacticalOutcome(outcome).accepted).toBe(true);
    model.save(storage);
    const restored = MassiveWorldModel.restore("7d", storage);
    expect(restored).not.toBeNull();
    const beforeReplay = restored?.snapshot();

    expect(restored?.applyTacticalOutcome(outcome)).toMatchObject({
      accepted: false,
      captured: false,
      reason: "already-applied",
    });
    expect(restored?.snapshot()).toEqual(beforeReplay);
  });

  it("repairs an isolated generated capital with exactly one river-mouth frontier", () => {
    const model = MassiveWorldModel.create("1d", 48, 0);
    const frontiers = cardinalNeighbors(model, model.capitalIndex).filter(
      (index) => model.terrain[index] !== MassiveSectorTerrain.Ocean,
    );

    expect(frontiers).toHaveLength(1);
    expect(model.terrain[frontiers[0]]).toBe(MassiveSectorTerrain.River);
    expect(model.owners[frontiers[0]]).not.toBe(1);
    expect(model.canAttack(frontiers[0])).toBe(true);
  });

  it("always generates an immediately playable frontier across 10,000 seeds", () => {
    const strandedSeeds: number[] = [];
    for (let seed = 0; seed < 10_000; seed++) {
      const model = MassiveWorldModel.create("1d", seed, 0);
      const hasAttackableFrontier = cardinalNeighbors(
        model,
        model.capitalIndex,
      ).some((index) => model.canAttack(index));
      if (!hasAttackableFrontier) strandedSeeds.push(seed);
    }

    expect(strandedSeeds).toEqual([]);
  }, 30_000);

  it("scales catch-up and the ocean unlock to the selected duration", () => {
    const realUnlockDurations: number[] = [];
    const realCommandRegenRates: number[] = [];
    const realBotIntervals: number[] = [];

    for (const duration of ["1h", "1d", "7d"] as const) {
      const model = MassiveWorldModel.create(duration, 7, 10_000);
      const pacing = MASSIVE_WORLD_PACING[duration];
      const realUnlockDuration =
        pacing.oceanUnlockAtMs / pacing.prototypeTimeScale;
      realUnlockDurations.push(realUnlockDuration);
      realCommandRegenRates.push(
        pacing.commandRegenPerWorldSecond * pacing.prototypeTimeScale,
      );
      realBotIntervals.push(
        pacing.botEventIntervalMs / pacing.prototypeTimeScale,
      );

      model.advance(10_000 + realUnlockDuration - 1);
      expect(model.oceanUnlocked()).toBe(false);
      model.advance(10_000 + realUnlockDuration + 1);
      expect(model.oceanUnlocked()).toBe(true);
      expect(model.command).toBeCloseTo(pacing.commandCap, 5);
    }

    expect(realUnlockDurations[0]).toBeLessThan(realUnlockDurations[1]);
    expect(realUnlockDurations[1]).toBeLessThan(realUnlockDurations[2]);
    expect(realCommandRegenRates[0]).toBeGreaterThan(realCommandRegenRates[1]);
    expect(realCommandRegenRates[1]).toBeGreaterThan(realCommandRegenRates[2]);
    expect(realBotIntervals[0]).toBeLessThan(realBotIntervals[1]);
    expect(realBotIntervals[1]).toBeLessThan(realBotIntervals[2]);
  });

  it("schedules the same bot history across frame-sized and single catch-up advances", () => {
    const once = MassiveWorldModel.create("1d", 777, 0);
    const framed = MassiveWorldModel.create("1d", 777, 0);
    const finalNow = 10_000;

    once.advance(finalNow);
    for (let now = 16; now < finalNow; now += 16) framed.advance(now);
    framed.advance(finalNow);

    expect(framed.simulationTick).toBeGreaterThan(0);
    expect(framed.simulationTick).toBe(once.simulationTick);
    expect(framed.owners).toEqual(once.owners);
    expect(framed.strengths).toEqual(once.strengths);
    expect(framed.command).toBeCloseTo(once.command, 10);
  });

  it("catches up a full offline week exactly without allowing bots to kill an AFK player", () => {
    const model = MassiveWorldModel.create("7d", 30_303, 0);
    const botOwnersBefore = model.owners.slice();
    const botStrengthsBefore = model.strengths.slice();
    const playerOwnersBefore = Array.from(model.owners, (owner, index) =>
      owner === 1 ? index : -1,
    ).filter((index) => index >= 0);
    const playerStrengthsBefore = playerOwnersBefore.map(
      (index) => model.strengths[index],
    );
    const expectedTicks = Math.floor(
      (7 * 24 * 60 * 60_000 * model.pacing.prototypeTimeScale) /
        model.pacing.botEventIntervalMs,
    );

    model.advance(7 * 24 * 60 * 60_000);

    expect(model.simulationTick).toBe(expectedTicks);
    expect(model.simulationTick).toBeGreaterThan(500_000);
    expect(playerOwnersBefore.map((index) => model.owners[index])).toEqual(
      playerOwnersBefore.map(() => 1),
    );
    expect(playerOwnersBefore.map((index) => model.strengths[index])).toEqual(
      playerStrengthsBefore,
    );
    expect(model.owners).not.toEqual(botOwnersBefore);
    expect(model.strengths).not.toEqual(botStrengthsBefore);
  });

  it("keeps ocean travel locked, then permits only bounded crossings", () => {
    const model = MassiveWorldModel.create("1d", 5_050, 0);
    model.terrain.fill(MassiveSectorTerrain.Land);
    model.owners.fill(2);
    model.strengths.fill(50);

    const nearStart = model.index(2, 5);
    const nearTarget = model.index(10, 5);
    model.owners[nearStart] = 1;
    for (let x = 3; x <= 9; x++) {
      model.terrain[model.index(x, 5)] = MassiveSectorTerrain.Ocean;
      model.owners[model.index(x, 5)] = 0;
    }

    const farStart = model.index(2, 20);
    const farTarget = model.index(11, 20);
    model.owners[farStart] = 1;
    for (let x = 3; x <= 10; x++) {
      model.terrain[model.index(x, 20)] = MassiveSectorTerrain.Ocean;
      model.owners[model.index(x, 20)] = 0;
    }

    const riverTarget = model.index(2, 4);
    model.terrain[riverTarget] = MassiveSectorTerrain.River;

    expect(model.routeTo(riverTarget)).toBe("river");
    expect(model.attack(nearTarget).reason).toBe("water-locked");
    expect(model.attack(farTarget).reason).toBe("out-of-range");

    const pacing = MASSIVE_WORLD_PACING["1d"];
    model.advance(pacing.oceanUnlockAtMs / pacing.prototypeTimeScale + 1);

    expect(model.routeTo(nearTarget)).toBe("ocean");
    expect(model.canAttack(nearTarget)).toBe(true);
    expect(model.routeTo(farTarget)).toBe("distant");
    expect(model.canAttack(farTarget)).toBe(false);
  });

  it("survives a cold reload with atlas progress intact", () => {
    const storage = new MemoryStorage();
    const original = MassiveWorldModel.create("7d", 4_242, 30_000);
    const target = Array.from(original.owners).findIndex((_, index) =>
      original.canAttack(index),
    );
    original.select(
      original.coordinates(target).x,
      original.coordinates(target).y,
    );
    original.attack(target, 0.8);
    original.advance(40_000);
    original.save(storage);

    const restored = MassiveWorldModel.restore("7d", storage);
    expect(restored).not.toBeNull();
    expect(restored?.snapshot()).toEqual(original.snapshot());
  });

  it("rejects a corrupted offline scheduler snapshot", () => {
    const storage = new MemoryStorage();
    const model = MassiveWorldModel.create("1d", 2_222, 0);
    storage.setItem(
      MassiveWorldModel.storageKey("1d"),
      JSON.stringify({ ...model.snapshot(), simulationTick: 1 }),
    );

    expect(MassiveWorldModel.restore("1d", storage)).toBeNull();
  });
});
