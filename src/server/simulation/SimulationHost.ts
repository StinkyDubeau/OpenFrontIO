import { fileURLToPath, URL as NodeURL } from "node:url";
import { Worker } from "node:worker_threads";
import type { GameStartInfo, LiveStats, Turn } from "../../core/Schemas";
import type { WinUpdate } from "../../core/game/GameUpdates";
import type { ViewQuery } from "../../core/network/ViewProtocol";

export interface TickResult {
  bytes: Uint8Array;
  tick: number;
  duration: number;
  stats?: LiveStats;
  win?: WinUpdate;
}

// Replaying a durable, week-scale world is real simulation work rather than a
// normal worker boot. Keep a firm upper bound, but size it from the journal so
// a healthy large recovery is not killed by the old three-minute constant.
export function simulationInitializationTimeout(turnCount: number): number {
  const BASE_TIMEOUT_MS = 180_000;
  // Expanded-world replay currently costs about 15 ms/turn on the reference
  // host once structures and fleets are established. Leave headroom for GC,
  // map construction, and a concurrently connected client instead of killing
  // a healthy recovery just as it reaches the journal head.
  const RECOVERY_BUDGET_PER_TURN_MS = 20;
  const MAX_TIMEOUT_MS = 60 * 60_000;
  return Math.min(
    MAX_TIMEOUT_MS,
    Math.max(BASE_TIMEOUT_MS, turnCount * RECOVERY_BUDGET_PER_TURN_MS),
  );
}

export class SimulationHost {
  readonly ready: Promise<void>;
  private worker: Worker;
  private sequence = 0;
  private requests = new Map<
    number,
    {
      resolve: (result: any) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private stopped = false;
  constructor(start: GameStartInfo, turns: Turn[] = [], mapsDir?: string) {
    this.worker = new Worker(
      new NodeURL("./Simulation.worker.mjs", import.meta.url),
      {
        workerData: {
          start,
          turns,
          mapsDir:
            mapsDir ??
            fileURLToPath(
              new NodeURL("../../../resources/maps/", import.meta.url),
            ),
        },
      },
    );
    this.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Server simulation initialization timed out"));
        this.stop();
      }, simulationInitializationTimeout(turns.length));
      this.worker.on("message", (result) => {
        if (result.ready) {
          clearTimeout(timeout);
          resolve();
          return;
        }
        const request = this.requests.get(result.id);
        if (!request) return;
        this.requests.delete(result.id);
        clearTimeout(request.timer);
        if (result.error) request.reject(new Error(result.error));
        else request.resolve(result);
      });
      const fail = (error: Error) => {
        clearTimeout(timeout);
        reject(error);
        for (const request of this.requests.values()) {
          clearTimeout(request.timer);
          request.reject(error);
        }
        this.requests.clear();
        this.stopped = true;
      };
      this.worker.on("error", fail);
      this.worker.on("exit", (code) =>
        fail(new Error(`Simulation worker exited (${code})`)),
      );
    });
  }
  private async request(command: object): Promise<any> {
    await this.ready;
    if (this.stopped) throw new Error("Simulation stopped");
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.requests.delete(id);
        reject(new Error("Server simulation request timed out"));
      }, 30_000);
      this.requests.set(id, { resolve, reject, timer });
      this.worker.postMessage({ ...command, id });
    });
  }
  turn(turn: Turn): Promise<TickResult> {
    return this.request({ type: "turn", turn });
  }
  snapshot(): Promise<{ tick: number; packets: Uint8Array[] }> {
    return this.request({ type: "snapshot" });
  }
  query(query: ViewQuery): Promise<{ bytes: Uint8Array }> {
    return this.request({ type: "query", query });
  }
  stop(): void {
    this.stopped = true;
    void this.worker.terminate();
  }
}
