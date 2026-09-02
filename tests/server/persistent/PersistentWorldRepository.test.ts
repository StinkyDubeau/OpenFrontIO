import { mkdtempSync, rmSync } from "fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inferredReminderLeadTimes } from "../../../src/core/PersistentWorldReminders";
import {
  CreatePersistentWorldInputSchema,
  PersistentWorldLobbyMemberSchema,
  PersistentWorldRsvpSchema,
  persistentWorldDurationMs,
  type PersistentWorldIdentity,
} from "../../../src/core/PersistentWorldSchemas";
import {
  PersistentWorldRepository,
  PersistentWorldRepositoryError,
  type PersistentWorldRepositoryErrorCode,
} from "../../../src/server/persistent/PersistentWorldRepository";

const INVITATION_SECRET = "invite_secret_with_enough_entropy_123";

function account(
  id: string,
  displayName: string = id,
): PersistentWorldIdentity {
  return {
    id,
    kind: "account",
    subject: `${id}-subject`,
    displayName,
    verifiedEmail: null,
  };
}

function expectRepositoryError(
  operation: () => unknown,
  code: PersistentWorldRepositoryErrorCode,
): void {
  try {
    operation();
    throw new Error(`Expected repository error ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(PersistentWorldRepositoryError);
    expect((error as PersistentWorldRepositoryError).code).toBe(code);
  }
}

describe("PersistentWorldRepository", () => {
  let directory: string;
  let dbPath: string;
  let now: number;
  let repository: PersistentWorldRepository;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "persistent-world-test-"));
    dbPath = join(directory, "worlds.sqlite");
    now = 2_000_000_000_000;
    repository = new PersistentWorldRepository({
      dbPath,
      now: () => now,
    });
  });

  afterEach(() => {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("validates the bounded world contract and keeps presence transient", () => {
    const base = {
      id: "world_contract",
      name: "Friday World",
      targetDuration: "1d" as const,
      access: "public" as const,
      mode: "ffa" as const,
      maxHumans: 16,
      startsAt: now + 60_000,
      host: account("identity_host"),
    };

    expect(CreatePersistentWorldInputSchema.parse(base)).toMatchObject(base);
    expect(
      CreatePersistentWorldInputSchema.safeParse({ ...base, maxHumans: 17 })
        .success,
    ).toBe(false);
    expect(
      CreatePersistentWorldInputSchema.safeParse({
        ...base,
        targetDuration: "30d",
      }).success,
    ).toBe(false);
    expect(
      CreatePersistentWorldInputSchema.safeParse({
        ...base,
        access: "private",
      }).success,
    ).toBe(false);

    const durableRsvp = {
      worldId: base.id,
      identity: base.host,
      isHost: true,
      teamId: null,
      joinedAt: now,
      lastSeenAt: now,
    };
    expect(PersistentWorldRsvpSchema.parse(durableRsvp)).not.toHaveProperty(
      "presence",
    );
    expect(
      PersistentWorldLobbyMemberSchema.parse({
        ...durableRsvp,
        presence: "offline",
      }).presence,
    ).toBe("offline");
  });

  it("creates resumable guests without storing raw secrets and upgrades identity in place", () => {
    const created = repository.createGuestIdentity({
      displayName: "Night Owl",
    });
    const identityId = created.session.identity.id;
    expect(created.bearerToken.length).toBeGreaterThanOrEqual(32);

    const audit = new DatabaseSync(dbPath, { readOnly: true });
    const storedSession = audit
      .prepare(
        "SELECT token_hash FROM persistent_world_controller_sessions WHERE id = ?",
      )
      .get(created.session.id) as { token_hash: string };
    expect(storedSession.token_hash).not.toBe(created.bearerToken);
    expect(storedSession.token_hash).not.toContain(created.bearerToken);
    audit.close();

    now += 1_000;
    const resumed = repository.resumeControllerSession(created.bearerToken);
    expect(resumed).toMatchObject({
      id: created.session.id,
      identity: { id: identityId, kind: "guest" },
      lastUsedAt: now,
    });

    const withEmail = repository.attachVerifiedEmail(created.bearerToken, {
      verifiedEmail: "Player@Example.com",
    });
    expect(withEmail).toMatchObject({
      id: identityId,
      kind: "email",
      subject: "player@example.com",
      verifiedEmail: "player@example.com",
    });

    const withAccount = repository.attachAccount(created.bearerToken, {
      accountSubject: "account-42",
      displayName: "Commander",
    });
    expect(withAccount).toMatchObject({
      id: identityId,
      kind: "account",
      subject: "account-42",
      displayName: "Commander",
      verifiedEmail: "player@example.com",
    });

    repository.close();
    repository = new PersistentWorldRepository({ dbPath, now: () => now });
    expect(
      repository.resumeControllerSession(created.bearerToken)?.identity,
    ).toEqual(withAccount);

    repository.revokeControllerSession(created.bearerToken);
    repository.revokeControllerSession(created.bearerToken);
    expect(
      repository.resumeControllerSession(created.bearerToken),
    ).toBeUndefined();
  });

  it("persists private invitations, durable RSVPs, schedule locking, and quick-chat keys", () => {
    const host = account("identity_host", "Host");
    const player = account("identity_player", "Player");
    const startsAt = now + 7 * 24 * 60 * 60 * 1000;

    const world = repository.createWorld({
      id: "private_week",
      name: "The Long Weekend",
      targetDuration: "7d",
      access: "private",
      mode: "teams",
      maxHumans: 8,
      startsAt,
      host,
      hostTeamId: "amber",
      invitationSecret: INVITATION_SECRET,
    });
    expect(world).toMatchObject({
      phase: "scheduled",
      startsAt,
      joinClosesAt: startsAt + persistentWorldDurationMs("7d") / 3,
      rsvps: [{ identity: host, isHost: true, teamId: "amber" }],
    });

    const replay = repository.createWorld({
      id: "private_week",
      name: "The Long Weekend",
      targetDuration: "7d",
      access: "private",
      mode: "teams",
      maxHumans: 8,
      startsAt,
      host,
      hostTeamId: "amber",
      invitationSecret: INVITATION_SECRET,
    });
    expect(replay.createdAt).toBe(world.createdAt);

    expectRepositoryError(
      () =>
        repository.rsvp({
          worldId: world.id,
          identity: player,
          teamId: "violet",
          invitationSecret: "incorrect_invitation_secret",
        }),
      "INVALID_INVITATION",
    );

    now += 5_000;
    const rsvp = repository.rsvp({
      worldId: world.id,
      identity: player,
      teamId: "violet",
      invitationSecret: INVITATION_SECRET,
    });
    expect(rsvp).toMatchObject({
      identity: player,
      isHost: false,
      teamId: "violet",
      joinedAt: now,
      lastSeenAt: now,
    });
    expect(repository.getWorld(world.id)?.scheduleLockedAt).toBe(now);
    expectRepositoryError(
      () => repository.updateSchedule(world.id, host, startsAt + 60_000),
      "SCHEDULE_LOCKED",
    );
    expect(repository.updateSchedule(world.id, host, startsAt).startsAt).toBe(
      startsAt,
    );

    now += 5_000;
    const replayedRsvp = repository.rsvp({
      worldId: world.id,
      identity: player,
      teamId: "violet",
    });
    expect(replayedRsvp.joinedAt).toBe(rsvp.joinedAt);
    expect(replayedRsvp.lastSeenAt).toBe(now);

    const message = repository.postQuickChat({
      id: "message_001",
      worldId: world.id,
      sender: player,
      phraseKey: "lobby.ready",
    });
    expect(
      repository.postQuickChat({
        id: "message_001",
        worldId: world.id,
        sender: player,
        phraseKey: "lobby.ready",
      }),
    ).toEqual(message);
    expect(repository.listQuickChat(world.id)).toEqual([message]);
    expect(() =>
      repository.postQuickChat({
        id: "message_002",
        worldId: world.id,
        sender: player,
        phraseKey: "hello there",
      }),
    ).toThrow();

    const audit = new DatabaseSync(dbPath, { readOnly: true });
    const storedWorld = audit
      .prepare(
        "SELECT invitation_secret_hash FROM persistent_worlds WHERE id = ?",
      )
      .get(world.id) as { invitation_secret_hash: string };
    expect(storedWorld.invitation_secret_hash).not.toContain(INVITATION_SECRET);
    const rsvpColumns = audit
      .prepare("PRAGMA table_info(persistent_world_rsvps)")
      .all() as Array<{ name: string }>;
    expect(rsvpColumns.map((column) => column.name)).not.toContain("presence");
    const chatColumns = audit
      .prepare("PRAGMA table_info(persistent_world_quick_chat)")
      .all() as Array<{ name: string }>;
    expect(chatColumns.map((column) => column.name)).toContain("phrase_key");
    expect(chatColumns.map((column) => column.name)).not.toContain("message");
    audit.close();

    repository.close();
    repository = new PersistentWorldRepository({ dbPath, now: () => now });
    expect(repository.getWorld(world.id)?.rsvps).toHaveLength(2);
    expect(repository.listQuickChat(world.id)).toEqual([message]);
  });

  it("allows invited private late joins for one third of the duration but closes public worlds at start", () => {
    const host = account("identity_host");
    const privateStart = now + 10_000;
    repository.createWorld({
      id: "private_late",
      name: "Private Late Join",
      targetDuration: "1h",
      access: "private",
      mode: "ffa",
      maxHumans: 3,
      startsAt: privateStart,
      host,
      invitationSecret: INVITATION_SECRET,
    });
    repository.createWorld({
      id: "public_closed",
      name: "Public Start",
      targetDuration: "1h",
      access: "public",
      mode: "ffa",
      maxHumans: 3,
      startsAt: privateStart,
      host,
    });

    now = privateStart + 1;
    expect(
      repository.rsvp({
        worldId: "private_late",
        identity: account("identity_late"),
        invitationSecret: INVITATION_SECRET,
      }).identity.id,
    ).toBe("identity_late");
    expectRepositoryError(
      () =>
        repository.rsvp({
          worldId: "public_closed",
          identity: account("identity_public_late"),
        }),
      "JOIN_CLOSED",
    );

    now = privateStart + persistentWorldDurationMs("1h") / 3;
    expectRepositoryError(
      () =>
        repository.rsvp({
          worldId: "private_late",
          identity: account("identity_too_late"),
          invitationSecret: INVITATION_SECRET,
        }),
      "JOIN_CLOSED",
    );
  });

  it("orders due worlds, transitions idempotently, and authorizes cancellation", () => {
    const host = account("identity_host");
    repository.createWorld({
      id: "world_second",
      name: "Second",
      targetDuration: "1d",
      access: "public",
      mode: "ffa",
      maxHumans: 4,
      startsAt: now + 2_000,
      host,
    });
    repository.createWorld({
      id: "world_first",
      name: "First",
      targetDuration: "1d",
      access: "public",
      mode: "ffa",
      maxHumans: 4,
      startsAt: now + 1_000,
      host,
    });
    repository.createWorld({
      id: "world_cancelled",
      name: "Cancelled",
      targetDuration: "1d",
      access: "public",
      mode: "ffa",
      maxHumans: 4,
      startsAt: now + 1_000,
      host,
    });
    repository.cancelWorld("world_cancelled", host);
    repository.cancelWorld("world_cancelled", host);
    expectRepositoryError(
      () => repository.cancelWorld("world_first", account("identity_other")),
      "FORBIDDEN",
    );

    now += 2_000;
    expect(repository.listWorldsDueToStart().map((world) => world.id)).toEqual([
      "world_first",
      "world_second",
    ]);
    expect(repository.markActive("world_first").phase).toBe("active");
    expect(repository.markActive("world_first").phase).toBe("active");
    expect(repository.listWorldsDueToStart().map((world) => world.id)).toEqual([
      "world_second",
    ]);
    expect(repository.markFinished("world_first").phase).toBe("finished");
    expect(repository.markFinished("world_first").phase).toBe("finished");
  });

  it("lists public and personal worlds and persists inferred reminder choices", () => {
    const hostSession = repository.createGuestIdentity({ displayName: "Host" });
    const guestSession = repository.createGuestIdentity({
      displayName: "Guest",
    });
    const startsAt = now + 14 * 24 * 60 * 60 * 1000;
    const world = repository.createWorld({
      id: "public_reminders",
      name: "Fourteen Day Invitation",
      targetDuration: "1d",
      access: "public",
      mode: "ffa",
      maxHumans: 4,
      startsAt,
      host: hostSession.session.identity,
    });
    repository.rsvp({
      worldId: world.id,
      identity: guestSession.session.identity,
    });

    expect(repository.listPublicWorlds().map((entry) => entry.id)).toContain(
      world.id,
    );
    expect(
      repository
        .listWorldsForIdentity(guestSession.session.identity.id)
        .map((entry) => entry.id),
    ).toEqual([world.id]);

    const options = inferredReminderLeadTimes(startsAt - world.createdAt);
    const selection = repository.setReminderSelection(
      world.id,
      guestSession.session.identity.id,
      [options[2], options[0]],
    );
    expect(selection.leadTimesMs).toEqual([options[0], options[2]]);
    expect(
      repository.getReminderSelection(
        world.id,
        guestSession.session.identity.id,
      ),
    ).toEqual(selection);
    expectRepositoryError(
      () =>
        repository.setReminderSelection(
          world.id,
          guestSession.session.identity.id,
          [123_456],
        ),
      "INVALID_ARGUMENT",
    );

    repository.leaveWorld(world.id, guestSession.session.identity.id);
    expect(
      repository.getRsvp(world.id, guestSession.session.identity.id),
    ).toBeUndefined();
    expect(
      repository.getReminderSelection(
        world.id,
        guestSession.session.identity.id,
      ),
    ).toBeUndefined();
    expectRepositoryError(
      () => repository.leaveWorld(world.id, hostSession.session.identity.id),
      "FORBIDDEN",
    );
  });
});
