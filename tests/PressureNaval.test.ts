import { TransportShipExecution } from "../src/core/execution/TransportShipExecution";
import { AiAttackBehavior } from "../src/core/execution/utils/AiAttackBehavior";
import {
  PlayerType,
  UnitType,
  type Game,
  type Player,
} from "../src/core/game/Game";
import { canBuildTransportShip } from "../src/core/game/TransportShipUtils";
import { PseudoRandom } from "../src/core/PseudoRandom";
vi.mock("../src/core/game/TransportShipUtils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  canBuildTransportShip: vi.fn(() => 10),
}));

function scenario() {
  vi.mocked(canBuildTransportShip).mockClear();
  vi.mocked(canBuildTransportShip).mockReturnValue(10);
  let ticks = 2000;
  const player = {
    smallID: () => 1,
    troops: () => 100000,
    numTilesOwned: () => 100,
    incomingAttacks: () => [],
    unitCount: () => 0,
    isFriendly: () => false,
    canAttackPlayer: () => true,
    isPlayer: () => true,
    type: () => PlayerType.Nation,
  } as unknown as Player;
  const enemies = Array.from(
    { length: 20 },
    (_, id) =>
      ({
        isAlive: () => true,
        isPlayer: () => true,
        type: () => PlayerType.Nation,
        troops: () => 50000,
        units: () => [{ tile: () => 100 + id }],
      }) as unknown as Player,
  );
  const config = { continuousPressure: "v1", pressureGraceSeconds: 0 };
  const game = {
    ticks: () => ticks,
    elapsedGameSeconds: () => 200,
    inSpawnPhase: () => false,
    players: () => enemies,
    owner: (tile: number) => enemies[tile - 100],
    addExecution: vi.fn(),
    width: () => 10,
    height: () => 10,
    ref: () => 0,
    hasOwner: () => true,
    config: () => ({
      gameConfig: () => config,
      isUnitDisabled: () => false,
      boatMaxNumber: () => 10,
    }),
  } as unknown as Game;
  const behavior = new AiAttackBehavior(
    new PseudoRandom(42),
    game,
    player,
    0.5,
    0.3,
    0.2,
  );
  return {
    game,
    player,
    behavior,
    config,
    advance: () => {
      ticks += 500;
    },
  };
}

test("pressure AI launches a native overseas transport and respects cooldown", () => {
  const { behavior, game } = scenario();
  behavior.maybeAttack();
  expect(game.addExecution).toHaveBeenCalledWith(
    expect.any(TransportShipExecution),
  );
  behavior.maybeAttack();
  expect(game.addExecution).toHaveBeenCalledTimes(1);
});

test("unreachable coasts consume at most two queries per decision", () => {
  const { behavior, game } = scenario();
  vi.mocked(canBuildTransportShip).mockReturnValue(false);
  behavior.maybeAttack();
  expect(canBuildTransportShip).toHaveBeenCalledTimes(2);
  expect(game.addExecution).not.toHaveBeenCalled();
});

test("an invasion gets a follow-up wave, then switches away after no progress", () => {
  const { behavior, advance } = scenario();
  behavior.maybeAttack();
  const first = vi.mocked(canBuildTransportShip).mock.calls[0][2];
  advance();
  behavior.maybeAttack();
  expect(vi.mocked(canBuildTransportShip).mock.calls[1][2]).toBe(first);
  advance();
  behavior.maybeAttack();
  expect(vi.mocked(canBuildTransportShip).mock.calls[2][2]).not.toBe(first);
});

test.each(["allied", "grace", "fleet limit"])(
  "no invasion when %s",
  (reason) => {
    const { behavior, player, config, game } = scenario();
    if (reason === "allied")
      vi.spyOn(player, "isFriendly").mockReturnValue(true);
    if (reason === "grace") config.pressureGraceSeconds = 1000;
    if (reason === "fleet limit")
      vi.spyOn(player, "unitCount").mockImplementation((type) =>
        type === UnitType.TransportShip ? 3 : 0,
      );
    behavior.maybeAttack();
    expect(canBuildTransportShip).not.toHaveBeenCalled();
    expect(game.addExecution).not.toHaveBeenCalled();
  },
);
