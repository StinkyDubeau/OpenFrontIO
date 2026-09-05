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
  constructor(start: GameStartInfo, turns: Turn[] = []) {
    this.worker = new Worker(
      new NodeURL("./Simulation.worker.mjs", import.meta.url),
      {
        workerData: {
          start,
          turns,
          mapsDir: fileURLToPath(
            new NodeURL("../../../resources/maps/", import.meta.url),
          ),
        },
      },
    );
    this.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Server simulation initialization timed out"));
        this.stop();
      }, 180_000);
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
