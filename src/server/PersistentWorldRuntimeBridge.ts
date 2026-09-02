import { createHash } from "crypto";
import { GameMode, GameType } from "../core/game/Game";
import {
  persistentWorldDurationMs,
  type PersistentWorld,
} from "../core/PersistentWorldSchemas";
import { GameConfigSchema, UsernameSchema } from "../core/Schemas";
import { generateID } from "../core/Util";
import type {
  ManagedReservedSeat,
  MasterCreateManagedGame,
  WorkerManagedGameReady,
  WorkerManagedGameStats,
  WorkerManagedGameTurns,
} from "./IPCBridgeSchema";
import type { MapPlaylist } from "./MapPlaylist";
import type {
  PersistentWorldRepository,
  PersistentWorldRuntime,
  PersistentWorldRuntimeSeat,
} from "./persistent/PersistentWorldRepository";
import type { PersistentWorldRuntimeCoordinator } from "./persistent/PersistentWorldService";

export type ManagedGameDispatcher = (
  command: MasterCreateManagedGame,
) => Promise<WorkerManagedGameReady>;

/**
 * Application-level adapter between durable invitation metadata and the
 * generic managed-game IPC contract. It deliberately owns only the envelope:
 * the actual map, economy, structures, combat, and AI continue to come from
 * the normal OpenFront playlist and simulation.
 */
export class PersistentWorldRuntimeBridge implements PersistentWorldRuntimeCoordinator {
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly attached = new Set<string>();

  constructor(
    private readonly repository: PersistentWorldRepository,
    private readonly playlist: MapPlaylist,
    private readonly dispatch: ManagedGameDispatcher,
  ) {}

  ensure(world: PersistentWorld): Promise<void> {
    const existing = this.inFlight.get(world.id);
    if (existing) return existing;
    const operation = this.ensureOnce(world).finally(() => {
      if (this.inFlight.get(world.id) === operation) {
        this.inFlight.delete(world.id);
      }
    });
    this.inFlight.set(world.id, operation);
    return operation;
  }

  async reconcile(): Promise<void> {
    const worlds = new Map<string, PersistentWorld>();
    for (const world of this.repository.listActiveWithoutRuntime()) {
      worlds.set(world.id, world);
    }
    for (const runtime of [
      ...this.repository.listRuntimeProvisioning(),
      ...this.repository.listRuntimeReady(),
    ]) {
      if (runtime.state === "ready" && this.attached.has(runtime.worldId)) {
        continue;
      }
      const world = this.repository.getWorld(runtime.worldId);
      if (world) worlds.set(world.id, world);
    }
    await Promise.all([...worlds.values()].map((world) => this.ensure(world)));
  }

  /** Call after a worker replacement so ready runtimes are reattached. */
  invalidateWorker(workerGameIds: Iterable<string>): void {
    for (const gameId of workerGameIds) {
      for (const runtime of this.repository.listRuntimeReady()) {
        if (runtime.gameId === gameId) this.attached.delete(runtime.worldId);
      }
    }
  }

  /** Reattach every ready runtime, used when worker membership changes. */
  invalidateAll(): void {
    this.attached.clear();
  }

  /**
   * Durable sink for a shard-authenticated worker turn batch. The request ID
   * resolves the owning world; the game ID is checked again here so a stale
   * or crossed IPC message cannot poison another runtime's replay stream.
   */
  persistTurns(message: WorkerManagedGameTurns): void {
    const runtime = this.repository.getRuntimeByRequestId(message.requestId);
    if (!runtime || runtime.gameId !== message.gameID) {
      throw new Error(
        `Managed turn batch does not match runtime ${message.requestId}`,
      );
    }
    this.repository.appendRuntimeTurns(
      runtime.worldId,
      runtime.requestId,
      message.turns,
    );
  }

  /** Persists consensus simulation state so the hub can warn eliminated RSVPs. */
  persistStats(message: WorkerManagedGameStats): void {
    const runtime = this.repository.getRuntimeByRequestId(message.requestId);
    if (!runtime || runtime.gameId !== message.gameID) {
      throw new Error(
        `Managed stats do not match runtime ${message.requestId}`,
      );
    }
    const world = this.repository.getWorld(runtime.worldId);
    if (!world) throw new Error(`Managed world ${runtime.worldId} is missing`);

    const seats = this.repository.runtimeSeats(world.id);
    const managedSeats = this.managedSeats(world, seats);
    const identityByClientId = new Map(
      managedSeats.map((seat, index) => [
        seat.clientID,
        seats[index].identityId,
      ]),
    );
    const statuses = message.stats.players.flatMap((player) => {
      const identityId = identityByClientId.get(player.clientID);
      return identityId
        ? [
            {
              identityId,
              clientId: player.clientID,
              isAlive: player.isAlive,
              killedBy: player.killedBy,
              deathPosition: player.deathPosition,
            },
          ]
        : [];
    });
    this.repository.recordRuntimePlayerStatuses(
      world.id,
      runtime.requestId,
      message.stats.turn,
      statuses,
    );
  }

  private async ensureOnce(world: PersistentWorld): Promise<void> {
    if (world.phase !== "active") return;

    const seats = this.repository.runtimeSeats(world.id);
    // The worker must receive the entire deterministic roster in one command.
    // Updated clients bind before creating/RSVPing; legacy identities remain
    // in a visible "Preparing map" state until they bind rather than silently
    // becoming unplayable spectators.
    if (
      seats.length === 0 ||
      seats.some((seat) => seat.gameplayPersistentIdHash === null)
    ) {
      return;
    }

    let runtime = this.repository.getRuntime(world.id);
    if (!runtime) {
      const gameConfig = await this.createGameConfig(world);
      runtime = this.repository.reserveRuntime(
        world.id,
        this.runtimeRequestId(world),
        generateID(),
        gameConfig,
        world.startsAt,
        world.startsAt + persistentWorldDurationMs(world.targetDuration),
      );
    }

    const response = await this.dispatch(
      this.command(world, runtime, this.managedSeats(world, seats)),
    );
    if (
      response.requestId !== runtime.requestId ||
      response.gameID !== runtime.gameId
    ) {
      throw new Error("Managed-game acknowledgement did not match its request");
    }
    if (response.outcome === "conflict") {
      throw new Error(`Managed game ${runtime.gameId} conflicts on its worker`);
    }
    this.repository.markRuntimeReady(
      world.id,
      runtime.requestId,
      runtime.gameId,
    );
    this.attached.add(world.id);
  }

  private async createGameConfig(world: PersistentWorld) {
    const upstream = await this.playlist.gameConfig(
      world.mode === "ffa" ? "ffa" : "team",
    );
    return GameConfigSchema.parse({
      ...upstream,
      gameType: GameType.Private,
      gameMode: world.mode === "ffa" ? GameMode.FFA : GameMode.Team,
      maxPlayers: world.maxHumans,
      // Managed worlds begin on schedule even when every human is offline.
      // Use OpenFront's existing random-spawn rule so each frozen RSVP seat
      // owns a viable nation from tick zero and can be claimed hours later.
      // Without it, a player's first connection after the normal 30-second
      // spawn phase could replay the map but could never enter the match.
      randomSpawn: true,
      publicGameModifiers: {
        ...upstream.publicGameModifiers,
        isRandomSpawn: true,
      },
      // In-sync clients vote on deterministic player state. The master stores
      // the agreed result so elimination survives worker and web restarts.
      liveStatsEnabled: true,
      // Team choices are pinned into the roster below. Two named sides are
      // the wizard's present contract; the rest of the upstream team rules
      // (donations, nations, structures, etc.) remain untouched.
      playerTeams: world.mode === "teams" ? 2 : undefined,
    });
  }

  private command(
    _world: PersistentWorld,
    runtime: PersistentWorldRuntime,
    reservedSeats: ManagedReservedSeat[],
  ): MasterCreateManagedGame {
    return {
      type: "createManagedGame",
      requestId: runtime.requestId,
      gameID: runtime.gameId,
      gameConfig: runtime.gameConfig,
      startsAt: runtime.startsAt,
      expiresAt: runtime.expiresAt,
      reservedSeats,
      initialTurns: this.repository.loadRuntimeTurns(runtime.worldId),
    };
  }

  private managedSeats(
    world: PersistentWorld,
    seats: PersistentWorldRuntimeSeat[],
  ): ManagedReservedSeat[] {
    const teamIds = [
      ...new Set(
        seats
          .map((seat) => seat.teamId)
          .filter((teamId): teamId is string => teamId !== null),
      ),
    ].sort();
    const usedClientIds = new Set<string>();
    return seats.map((seat, index) => ({
      clientID: this.clientId(world.id, seat.identityId, usedClientIds),
      persistentIdHash: seat.gameplayPersistentIdHash!,
      username: this.gameplayName(seat.displayName, index),
      clanTag: null,
      teamIndex:
        world.mode === "teams"
          ? Math.max(0, teamIds.indexOf(seat.teamId ?? "")) % 2
          : undefined,
    }));
  }

  private clientId(
    worldId: string,
    identityId: string,
    used: Set<string>,
  ): string {
    for (let salt = 0; salt < 100; salt++) {
      const id = createHash("sha256")
        .update(`${worldId}:${identityId}:${salt}`)
        .digest("hex")
        .slice(0, 8);
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
    throw new Error("Could not allocate a unique managed client ID");
  }

  private runtimeRequestId(world: PersistentWorld): string {
    return `runtime_${createHash("sha256")
      .update(`${world.id}:${world.startsAt}:${world.createdAt}`)
      .digest("hex")
      .slice(0, 24)}`;
  }

  private gameplayName(displayName: string, index: number): string {
    const cleaned = displayName
      .normalize("NFKC")
      .replace(/[^a-zA-Z0-9_ üÜ.]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 27);
    const candidate = cleaned.length >= 3 ? cleaned : `Cmd ${cleaned}`.trim();
    const parsed = UsernameSchema.safeParse(candidate);
    return parsed.success ? parsed.data : `Commander ${index + 1}`;
  }
}
