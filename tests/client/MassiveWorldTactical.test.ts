import { describe, expect, it } from "vitest";
import {
  buildMassiveWorldTacticalGameStartInfo,
  MassiveWorldTacticalOptions,
} from "../../src/client/experimental/massive-world/MassiveWorldTactical";
import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
} from "../../src/core/game/Game";
import { GameStartInfoSchema, PlayerCosmetics } from "../../src/core/Schemas";

const cosmetics: PlayerCosmetics = {
  color: { color: "#d8c7a3" },
  verified: true,
};

function options(
  overrides: Partial<MassiveWorldTacticalOptions> = {},
): MassiveWorldTacticalOptions {
  return {
    gameID: "GAME0001",
    clientID: "CLIENT01",
    lobbyCreatedAt: 1_725_000_000_000,
    username: "Atlas User",
    cosmetics,
    isMobile: false,
    oceanTravelUnlocked: false,
    ...overrides,
  };
}

describe("buildMassiveWorldTacticalGameStartInfo", () => {
  it("builds a deterministic desktop river encounter with stock rules", () => {
    const input = options();
    const first = buildMassiveWorldTacticalGameStartInfo(input);
    const second = buildMassiveWorldTacticalGameStartInfo(input);

    expect(GameStartInfoSchema.safeParse(first).success).toBe(true);
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      gameID: "GAME0001",
      lobbyCreatedAt: 1_725_000_000_000,
      players: [
        {
          clientID: "CLIENT01",
          username: "Atlas User",
          clanTag: null,
          cosmetics,
        },
      ],
      config: {
        gameMap: GameMapType.AmazonRiver,
        gameMapSize: GameMapSize.Normal,
        gameType: GameType.Singleplayer,
        gameMode: GameMode.FFA,
        difficulty: Difficulty.Medium,
        bots: 120,
        nations: "default",
        donateGold: false,
        donateTroops: false,
        infiniteGold: false,
        infiniteTroops: false,
        instantBuild: false,
        randomSpawn: true,
        disabledUnits: [],
      },
    });
    expect(first.config.hostCheats).toBeUndefined();
  });

  it("uses the compact world map on mobile after ocean travel unlocks", () => {
    const gameStartInfo = buildMassiveWorldTacticalGameStartInfo(
      options({
        gameID: "GAME0002",
        clientID: "CLIENT02",
        lobbyCreatedAt: 1_725_000_000_500,
        username: "Mobile User",
        cosmetics: undefined,
        isMobile: true,
        oceanTravelUnlocked: true,
      }),
    );

    expect(() => GameStartInfoSchema.parse(gameStartInfo)).not.toThrow();
    expect(gameStartInfo.gameID).toBe("GAME0002");
    expect(gameStartInfo.lobbyCreatedAt).toBe(1_725_000_000_500);
    expect(gameStartInfo.players).toEqual([
      {
        clientID: "CLIENT02",
        username: "Mobile User",
        clanTag: null,
      },
    ]);
    expect(gameStartInfo.config.gameMap).toBe(GameMapType.World);
    expect(gameStartInfo.config.gameMapSize).toBe(GameMapSize.Compact);
    expect(gameStartInfo.config.bots).toBe(120);
    expect(gameStartInfo.config.nations).toBe("default");
    expect(gameStartInfo.config.disabledUnits).toEqual([]);
    expect(gameStartInfo.config.hostCheats).toBeUndefined();
  });
});
