import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  NewPersistentWorldControllerSession,
  PersistentWorldControllerSession,
  PersistentWorldLobbySnapshot,
} from "../../src/core/PersistentWorldSchemas";

const getPlayTokenMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/client/Auth", () => ({
  getPlayToken: getPlayTokenMock,
}));

import { persistentWorldApi } from "../../src/client/PersistentWorldApi";
import "../../src/client/components/persistent-world/PersistentWorldPage";
import type { PersistentWorldPage } from "../../src/client/components/persistent-world/PersistentWorldPage";

const CONTROLLER_TOKEN = "session_this-is-a-long-controller-token";
const PLAY_TOKEN = "opaque-play-token";

function controllerSession(): PersistentWorldControllerSession {
  return {
    id: "session_123",
    identity: {
      id: "identity_123",
      kind: "guest",
      subject: "guest_123",
      displayName: "Atlas Tester",
      verifiedEmail: null,
    },
    createdAt: 1_000,
    lastUsedAt: 1_000,
  };
}

function createdSession(): NewPersistentWorldControllerSession {
  return {
    session: controllerSession(),
    bearerToken: CONTROLLER_TOKEN,
  };
}

function lobbySnapshot(): PersistentWorldLobbySnapshot {
  return {
    revision: 1,
    serverTime: 2_000,
    world: {
      id: "world_123",
      name: "One Day Table",
      targetDuration: "1d",
      access: "public",
      mode: "ffa",
      maxHumans: 8,
      phase: "scheduled",
      startsAt: 10_000,
      joinClosesAt: 20_000,
      scheduleLocked: false,
      createdAt: 1_000,
      activatedAt: null,
    },
    members: [],
    quickChat: [],
    reminderOptionsMs: [],
    selectedReminderLeadTimesMs: [],
    viewer: {
      identity: null,
      isMember: false,
      isHost: false,
      canRsvp: true,
      canChat: false,
      canCancel: false,
      hasVerifiedEmail: false,
    },
    runtimeGameId: null,
  };
}

interface PageInternals {
  session: PersistentWorldControllerSession | null;
  snapshot: PersistentWorldLobbySnapshot | null;
  identityName: string;
  identityContinuation: "create" | "rsvp";
  resumeIdentity(): Promise<void>;
  createIdentity(): Promise<void>;
}

function pageInternals(): PageInternals {
  return document.createElement(
    "persistent-world-page",
  ) as PersistentWorldPage as unknown as PageInternals;
}

describe("persistent-world game identity binding", () => {
  beforeEach(() => {
    localStorage.clear();
    getPlayTokenMock.mockReset().mockResolvedValue(PLAY_TOKEN);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("binds a resumed controller session before exposing it to world flows", async () => {
    localStorage.setItem(
      "pressure-atlas.world-controller.v1",
      CONTROLLER_TOKEN,
    );
    const steps: string[] = [];
    vi.spyOn(persistentWorldApi, "resumeSession").mockImplementation(
      async () => {
        steps.push("resume");
        return controllerSession();
      },
    );
    getPlayTokenMock.mockImplementation(async () => {
      steps.push("play-token");
      return PLAY_TOKEN;
    });
    vi.spyOn(persistentWorldApi, "bindGameIdentity").mockImplementation(
      async () => {
        steps.push("bind");
      },
    );
    const page = pageInternals();

    await page.resumeIdentity();

    expect(steps).toEqual(["resume", "play-token", "bind"]);
    expect(persistentWorldApi.bindGameIdentity).toHaveBeenCalledWith(
      PLAY_TOKEN,
    );
    expect(page.session).toEqual(controllerSession());
  });

  it("binds a new guest before continuing into RSVP", async () => {
    const steps: string[] = [];
    vi.spyOn(persistentWorldApi, "createGuestSession").mockImplementation(
      async () => {
        steps.push("create-session");
        return createdSession();
      },
    );
    getPlayTokenMock.mockImplementation(async () => {
      steps.push("play-token");
      return PLAY_TOKEN;
    });
    vi.spyOn(persistentWorldApi, "bindGameIdentity").mockImplementation(
      async () => {
        steps.push("bind");
      },
    );
    vi.spyOn(persistentWorldApi, "rsvp").mockImplementation(async () => {
      steps.push("rsvp");
      return lobbySnapshot();
    });
    const page = pageInternals();
    page.identityName = "Atlas Tester";
    page.identityContinuation = "rsvp";
    page.snapshot = lobbySnapshot();

    await page.createIdentity();

    expect(steps).toEqual(["create-session", "play-token", "bind", "rsvp"]);
    expect(persistentWorldApi.bindGameIdentity).toHaveBeenCalledWith(
      PLAY_TOKEN,
    );
  });
});
