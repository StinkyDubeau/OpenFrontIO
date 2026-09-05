import { createHmac, timingSafeEqual } from "crypto";
import { PersistentWorldIdentityIdSchema } from "../core/PersistentWorldSchemas";
import { ServerEnv } from "./ServerEnv";

// Guest playtest credentials are deliberately separate from the normal JWT.
// They are minted only after a persistent-world session has authenticated to
// our own API, and workers can verify them without a network round-trip.
const TOKEN_PREFIX = "guest_";
const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function secret(): string {
  const configured =
    process.env.IDLE_GUEST_PLAY_TOKEN_SECRET ??
    process.env.IDLE_TELEMETRY_HMAC_SECRET;
  if (configured && configured.length >= 32) return configured;

  // Development has no durable secret by default. Production must configure
  // one; deriving a credential key from a public domain would be unsafe.
  if (ServerEnv.gameEnvName() === "dev") {
    return "idlefront-dev-guest-play-token-secret";
  }
  throw new Error(
    "IDLE_GUEST_PLAY_TOKEN_SECRET (or IDLE_TELEMETRY_HMAC_SECRET) must be configured",
  );
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function issueGuestPlayToken(
  identityId: string,
  now: number = Date.now(),
): string {
  const identity = PersistentWorldIdentityIdSchema.parse(identityId);
  const payload = Buffer.from(
    `${identity}.${now + TOKEN_TTL_MS}`,
    "utf8",
  ).toString("base64url");
  return `${TOKEN_PREFIX}${payload}_${sign(payload)}`;
}

export function verifyGuestPlayToken(
  token: string,
  now: number = Date.now(),
): string | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const parts = token.slice(TOKEN_PREFIX.length).split("_");
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    // A production deployment without the optional guest secret simply has
    // guest play disabled; ordinary JWT verification must still work.
    return null;
  }
  const actualBytes = Buffer.from(signature, "base64url");
  const expectedBytes = Buffer.from(expected, "base64url");
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    return null;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const separator = decoded.lastIndexOf(".");
  if (separator <= 0) return null;
  const identityId = decoded.slice(0, separator);
  const expiresAt = Number(decoded.slice(separator + 1));
  if (
    !PersistentWorldIdentityIdSchema.safeParse(identityId).success ||
    !Number.isSafeInteger(expiresAt) ||
    now >= expiresAt
  ) {
    return null;
  }
  return identityId;
}
