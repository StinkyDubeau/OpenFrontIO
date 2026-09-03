import type { Winner } from "../../../core/Schemas";
import type { MassiveWorldDuration } from "./MassiveWorldModel";

export const MASSIVE_WORLD_RETURN_ROUTE_KEY =
  "idlefront.experimental.massive-world.return";
export const MASSIVE_WORLD_ACTIVE_SECTOR_KEY =
  "idlefront.experimental.massive-world.active-sector";

export type MassiveWorldTacticalResult = "victory" | "defeat" | "abandoned";

export interface MassiveWorldTacticalSession {
  duration: MassiveWorldDuration;
  sectorIndex: number;
  sectorName: string;
  gameID: string;
  enteredAt: number;
  result?: MassiveWorldTacticalResult;
}

function storageOrNull(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function isDuration(value: unknown): value is MassiveWorldDuration {
  return value === "1h" || value === "1d" || value === "7d";
}

function isResult(value: unknown): value is MassiveWorldTacticalResult {
  return value === "victory" || value === "defeat" || value === "abandoned";
}

function parseSession(raw: string | null): MassiveWorldTacticalSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      !isDuration(value.duration) ||
      !Number.isInteger(value.sectorIndex) ||
      (value.sectorIndex as number) < 0 ||
      typeof value.sectorName !== "string" ||
      value.sectorName.length === 0 ||
      value.sectorName.length > 120 ||
      typeof value.gameID !== "string" ||
      value.gameID.length === 0 ||
      value.gameID.length > 120 ||
      typeof value.enteredAt !== "number" ||
      !Number.isFinite(value.enteredAt) ||
      (value.result !== undefined && !isResult(value.result))
    ) {
      return null;
    }
    return {
      duration: value.duration,
      sectorIndex: value.sectorIndex as number,
      sectorName: value.sectorName,
      gameID: value.gameID,
      enteredAt: value.enteredAt,
      ...(value.result === undefined ? {} : { result: value.result }),
    };
  } catch {
    return null;
  }
}

export function beginMassiveWorldTacticalSession(
  session: MassiveWorldTacticalSession,
): boolean {
  const storage = storageOrNull();
  if (!storage) return false;
  try {
    storage.setItem(
      MASSIVE_WORLD_RETURN_ROUTE_KEY,
      `/experimental/massive-world?duration=${session.duration}`,
    );
    storage.setItem(MASSIVE_WORLD_ACTIVE_SECTOR_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function peekMassiveWorldTacticalSession(): MassiveWorldTacticalSession | null {
  const storage = storageOrNull();
  return storage
    ? parseSession(storage.getItem(MASSIVE_WORLD_ACTIVE_SECTOR_KEY))
    : null;
}

export function clearMassiveWorldTacticalSession(gameID?: string): boolean {
  const storage = storageOrNull();
  const session = peekMassiveWorldTacticalSession();
  if (
    !storage ||
    !session ||
    (gameID !== undefined && session.gameID !== gameID)
  ) {
    return false;
  }
  try {
    storage.removeItem(MASSIVE_WORLD_ACTIVE_SECTOR_KEY);
    storage.removeItem(MASSIVE_WORLD_RETURN_ROUTE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function massiveWorldReturnRoute(gameID?: string): string | null {
  const session = peekMassiveWorldTacticalSession();
  if (!session || (gameID !== undefined && session.gameID !== gameID)) {
    return null;
  }
  const storage = storageOrNull();
  try {
    const route = storage?.getItem(MASSIVE_WORLD_RETURN_ROUTE_KEY) ?? null;
    return /^\/experimental\/massive-world(?:[/?#]|$)/.test(route ?? "")
      ? route
      : null;
  } catch {
    return null;
  }
}

export function hasMassiveWorldTacticalSession(gameID?: string): boolean {
  return massiveWorldReturnRoute(gameID) !== null;
}

export function recordMassiveWorldTacticalResult(
  gameID: string,
  result: MassiveWorldTacticalResult,
): boolean {
  const storage = storageOrNull();
  const session = peekMassiveWorldTacticalSession();
  if (!storage || !session || session.gameID !== gameID) return false;

  // Never downgrade a result if a duplicate/later UI notification arrives.
  if (session.result === "victory") return true;
  if (session.result === "defeat" && result === "abandoned") return true;
  try {
    storage.setItem(
      MASSIVE_WORLD_ACTIVE_SECTOR_KEY,
      JSON.stringify({ ...session, result }),
    );
    return true;
  } catch {
    return false;
  }
}

export function recordMassiveWorldTacticalOutcome(
  gameID: string,
  clientID: string | undefined,
  winner: Winner,
  localTeam?: string,
): boolean {
  let result: MassiveWorldTacticalResult;
  if (winner === undefined) {
    result = "abandoned";
  } else if (winner[0] === "player") {
    result =
      clientID !== undefined && winner[1] === clientID ? "victory" : "defeat";
  } else if (winner[0] === "team") {
    result =
      localTeam !== undefined && winner[1] === localTeam ? "victory" : "defeat";
  } else {
    result = "defeat";
  }
  return recordMassiveWorldTacticalResult(gameID, result);
}
