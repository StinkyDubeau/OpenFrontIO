import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rendererMocks = vi.hoisted(() => ({
  construct: vi.fn(),
  fit: vi.fn(),
  start: vi.fn(),
  resume: vi.fn(),
  suspend: vi.fn(),
  destroy: vi.fn(),
  updateState: vi.fn(),
}));
const rendererStatus = vi.hoisted(() => ({
  callback: null as ((message: string | null) => void) | null,
}));
const getPlayerCosmeticsMock = vi.hoisted(() => vi.fn());
const generateIDMock = vi.hoisted(() => vi.fn());
const genAnonUsernameMock = vi.hoisted(() => vi.fn());
const requestHapticMock = vi.hoisted(() => vi.fn());

vi.mock(
  "../../src/client/experimental/massive-world/MassiveWorldRenderer",
  () => ({
    MassiveWorldRenderer: class {
      cameraX = 32;
      cameraY = 16;
      zoom = 12;

      constructor(
        canvas: HTMLCanvasElement,
        model: unknown,
        onContextStatus?: (message: string | null) => void,
      ) {
        rendererMocks.construct(canvas, model);
        rendererStatus.callback = onContextStatus ?? null;
      }

      fit() {
        rendererMocks.fit();
      }

      start() {
        rendererMocks.start();
      }

      resume() {
        rendererMocks.resume();
      }

      suspend() {
        rendererMocks.suspend();
      }

      destroy() {
        rendererMocks.destroy();
      }

      updateState(model: unknown) {
        rendererMocks.updateState(model);
      }
    },
  }),
);

vi.mock("../../src/client/Cosmetics", () => ({
  getPlayerCosmetics: getPlayerCosmeticsMock,
}));

vi.mock("../../src/client/UsernameInput", () => ({
  genAnonUsername: genAnonUsernameMock,
  UsernameInput: class extends HTMLElement {},
}));

vi.mock("../../src/client/ui/Haptics", () => ({
  requestHaptic: requestHapticMock,
}));

vi.mock("../../src/core/Util", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/core/Util")>()),
  generateID: generateIDMock,
}));

import { MassiveSectorTerrain } from "../../src/client/experimental/massive-world/MassiveWorldModel";
import "../../src/client/experimental/massive-world/MassiveWorldPage";
import type { MassiveWorldPage } from "../../src/client/experimental/massive-world/MassiveWorldPage";
import { beginMassiveWorldTacticalSession } from "../../src/client/experimental/massive-world/MassiveWorldSession";
import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
} from "../../src/core/game/Game";
import { GameStartInfo, GameStartInfoSchema } from "../../src/core/Schemas";

const RETURN_ROUTE_KEY = "idlefront.experimental.massive-world.return";
const ACTIVE_SECTOR_KEY = "idlefront.experimental.massive-world.active-sector";
const NOW = 1_725_000_000_000;

interface JoinLobbyDetail {
  gameID: string;
  gameStartInfo: GameStartInfo;
  source: string;
}

async function settle(page: MassiveWorldPage): Promise<void> {
  await Promise.resolve();
  await page.updateComplete;
  await Promise.resolve();
}

async function mount(duration = "7d"): Promise<MassiveWorldPage> {
  history.replaceState(
    null,
    "",
    `/experimental/massive-world?duration=${duration}`,
  );
  const page = document.createElement("massive-world-page") as MassiveWorldPage;
  page.hidden = true;
  document.body.appendChild(page);
  await settle(page);
  return page;
}

describe("experimental massive world page", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    localStorage.clear();
    sessionStorage.clear();
    document.body.replaceChildren();
    document.body.classList.remove("in-game");
    window.currentPageId = "page-massive-world";

    for (const mock of Object.values(rendererMocks)) mock.mockReset();
    rendererStatus.callback = null;
    getPlayerCosmeticsMock.mockReset().mockResolvedValue({
      color: { color: "#d8c7a3" },
    });
    generateIDMock
      .mockReset()
      .mockReturnValueOnce("TACT0001")
      .mockReturnValueOnce("SEAT0001");
    genAnonUsernameMock.mockReset().mockReturnValue("Atlas Guest");
    requestHapticMock.mockReset();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    document.body.classList.remove("in-game");
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, "", "/");
    Reflect.deleteProperty(window, "matchMedia");
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("selects the duration model from the URL", async () => {
    const page = await mount("1h");

    const selected = page.querySelector<HTMLButtonElement>(
      '.mw-duration__option[aria-pressed="true"]',
    );
    expect(selected?.textContent?.trim()).toBe("1 hour");
    expect((page as any).duration).toBe("1h");
    expect((page as any).model.pacing.duration).toBe("1h");
    expect(rendererMocks.construct).not.toHaveBeenCalled();
  });

  it("mounts after reveal and resumes the existing renderer on a later open", async () => {
    const page = await mount();
    expect(rendererMocks.construct).not.toHaveBeenCalled();

    page.hidden = false;
    page.open();
    await settle(page);

    expect(rendererMocks.construct).toHaveBeenCalledTimes(1);
    expect(rendererMocks.fit).toHaveBeenCalledTimes(1);
    expect(rendererMocks.start).toHaveBeenCalledTimes(1);
    expect(rendererMocks.resume).not.toHaveBeenCalled();

    window.dispatchEvent(new CustomEvent("showPage", { detail: "page-home" }));
    expect(rendererMocks.suspend).toHaveBeenCalledTimes(1);

    page.open();
    await settle(page);
    expect(rendererMocks.construct).toHaveBeenCalledTimes(1);
    expect(rendererMocks.resume).toHaveBeenCalledTimes(1);
  });

  it("surfaces a renderer recovery failure and offers a clean retry", async () => {
    const page = await mount();
    page.hidden = false;
    page.open();
    await settle(page);
    expect(rendererStatus.callback).not.toBeNull();

    rendererStatus.callback!("Map graphics could not recover.");
    await settle(page);
    const retry = page.querySelector<HTMLButtonElement>(
      ".mw-feedback.is-error button",
    );
    expect(retry?.textContent?.trim()).toBe("Retry map");

    retry!.click();
    await settle(page);
    await settle(page);
    expect(rendererMocks.destroy).toHaveBeenCalledTimes(1);
    expect(rendererMocks.construct).toHaveBeenCalledTimes(2);
  });

  it("hands a non-ocean sector to stock OpenFront and suspends the atlas", async () => {
    const page = await mount("7d");
    page.hidden = false;
    page.open();
    await settle(page);

    const sector = (page as any).model.sector();
    expect(sector.terrain).not.toBe(MassiveSectorTerrain.Ocean);

    const events: CustomEvent<JoinLobbyDetail>[] = [];
    page.addEventListener("join-lobby", (event) => {
      events.push(event as CustomEvent<JoinLobbyDetail>);
    });

    page.querySelector<HTMLButtonElement>(".mw-action--enter")!.click();
    await Promise.resolve();
    await Promise.resolve();
    await settle(page);
    expect(events).toHaveLength(1);

    const detail = events[0].detail;
    expect(detail.source).toBe("massive-world");
    expect(detail.gameID).toBe("TACT0001");
    expect(GameStartInfoSchema.safeParse(detail.gameStartInfo).success).toBe(
      true,
    );
    expect(detail.gameStartInfo).toMatchObject({
      gameID: "TACT0001",
      lobbyCreatedAt: NOW,
      players: [
        {
          clientID: "SEAT0001",
          username: "Atlas Guest",
          clanTag: null,
          cosmetics: { color: { color: "#d8c7a3" } },
        },
      ],
      config: {
        gameMap: GameMapType.AmazonRiver,
        gameMapSize: GameMapSize.Compact,
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
    expect(detail.gameStartInfo.config.hostCheats).toBeUndefined();

    expect(sessionStorage.getItem(RETURN_ROUTE_KEY)).toBe(
      "/experimental/massive-world?duration=7d",
    );
    expect(JSON.parse(sessionStorage.getItem(ACTIVE_SECTOR_KEY)!)).toEqual({
      duration: "7d",
      sectorIndex: sector.index,
      sectorName: sector.name,
      gameID: "TACT0001",
      enteredAt: NOW,
    });
    expect(rendererMocks.suspend).toHaveBeenCalledTimes(1);
    expect((page as any).tickTimer).toBeUndefined();
  });

  it("does not enter a distant land sector outside the current frontier", async () => {
    const page = await mount("7d");
    page.hidden = false;
    page.open();
    await settle(page);

    const model = (page as any).model;
    let distantLandIndex = -1;
    for (let index = 0; index < model.terrain.length; index++) {
      const candidate = model.sector(index);
      if (
        candidate.terrain !== MassiveSectorTerrain.Ocean &&
        !candidate.isPlayer &&
        !candidate.isAttackable
      ) {
        distantLandIndex = index;
        break;
      }
    }
    expect(distantLandIndex).toBeGreaterThanOrEqual(0);

    model.selectedIndex = distantLandIndex;
    page.requestUpdate();
    await settle(page);

    const enterButton =
      page.querySelector<HTMLButtonElement>(".mw-action--enter")!;
    expect(enterButton.disabled).toBe(true);

    const events: CustomEvent<JoinLobbyDetail>[] = [];
    page.addEventListener("join-lobby", (event) => {
      events.push(event as CustomEvent<JoinLobbyDetail>);
    });
    await (page as any).enterSector();

    expect(events).toHaveLength(0);
    expect(generateIDMock).not.toHaveBeenCalled();
    expect((page as any).enteringSector).toBe(false);
  });

  it("captures a reachable atlas sector after a stock tactical victory", async () => {
    const page = await mount("1d");
    const model = (page as any).model;
    let frontierIndex = -1;
    for (let index = 0; index < model.terrain.length; index++) {
      if (model.sector(index).isAttackable) {
        frontierIndex = index;
        break;
      }
    }
    expect(frontierIndex).toBeGreaterThanOrEqual(0);
    const frontier = model.sector(frontierIndex);
    beginMassiveWorldTacticalSession({
      duration: "1d",
      sectorIndex: frontierIndex,
      sectorName: frontier.name,
      gameID: "TACTICAL-VICTORY",
      enteredAt: NOW,
      result: "victory",
    });

    page.hidden = false;
    page.open();
    await settle(page);

    expect(model.sector(frontierIndex).isPlayer).toBe(true);
    expect((page as any).feedback).toBe(
      `${frontier.name} secured by tactical victory.`,
    );
    expect(sessionStorage.getItem(ACTIVE_SECTOR_KEY)).toBeNull();
    expect(requestHapticMock).toHaveBeenCalledWith("success");
  });

  it("destroys timers, pointers, and renderer lifecycle when removed", async () => {
    const page = await mount();
    page.hidden = false;
    page.open();
    await settle(page);
    (page as any).pointers.set(1, {
      x: 1,
      y: 1,
      startX: 1,
      startY: 1,
    });
    (page as any).schedulePersistence();

    expect((page as any).tickTimer).toBeDefined();
    expect((page as any).saveTimer).toBeDefined();
    page.remove();

    expect(rendererMocks.destroy).toHaveBeenCalledTimes(1);
    expect((page as any).renderer).toBeNull();
    expect((page as any).tickTimer).toBeUndefined();
    expect((page as any).saveTimer).toBeUndefined();
    expect((page as any).pointers.size).toBe(0);

    const resumeCalls = rendererMocks.resume.mock.calls.length;
    window.dispatchEvent(
      new CustomEvent("showPage", { detail: "page-massive-world" }),
    );
    expect(rendererMocks.resume).toHaveBeenCalledTimes(resumeCalls);
  });
});
