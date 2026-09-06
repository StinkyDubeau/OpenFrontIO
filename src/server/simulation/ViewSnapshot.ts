import type { GameUpdates } from "../../core/game/Game";
import {
  GameUpdateType,
  type GameUpdateViewData,
  type RailroadConstructionUpdate,
} from "../../core/game/GameUpdates";
import { PlayerImpl } from "../../core/game/PlayerImpl";
import type { GameRunner } from "../../core/GameRunner";
import { encodeViewPacket } from "../../core/network/ViewProtocol";

// A packet expands to at most this many client-side tile writes. Keeping the
// work bounded gives mobile Safari/Expo a regular event-loop yield for input,
// paint and heartbeats while the whole-world overview paints top-to-bottom.
const MAX_TILES_PER_RUN_PACKET = 262_144;
const MAX_RUNS_PER_PACKET = 16_384;
const MAX_TERRAIN_PAIRS_PER_PACKET = 16_384;

export function emptyView(tick: number): GameUpdateViewData {
  const updates = {} as GameUpdates;
  for (const value of Object.values(GameUpdateType))
    if (typeof value === "number") updates[value] = [] as never;
  return {
    tick,
    updates,
    packedTileUpdates: new Uint32Array(0),
    pendingTurns: 0,
  };
}

/** Bounded by current map state, never by world age. No simulation checkpoint. */
export class ViewSnapshot {
  private changed: Uint32Array;
  private destroyedLayerTiles: Uint32Array | undefined;
  private rails = new Map<number, RailroadConstructionUpdate>();
  private names: GameUpdateViewData["playerNameViewData"];
  private startTick: number | undefined;
  private win: GameUpdates[GameUpdateType.Win] = [];
  constructor(private runner: GameRunner) {
    const map = runner.game.map();
    this.changed = new Uint32Array(
      Math.ceil((map.width() * map.height()) / 32),
    );
  }
  record(update: GameUpdateViewData): void {
    if (update.packedNukeImpacts?.length) {
      this.destroyedLayerTiles ??= new Uint32Array(this.changed.length);
      for (const tile of update.packedNukeImpacts)
        this.destroyedLayerTiles[tile >>> 5] |= 1 << (tile & 31);
    }
    for (let i = 0; i < update.packedTileUpdates.length; i += 2) {
      const tile = update.packedTileUpdates[i];
      this.changed[tile >>> 5] |= 1 << (tile & 31);
    }
    this.names = update.playerNameViewData ?? this.names;
    this.startTick =
      update.updates[GameUpdateType.SpawnPhaseEnd][0]?.startTick ??
      this.startTick;
    for (const rail of update.updates[GameUpdateType.RailroadConstructionEvent])
      this.rails.set(rail.id, rail);
    for (const rail of update.updates[GameUpdateType.RailroadDestructionEvent])
      this.rails.delete(rail.id);
    for (const rail of update.updates[GameUpdateType.RailroadSnapEvent]) {
      this.rails.delete(rail.originalId);
      this.rails.set(rail.newId1, {
        type: GameUpdateType.RailroadConstructionEvent,
        id: rail.newId1,
        tiles: rail.tiles1,
      });
      this.rails.set(rail.newId2, {
        type: GameUpdateType.RailroadConstructionEvent,
        id: rail.newId2,
        tiles: rail.tiles2,
      });
    }
    if (update.updates[GameUpdateType.Win].length)
      this.win = update.updates[GameUpdateType.Win];
  }
  packets(): Uint8Array<ArrayBuffer>[] {
    const game = this.runner.game;
    const tick = game.ticks();
    const begin = emptyView(tick);
    begin.pendingTurns = 2;
    begin.updates[GameUpdateType.Player] = game
      .allPlayers()
      .map((p) => (p as PlayerImpl).toFullUpdate());
    begin.updates[GameUpdateType.Unit] = game.units().map((u) => u.toUpdate());
    begin.updates[GameUpdateType.RailroadConstructionEvent] = [
      ...this.rails.values(),
    ];
    begin.playerNameViewData = this.names;
    if (this.startTick !== undefined)
      begin.updates[GameUpdateType.SpawnPhaseEnd] = [
        { type: GameUpdateType.SpawnPhaseEnd, startTick: this.startTick },
      ];
    const packets = [
      encodeViewPacket({ kind: "update", snapshot: "begin", update: begin }),
    ];
    let runs: number[] = [];
    let expandedTiles = 0;
    const flushRuns = () => {
      if (!runs.length) return;
      const part = emptyView(tick);
      part.pendingTurns = 2;
      part.packedTileRuns = Uint32Array.from(runs);
      packets.push(
        encodeViewPacket({ kind: "update", snapshot: "part", update: part }),
      );
      runs = [];
      expandedTiles = 0;
    };
    const appendRun = (start: number, length: number, state: number) => {
      let cursor = start;
      let remaining = length;
      while (remaining > 0) {
        if (
          expandedTiles >= MAX_TILES_PER_RUN_PACKET ||
          runs.length / 3 >= MAX_RUNS_PER_PACKET
        ) {
          flushRuns();
        }
        const room = MAX_TILES_PER_RUN_PACKET - expandedTiles;
        const take = Math.min(remaining, room);
        runs.push(cursor, take, state);
        cursor += take;
        remaining -= take;
        expandedTiles += take;
      }
    };
    const map = game.map();
    let runStart = -1;
    let runLength = 0;
    let runState = 0;
    const finishRun = () => {
      if (runLength > 0) appendRun(runStart, runLength, runState);
      runStart = -1;
      runLength = 0;
    };
    for (let word = 0; word < this.changed.length; word++) {
      let bits = this.changed[word];
      while (bits !== 0) {
        const bit = 31 - Math.clz32(bits & -bits);
        const tile = word * 32 + bit;
        const state = map.tileState(tile);
        if (runLength > 0 && tile === runStart + runLength && state === runState) {
          runLength++;
        } else {
          finishRun();
          runStart = tile;
          runLength = 1;
          runState = state;
        }
        bits = (bits & (bits - 1)) >>> 0;
      }
    }
    finishRun();
    flushRuns();
    // Nukeable visual layers must remain destroyed for returning viewers,
    // even though past blast animations and notifications are not replayed.
    if (this.destroyedLayerTiles) {
      let impacts: number[] = [];
      let terrain: number[] = [];
      const flushImpacts = () => {
        if (!impacts.length) return;
        const part = emptyView(tick);
        part.pendingTurns = 2;
        part.packedNukeImpacts = Uint32Array.from(impacts);
        part.packedTerrainUpdates = Uint32Array.from(terrain);
        packets.push(
          encodeViewPacket({ kind: "update", snapshot: "part", update: part }),
        );
        impacts = [];
        terrain = [];
      };
      for (let word = 0; word < this.destroyedLayerTiles.length; word++) {
        let bits = this.destroyedLayerTiles[word];
        while (bits !== 0) {
          const tile = word * 32 + 31 - Math.clz32(bits & -bits);
          impacts.push(tile);
          terrain.push(tile, map.terrainByte(tile));
          bits = (bits & (bits - 1)) >>> 0;
          if (impacts.length >= MAX_TERRAIN_PAIRS_PER_PACKET) flushImpacts();
        }
      }
      flushImpacts();
    }
    const end = emptyView(tick);
    end.updates[GameUpdateType.Win] = this.win;
    packets.push(
      encodeViewPacket({ kind: "update", snapshot: "end", update: end }),
    );
    return packets;
  }
}
