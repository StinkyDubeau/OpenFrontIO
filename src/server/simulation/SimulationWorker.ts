import { parentPort, workerData } from "node:worker_threads";
import {
  GameUpdateType,
  type GameUpdateViewData,
} from "../../core/game/GameUpdates";
import { PlayerImpl } from "../../core/game/PlayerImpl";
import { createGameRunner } from "../../core/GameRunner";
import {
  encodeViewPacket,
  type ViewQuery,
} from "../../core/network/ViewProtocol";
import type { GameStartInfo, Turn } from "../../core/Schemas";
import type { WorkerMessage } from "../../core/worker/WorkerMessages";
import { NodeGameMapLoader } from "./NodeGameMapLoader";
import { ViewSnapshot } from "./ViewSnapshot";
import { MovingUnitTracker } from "./MovingUnitTracker";

const port = parentPort!;
console.debug = () => {};
let latest: GameUpdateViewData;
let failure: string | undefined;
const runner = await createGameRunner(
  workerData.start as GameStartInfo,
  undefined,
  new NodeGameMapLoader(workerData.mapsDir),
  (update) => {
    if ("errMsg" in update) failure = update.errMsg;
    else latest = update;
  },
);
const snapshot = new ViewSnapshot(runner);
function tick(turn: Turn) {
  if (turn.turnNumber !== runner.game.ticks())
    throw new Error("Simulation turn gap");
  runner.addTurn(turn);
  if (!runner.executeNextTick() || failure)
    throw new Error(failure ?? "Simulation tick failed");
  snapshot.record(latest);
}
for (const turn of workerData.turns as Turn[]) tick(turn);
const movingUnits = new MovingUnitTracker();

function query(q: ViewQuery): WorkerMessage {
  const game = runner.game;
  if (q.x !== undefined && q.y !== undefined && !game.isValidCoord(q.x, q.y))
    throw new Error("Invalid map position");
  if (q.targetTile !== undefined && !game.isValidRef(q.targetTile))
    throw new Error("Invalid target tile");
  switch (q.type) {
    case "player_actions":
      return {
        type: "player_actions_result",
        id: q.id,
        result: runner.playerActions(String(q.playerID), q.x, q.y, q.units),
      };
    case "player_buildables":
      return {
        type: "player_buildables_result",
        id: q.id,
        result: runner.playerBuildables(
          String(q.playerID),
          q.x,
          q.y,
          q.units ?? undefined,
        ),
      };
    case "player_profile":
      return {
        type: "player_profile_result",
        id: q.id,
        result: runner.playerProfile(Number(q.playerID)),
      };
    case "player_border_tiles":
      return {
        type: "player_border_tiles_result",
        id: q.id,
        result: runner.playerBorderTiles(String(q.playerID)),
      };
    case "transport_ship_spawn":
      return {
        type: "transport_ship_spawn_result",
        id: q.id,
        result:
          q.targetTile === undefined
            ? false
            : runner.bestTransportShipSpawn(String(q.playerID), q.targetTile),
      };
    case "attack_clustered_positions":
      return {
        type: "attack_clustered_positions_result",
        id: q.id,
        attacks: runner.attackClusteredPositions(
          Number(q.playerID),
          q.attackID,
        ),
      };
  }
}
port.on("message", (command) => {
  try {
    if (command.type === "turn") {
      const started = performance.now();
      tick(command.turn);
      // Render clients receive current positions. Original motion executions
      // still run in the core; no per-client path execution is required.
      latest.packedMotionPlans = undefined;
      // The core already emits state changes for structures and units. Only
      // movement bypasses that path when clients run motion plans. Structures
      // can never move, so do not rescan them as the world builds up.
      movingUnits.appendChangedPositions(
        runner.game,
        latest.updates[GameUpdateType.Unit],
      );
      latest.pendingTurns = 0;
      latest.serverTickExecutionDuration = performance.now() - started;
      const bytes = encodeViewPacket({ kind: "update", update: latest });
      const stats =
        latest.tick % 100 === 0
          ? {
              turn: latest.tick,
              players: runner.game
                .allPlayers()
                .filter((p) => p.clientID() !== null)
                .map((p) => {
                  const full = (p as PlayerImpl).toFullUpdate();
                  return {
                    clientID: p.clientID()!,
                    tilesOwned: p.numTilesOwned(),
                    troops: p.troops(),
                    gold: String(p.gold()),
                    isAlive: p.isAlive(),
                    team: p.team(),
                    killedBy: full.killedBy ?? null,
                    deathPosition: full.deathPosition ?? null,
                  };
                }),
            }
          : undefined;
      port.postMessage(
        {
          id: command.id,
          bytes,
          tick: latest.tick,
          duration: performance.now() - started,
          stats,
          win: latest.updates[GameUpdateType.Win][0],
        },
        [bytes.buffer],
      );
    } else if (command.type === "snapshot") {
      const packets = snapshot.packets();
      port.postMessage(
        { id: command.id, tick: runner.game.ticks(), packets },
        packets.map((p) => p.buffer),
      );
    } else if (command.type === "query") {
      const bytes = encodeViewPacket({
        kind: "result",
        message: query(command.query),
      });
      port.postMessage({ id: command.id, bytes }, [bytes.buffer]);
    }
  } catch (error) {
    port.postMessage({
      id: command.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
port.postMessage({ ready: true });
