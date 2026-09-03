import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
} from "../../../core/game/Game";
import {
  ClientID,
  GameID,
  GameStartInfo,
  GameStartInfoSchema,
  PlayerCosmetics,
} from "../../../core/Schemas";

export interface MassiveWorldTacticalOptions {
  gameID: GameID;
  clientID: ClientID;
  lobbyCreatedAt: number;
  username: string;
  cosmetics?: PlayerCosmetics;
  isMobile: boolean;
  oceanTravelUnlocked: boolean;
}

/**
 * Builds the local-game handoff for a massive-world tactical encounter.
 *
 * The strategic layer only chooses which existing map and scale to use. Every
 * simulation rule below is an ordinary OpenFront single-player rule so the
 * tactical encounter stays replay-compatible with the stock engine.
 */
export function buildMassiveWorldTacticalGameStartInfo(
  options: MassiveWorldTacticalOptions,
): GameStartInfo {
  return GameStartInfoSchema.parse({
    gameID: options.gameID,
    lobbyCreatedAt: options.lobbyCreatedAt,
    players: [
      {
        clientID: options.clientID,
        username: options.username,
        clanTag: null,
        ...(options.cosmetics === undefined
          ? {}
          : { cosmetics: options.cosmetics }),
      },
    ],
    config: {
      gameMap: options.oceanTravelUnlocked
        ? GameMapType.World
        : GameMapType.AmazonRiver,
      gameMapSize: options.isMobile ? GameMapSize.Compact : GameMapSize.Normal,
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
}
