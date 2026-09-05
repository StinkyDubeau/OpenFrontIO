import type { GameUpdates } from "../../core/game/Game";
import {
  GameUpdateType,
  type GameUpdateViewData,
  type RailroadConstructionUpdate,
} from "../../core/game/GameUpdates";
import { PlayerImpl } from "../../core/game/PlayerImpl";
import type { GameRunner } from "../../core/GameRunner";
import { encodeViewPacket } from "../../core/network/ViewProtocol";

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
    let pairs: number[] = [];
    const flush = () => {
      if (!pairs.length) return;
      const part = emptyView(tick);
      part.pendingTurns = 2;
      part.packedTileUpdates = Uint32Array.from(pairs);
      packets.push(
        encodeViewPacket({ kind: "update", snapshot: "part", update: part }),
      );
      pairs = [];
    };
    const map = game.map();
    for (let word = 0; word < this.changed.length; word++) {
      let bits = this.changed[word];
      while (bits !== 0) {
        const bit = 31 - Math.clz32(bits & -bits);
        const tile = word * 32 + bit;
        pairs.push(tile, map.tileState(tile) | (map.terrainByte(tile) << 16));
        bits = (bits & (bits - 1)) >>> 0;
        if (pairs.length >= 32_768) flush();
      }
    }
    flush();
    // Nukeable visual layers must remain destroyed for returning viewers,
    // even though past blast animations and notifications are not replayed.
    if (this.destroyedLayerTiles) {
      let impacts: number[] = [];
      const flushImpacts = () => {
        if (!impacts.length) return;
        const part = emptyView(tick);
        part.pendingTurns = 2;
        part.packedNukeImpacts = Uint32Array.from(impacts);
        packets.push(
          encodeViewPacket({ kind: "update", snapshot: "part", update: part }),
        );
        impacts = [];
      };
      for (let word = 0; word < this.destroyedLayerTiles.length; word++) {
        let bits = this.destroyedLayerTiles[word];
        while (bits !== 0) {
          impacts.push(word * 32 + 31 - Math.clz32(bits & -bits));
          bits = (bits & (bits - 1)) >>> 0;
          if (impacts.length >= 32_768) flushImpacts();
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
