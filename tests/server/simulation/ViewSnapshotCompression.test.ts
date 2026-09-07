import { describe, expect, it } from "vitest";
import { GameUpdateType } from "../../../src/core/game/GameUpdates";
import { decodeViewPacket } from "../../../src/core/network/ViewProtocol";
import {
  emptyView,
  ViewSnapshot,
} from "../../../src/server/simulation/ViewSnapshot";

describe("ViewSnapshot run compression", () => {
  it("encodes contiguous equal ownership as compact tile-state runs", () => {
    const states = new Uint16Array([0, 9, 9, 9, 0, 12, 12, 0]);
    const map = {
      width: () => 8,
      height: () => 1,
      tileState: (ref: number) => states[ref],
      terrainByte: () => 0x80,
    };
    const game = {
      map: () => map,
      ticks: () => 42,
      allPlayers: () => [],
      units: () => [],
    };
    const snapshot = new ViewSnapshot({ game } as never);
    const update = emptyView(42);
    update.packedTileUpdates = new Uint32Array([
      1, 9, 2, 9, 3, 9, 5, 12, 6, 12,
    ]);
    snapshot.record(update);

    const decoded = snapshot
      .packets()
      .map((bytes) => decodeViewPacket(bytes.buffer))
      .filter(
        (packet) =>
          packet.kind === "update" &&
          packet.snapshot === "part" &&
          packet.update.packedTileRuns !== undefined,
      );
    expect(decoded).toHaveLength(1);
    const packet = decoded[0];
    if (packet.kind !== "update") throw new Error("wrong packet kind");
    expect([...packet.update.packedTileRuns!]).toEqual([1, 3, 9, 5, 2, 12]);
    expect(packet.update.packedTileUpdates).toHaveLength(0);
    expect(packet.update.updates[GameUpdateType.Player]).toEqual([]);
  });

  it("bounds large player rosters instead of creating one giant join frame", () => {
    const map = {
      width: () => 1,
      height: () => 1,
      tileState: () => 0,
      terrainByte: () => 0x80,
    };
    const players = Array.from({ length: 2_001 }, (_, id) => ({
      toFullUpdate: () => ({
        type: GameUpdateType.Player,
        id: `player-${id}`,
        clientID: id === 2_000 ? "connected-human" : null,
        name: `Player ${id} with a deliberately representative display name`,
        displayName: `Player ${id}`,
        smallID: id,
        embargoes: id === 0 ? new Set(["player-1"]) : new Set(),
      }),
    }));
    const game = {
      map: () => map,
      ticks: () => 42,
      allPlayers: () => players,
      units: () => [],
    };
    const snapshot = new ViewSnapshot({ game } as never);
    const packets = snapshot.packets();
    const decoded = packets.map((bytes) => decodeViewPacket(bytes.buffer));
    const playerPackets = decoded.filter(
      (packet) =>
        packet.kind === "update" &&
        packet.update.updates[GameUpdateType.Player].length > 0,
    );

    expect(
      Math.max(...packets.map((packet) => packet.byteLength)),
    ).toBeLessThan(128 * 1024);
    expect(
      playerPackets.every(
        (packet) =>
          packet.kind === "update" &&
          packet.update.updates[GameUpdateType.Player].length <= 64,
      ),
    ).toBe(true);
    const first = decoded[0];
    if (first.kind !== "update") throw new Error("wrong packet kind");
    expect(first.update.updates[GameUpdateType.Player][0].clientID).toBe(
      "connected-human",
    );
  });
});
