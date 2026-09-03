import { beforeEach, describe, expect, it } from "vitest";
import {
  beginMassiveWorldTacticalSession,
  clearMassiveWorldTacticalSession,
  hasMassiveWorldTacticalSession,
  MASSIVE_WORLD_ACTIVE_SECTOR_KEY,
  massiveWorldReturnRoute,
  peekMassiveWorldTacticalSession,
  recordMassiveWorldTacticalOutcome,
  recordMassiveWorldTacticalResult,
} from "../../src/client/experimental/massive-world/MassiveWorldSession";

const SESSION = {
  duration: "1d" as const,
  sectorIndex: 413,
  sectorName: "Alder Reach",
  gameID: "TACTICAL-ONE",
  enteredAt: 1_725_000_000_000,
};

describe("massive-world tactical session bridge", () => {
  beforeEach(() => sessionStorage.clear());

  it("starts and atomically identifies the matching tactical handoff", () => {
    expect(beginMassiveWorldTacticalSession(SESSION)).toBe(true);
    expect(hasMassiveWorldTacticalSession("TACTICAL-ONE")).toBe(true);
    expect(hasMassiveWorldTacticalSession("ANOTHER-GAME")).toBe(false);
    expect(massiveWorldReturnRoute("TACTICAL-ONE")).toBe(
      "/experimental/massive-world?duration=1d",
    );
    expect(peekMassiveWorldTacticalSession()).toEqual(SESSION);
  });

  it("records a local player or team victory and consumes it once", () => {
    beginMassiveWorldTacticalSession(SESSION);
    expect(
      recordMassiveWorldTacticalOutcome(
        "TACTICAL-ONE",
        "LOCAL",
        ["team", "red", "ALLY", "LOCAL"],
        "red",
      ),
    ).toBe(true);
    expect(peekMassiveWorldTacticalSession()).toEqual({
      ...SESSION,
      result: "victory",
    });
    expect(clearMassiveWorldTacticalSession("TACTICAL-ONE")).toBe(true);
    expect(peekMassiveWorldTacticalSession()).toBeNull();
  });

  it("records defeat or cancellation without accepting another game", () => {
    beginMassiveWorldTacticalSession(SESSION);
    expect(
      recordMassiveWorldTacticalOutcome("OTHER", "LOCAL", ["player", "LOCAL"]),
    ).toBe(false);
    expect(
      recordMassiveWorldTacticalOutcome("TACTICAL-ONE", "LOCAL", [
        "nation",
        "Bot nation",
      ]),
    ).toBe(true);
    expect(peekMassiveWorldTacticalSession()?.result).toBe("defeat");

    // A late cancellation signal cannot downgrade a known defeat.
    expect(
      recordMassiveWorldTacticalOutcome("TACTICAL-ONE", "LOCAL", undefined),
    ).toBe(true);
    expect(peekMassiveWorldTacticalSession()?.result).toBe("defeat");
  });

  it("allows a canonical team win to upgrade an earlier elimination", () => {
    beginMassiveWorldTacticalSession(SESSION);
    expect(recordMassiveWorldTacticalResult("TACTICAL-ONE", "defeat")).toBe(
      true,
    );
    expect(
      recordMassiveWorldTacticalOutcome(
        "TACTICAL-ONE",
        "ELIMINATED-LOCAL",
        ["team", "red", "SURVIVING-ALLY"],
        "red",
      ),
    ).toBe(true);
    expect(peekMassiveWorldTacticalSession()?.result).toBe("victory");
    expect(clearMassiveWorldTacticalSession("ANOTHER-GAME")).toBe(false);
    expect(clearMassiveWorldTacticalSession("TACTICAL-ONE")).toBe(true);
    expect(peekMassiveWorldTacticalSession()).toBeNull();
  });

  it("rejects malformed storage rather than trusting it", () => {
    sessionStorage.setItem(
      MASSIVE_WORLD_ACTIVE_SECTOR_KEY,
      JSON.stringify({ ...SESSION, sectorIndex: -1 }),
    );
    expect(peekMassiveWorldTacticalSession()).toBeNull();
    expect(hasMassiveWorldTacticalSession()).toBe(false);
  });
});
