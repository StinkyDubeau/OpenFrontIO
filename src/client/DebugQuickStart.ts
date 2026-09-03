import type {
  PersistentWorldCard,
  PersistentWorldControllerSession,
  PersistentWorldLobbySnapshot,
} from "../core/PersistentWorldSchemas";
import { getPlayToken } from "./Auth";
import type { JoinLobbyEvent } from "./Main";
import {
  persistentWorldApi,
  PersistentWorldApiError,
} from "./PersistentWorldApi";
import { runtimeDebugEnabled } from "./RuntimeDebug";

// Long enough for a second device to hit Quick join, short enough to stay a
// one-action developer loop.
const QUICK_START_DELAY_MS = 12_000;
const RUNTIME_WAIT_MS = 120_000;

export type DebugQuickStartStatus = (message: string) => void;

function suggestedName(): string {
  const input = document.querySelector("username-input") as {
    getUsername?: () => string;
  } | null;
  return input?.getUsername?.().trim() || "Playtester";
}

async function ensureSession(): Promise<PersistentWorldControllerSession> {
  let session: PersistentWorldControllerSession | null = null;
  if (persistentWorldApi.sessionToken()) {
    try {
      session = await persistentWorldApi.resumeSession();
    } catch (error) {
      if (!(error instanceof PersistentWorldApiError) || error.status !== 401) {
        throw error;
      }
      persistentWorldApi.forgetSession();
    }
  }
  if (!session) {
    session = (await persistentWorldApi.createGuestSession(suggestedName()))
      .session;
  }
  await persistentWorldApi.bindGameIdentity(await getPlayToken());
  return session;
}

function enterRuntime(gameID: string): void {
  document.dispatchEvent(
    new CustomEvent("join-lobby", {
      detail: { gameID, source: "persistent-world" } as JoinLobbyEvent,
      bubbles: true,
      composed: true,
    }),
  );
}

async function waitForRuntime(
  worldId: string,
  status: DebugQuickStartStatus,
): Promise<PersistentWorldLobbySnapshot> {
  const deadline = Date.now() + RUNTIME_WAIT_MS;
  while (Date.now() < deadline) {
    const snapshot = await persistentWorldApi.getSnapshot(worldId);
    if (snapshot.runtimeGameId) return snapshot;
    const seconds = Math.max(
      1,
      Math.ceil((snapshot.world.startsAt - snapshot.serverTime) / 1_000),
    );
    status(
      snapshot.world.phase === "scheduled"
        ? `Starting in ${seconds}s…`
        : "Allocating the Expanded Earth worker…",
    );
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error("The debug game did not become ready within two minutes");
}

function activeFirst(cards: PersistentWorldCard[]): PersistentWorldCard[] {
  return [...cards].sort((a, b) => {
    const score = (card: PersistentWorldCard) => {
      if (card.isViewerMember && card.world.phase === "active") return 0;
      if (card.world.phase === "scheduled") return 1;
      return 2;
    };
    return score(a) - score(b) || b.world.createdAt - a.world.createdAt;
  });
}

export async function quickStartDebugGame(
  status: DebugQuickStartStatus = () => undefined,
): Promise<string> {
  if (!runtimeDebugEnabled()) throw new Error("Runtime debug mode is disabled");
  status("Binding the test identity…");
  await ensureSession();
  status("Creating a test world…");
  const created = await persistentWorldApi.createWorld({
    name: `Expanded Earth test ${new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`,
    targetDuration: "1h",
    access: "public",
    mode: "ffa",
    maxHumans: 2,
    startsAt: Date.now() + QUICK_START_DELAY_MS,
  });
  const ready = await waitForRuntime(created.snapshot.world.id, status);
  status("Joining the test game…");
  enterRuntime(ready.runtimeGameId!);
  return ready.world.id;
}

export async function quickJoinDebugGame(
  status: DebugQuickStartStatus = () => undefined,
): Promise<string> {
  if (!runtimeDebugEnabled()) throw new Error("Runtime debug mode is disabled");
  status("Finding a running test world…");
  await ensureSession();
  const [mine, publicWorlds] = await Promise.all([
    persistentWorldApi.listMine(),
    persistentWorldApi.listPublic(),
  ]);
  const seen = new Set<string>();
  const candidates = activeFirst([...mine, ...publicWorlds]).filter((card) => {
    if (
      seen.has(card.world.id) ||
      !card.world.name.startsWith("Expanded Earth test ") ||
      (card.world.phase !== "active" && card.world.phase !== "scheduled")
    ) {
      return false;
    }
    seen.add(card.world.id);
    return true;
  });

  for (const card of candidates) {
    let snapshot = await persistentWorldApi.getSnapshot(card.world.id);
    if (!snapshot.viewer.isMember && snapshot.viewer.canRsvp) {
      snapshot = await persistentWorldApi.rsvp(card.world.id);
    }
    if (!snapshot.viewer.isMember) continue;
    if (!snapshot.runtimeGameId) {
      if (snapshot.world.phase !== "scheduled") continue;
      status("Joined. Waiting for the test game to start…");
      snapshot = await waitForRuntime(card.world.id, status);
    }
    status("Joining the running game…");
    enterRuntime(snapshot.runtimeGameId!);
    return snapshot.world.id;
  }
  throw new Error("No joinable test world was found; use Quick start");
}
