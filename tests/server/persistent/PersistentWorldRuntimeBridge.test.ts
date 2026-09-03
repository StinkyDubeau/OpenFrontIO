import { createHash } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
} from "../../../src/core/game/Game";
import type { GameConfig } from "../../../src/core/Schemas";
import type {
  MasterCreateManagedGame,
  WorkerManagedGameReady,
  WorkerManagedGameStats,
  WorkerManagedGameTurns,
} from "../../../src/server/IPCBridgeSchema";
import type { MapPlaylist } from "../../../src/server/MapPlaylist";
import { PersistentWorldRepository } from "../../../src/server/persistent/PersistentWorldRepository";
import { PersistentWorldService } from "../../../src/server/persistent/PersistentWorldService";
import { PersistentWorldRuntimeBridge } from "../../../src/server/PersistentWorldRuntimeBridge";

const MINUTE = 60_000;
const UPSTREAM_CONFIG: GameConfig = {
  donateGold: false,
  donateTroops: false,
  gameMap: GameMapType.World,
  gameType: GameType.Public,
  gameMapSize: GameMapSize.Normal,
  difficulty: Difficulty.Medium,
  nations: "default",
  infiniteGold: false,
  infiniteTroops: false,
  maxTimerValue: undefined,
  instantBuild: false,
  randomSpawn: false,
  gameMode: GameMode.FFA,
  bots: 400,
  disabledUnits: [],
};

describe("persistent-world runtime bridge", () => {
  let now: number;
  let repository: PersistentWorldRepository;
  let service: PersistentWorldService;

  beforeEach(() => {
    now = Date.UTC(2026, 8, 2, 12);
    repository = new PersistentWorldRepository({
      dbPath: ":memory:",
      now: () => now,
    });
    service = new PersistentWorldService(repository, { now: () => now });
  });

  afterEach(() => service.close());

  function setup() {
    const host = service.createGuestSession({ displayName: "Map Keeper" });
    const gameplayHash = createHash("sha256")
      .update("play-identity")
      .digest("hex");
    service.bindGameplayIdentity(host.bearerToken, gameplayHash);
    const created = service.createWorld(host.bearerToken, {
      name: "One Day Test",
      targetDuration: "1d",
      access: "public",
      mode: "ffa",
      maxHumans: 4,
      startsAt: now + MINUTE,
    });
    now += MINUTE;
    const world = repository.markActive(created.snapshot.world.id, now);
    return { host, gameplayHash, world };
  }

  it("freezes bound RSVP seats and exposes only an acknowledged runtime", async () => {
    const { host, gameplayHash, world } = setup();
    const gameConfig = vi.fn(async () => UPSTREAM_CONFIG);
    const commands: MasterCreateManagedGame[] = [];
    const dispatch = vi.fn(
      async (
        command: MasterCreateManagedGame,
      ): Promise<WorkerManagedGameReady> => {
        commands.push(command);
        return {
          type: "managedGameReady",
          requestId: command.requestId,
          gameID: command.gameID,
          workerId: 0,
          outcome: "created",
        };
      },
    );
    const bridge = new PersistentWorldRuntimeBridge(
      repository,
      { gameConfig } as unknown as MapPlaylist,
      dispatch,
    );

    expect(service.getSnapshot(world.id, host.bearerToken).runtimeGameId).toBe(
      null,
    );
    await bridge.ensure(world);

    const runtime = repository.getRuntime(world.id)!;
    expect(runtime.state).toBe("ready");
    expect(runtime.expiresAt - runtime.startsAt).toBe(24 * 60 * 60 * 1000);
    expect(runtime.gameConfig).toMatchObject({
      gameType: GameType.Private,
      maxPlayers: 4,
      gameMode: GameMode.FFA,
      gameMap: GameMapType.ExpandedGiantWorld,
      bots: 2000,
      randomSpawn: true,
      publicGameModifiers: expect.objectContaining({ isRandomSpawn: true }),
      liveStatsEnabled: true,
    });
    expect(commands).toHaveLength(1);
    expect(commands[0].initialTurns).toEqual([]);
    expect(commands[0].reservedSeats).toEqual([
      expect.objectContaining({
        persistentIdHash: gameplayHash,
        username: "Map Keeper",
        clanTag: null,
      }),
    ]);
    expect(service.getSnapshot(world.id, host.bearerToken).runtimeGameId).toBe(
      runtime.gameId,
    );

    const statsMessage: WorkerManagedGameStats = {
      type: "managedGameStats",
      requestId: runtime.requestId,
      gameID: runtime.gameId,
      workerId: 0,
      stats: {
        turn: 240,
        players: [
          {
            clientID: commands[0].reservedSeats[0].clientID,
            tilesOwned: 0,
            troops: 0,
            gold: "0",
            isAlive: false,
            team: null,
            killedBy: null,
            deathPosition: 2,
          },
        ],
      },
    };
    bridge.persistStats(statsMessage);
    expect(service.listMine(host.bearerToken)[0]).toMatchObject({
      viewerEliminated: true,
    });
    expect(
      repository.runtimePlayerStatus(world.id, host.session.identity.id),
    ).toMatchObject({
      clientId: commands[0].reservedSeats[0].clientID,
      isAlive: false,
      observedTurn: 240,
    });

    await bridge.reconcile();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("persists worker turns and replays the same runtime after a master restart", async () => {
    const { world } = setup();
    const firstDispatch = vi.fn(
      async (
        command: MasterCreateManagedGame,
      ): Promise<WorkerManagedGameReady> => ({
        type: "managedGameReady",
        requestId: command.requestId,
        gameID: command.gameID,
        workerId: 0,
        outcome: "created",
      }),
    );
    const bridge = new PersistentWorldRuntimeBridge(
      repository,
      {
        gameConfig: vi.fn(async () => UPSTREAM_CONFIG),
      } as unknown as MapPlaylist,
      firstDispatch,
    );

    await bridge.ensure(world);
    const runtime = repository.getRuntime(world.id)!;
    const turnMessage: WorkerManagedGameTurns = {
      type: "managedGameTurns",
      requestId: runtime.requestId,
      gameID: runtime.gameId,
      workerId: 0,
      turns: [
        { turnNumber: 0, intents: [] },
        { turnNumber: 1, intents: [], hash: 17 },
      ],
    };
    bridge.persistTurns(turnMessage);
    expect(repository.loadRuntimeTurns(world.id)).toEqual(turnMessage.turns);

    expect(() =>
      bridge.persistTurns({ ...turnMessage, gameID: "Wrong123" }),
    ).toThrow("does not match runtime");
    expect(repository.loadRuntimeTurns(world.id)).toEqual(turnMessage.turns);

    const recoveredCommands: MasterCreateManagedGame[] = [];
    const recoveredDispatch = vi.fn(
      async (
        command: MasterCreateManagedGame,
      ): Promise<WorkerManagedGameReady> => {
        recoveredCommands.push(command);
        return {
          type: "managedGameReady",
          requestId: command.requestId,
          gameID: command.gameID,
          workerId: 1,
          outcome: "created",
        };
      },
    );
    const gameConfig = vi.fn(async () => {
      throw new Error("A recovered runtime must use its persisted config");
    });
    const recoveredBridge = new PersistentWorldRuntimeBridge(
      repository,
      { gameConfig } as unknown as MapPlaylist,
      recoveredDispatch,
    );

    await recoveredBridge.reconcile();

    expect(gameConfig).not.toHaveBeenCalled();
    expect(recoveredDispatch).toHaveBeenCalledTimes(1);
    expect(recoveredCommands[0]).toMatchObject({
      requestId: runtime.requestId,
      gameID: runtime.gameId,
      gameConfig: runtime.gameConfig,
      initialTurns: turnMessage.turns,
    });
  });

  it("waits rather than creating an unusable game when an RSVP is unbound", async () => {
    const host = service.createGuestSession({ displayName: "Legacy Host" });
    const created = service.createWorld(host.bearerToken, {
      name: "Waiting World",
      targetDuration: "1d",
      access: "public",
      mode: "ffa",
      maxHumans: 2,
      startsAt: now + MINUTE,
    });
    now += MINUTE;
    const world = repository.markActive(created.snapshot.world.id, now);
    const dispatch = vi.fn();
    const bridge = new PersistentWorldRuntimeBridge(
      repository,
      {
        gameConfig: vi.fn(async () => UPSTREAM_CONFIG),
      } as unknown as MapPlaylist,
      dispatch,
    );

    await bridge.ensure(world);

    expect(repository.getRuntime(world.id)).toBeUndefined();
    expect(dispatch).not.toHaveBeenCalled();
    expect(service.getSnapshot(world.id, host.bearerToken).runtimeGameId).toBe(
      null,
    );
  });
});
