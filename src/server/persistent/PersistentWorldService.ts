import { randomBytes } from "crypto";
import quickChatData from "resources/QuickChat.json";
import { z } from "zod";
import { inferredReminderLeadTimes } from "../../core/PersistentWorldReminders";
import {
  CreatePersistentWorldRequestSchema,
  PersistentWorldCardSchema,
  PersistentWorldInAppNotificationSchema,
  PersistentWorldLobbySnapshotSchema,
  PersistentWorldQuickChatRequestSchema,
  PersistentWorldReminderRequestSchema,
  PersistentWorldRsvpRequestSchema,
  PersistentWorldSessionRequestSchema,
  PersistentWorldViewSchema,
  type NewPersistentWorldControllerSession,
  type PersistentWorld,
  type PersistentWorldCard,
  type PersistentWorldControllerSession,
  type PersistentWorldIdentity,
  type PersistentWorldInAppNotification,
  type PersistentWorldLobbySnapshot,
  type PersistentWorldQuickChat,
  type PersistentWorldReminderSelection,
} from "../../core/PersistentWorldSchemas";
import {
  PersistentWorldRepository,
  PersistentWorldRepositoryError,
  type PersistentWorldArchiveSweep,
} from "./PersistentWorldRepository";

const MIN_START_DELAY_MS = 60_000;
const MAX_INVITATION_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;
const PRESENCE_TTL_MS = 45_000;
const RUNTIME_START_GRACE_MS = 5 * 60_000;

const lobbyQuickChatKeys = new Set(
  Object.entries(quickChatData).flatMap(([category, phrases]) =>
    phrases.map((phrase) => `${category}.${phrase.key}`),
  ),
);

export class PersistentWorldServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PersistentWorldServiceError";
  }
}

export interface PersistentWorldServiceOptions {
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
  runtimeCoordinator?: PersistentWorldRuntimeCoordinator;
  onRuntimeError?: (error: unknown) => void;
}

/**
 * Adapter owned by the application composition root. Keeping this interface
 * here lets the invitation domain request a runtime without importing game
 * configuration, worker IPC, or any simulation code.
 */
export interface PersistentWorldRuntimeCoordinator {
  ensure(world: PersistentWorld): Promise<void>;
  reconcile(): Promise<void>;
}

export interface CreatedPersistentWorld {
  snapshot: PersistentWorldLobbySnapshot;
  invitationSecret: string | null;
}

export class PersistentWorldService {
  private readonly now: () => number;
  private readonly secureRandomBytes: (size: number) => Buffer;
  private readonly runtimeCoordinator?: PersistentWorldRuntimeCoordinator;
  private readonly onRuntimeError: (error: unknown) => void;
  private readonly presence = new Map<string, Map<string, number>>();
  private scheduler: NodeJS.Timeout | undefined;

  constructor(
    readonly repository: PersistentWorldRepository,
    options: PersistentWorldServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.secureRandomBytes = options.randomBytes ?? randomBytes;
    this.runtimeCoordinator = options.runtimeCoordinator;
    this.onRuntimeError = options.onRuntimeError ?? (() => undefined);
  }

  createGuestSession(inputValue: unknown): NewPersistentWorldControllerSession {
    const input = PersistentWorldSessionRequestSchema.parse(inputValue);
    return this.repository.createGuestIdentity(input);
  }

  resumeSession(bearerToken: string): PersistentWorldControllerSession {
    const session = this.repository.resumeControllerSession(bearerToken);
    if (!session) {
      throw new PersistentWorldServiceError(
        401,
        "SESSION_INVALID",
        "The world session is missing, expired, or revoked",
      );
    }
    return session;
  }

  bindGameplayIdentity(
    bearerToken: string,
    gameplayPersistentIdHash: string,
  ): void {
    const session = this.resumeSession(bearerToken);
    this.repository.bindGameplayIdentity(
      session.identity.id,
      gameplayPersistentIdHash,
    );

    // A legacy controller session may first acquire its gameplay binding
    // after the invitation has already elapsed. Give an active, not-yet-
    // provisioned world an immediate chance to attach its runtime.
    for (const world of this.repository.listWorldsForIdentity(
      session.identity.id,
    )) {
      if (world.phase === "active") this.queueRuntime(world);
    }
  }

  createWorld(
    bearerToken: string,
    inputValue: unknown,
  ): CreatedPersistentWorld {
    const session = this.resumeSession(bearerToken);
    const input = CreatePersistentWorldRequestSchema.parse(inputValue);
    const now = this.now();
    if (input.startsAt < now + MIN_START_DELAY_MS) {
      throw new PersistentWorldServiceError(
        400,
        "START_TOO_SOON",
        "A world must be scheduled at least one minute in advance",
      );
    }
    if (input.startsAt > now + MAX_INVITATION_LIFETIME_MS) {
      throw new PersistentWorldServiceError(
        400,
        "START_TOO_LATE",
        "An invitation may count down for at most fourteen days",
      );
    }

    const id = this.randomToken("world", 12);
    const invitationSecret =
      input.access === "private" ? this.randomToken("invite", 32) : null;
    const { teamId, ...worldInput } = input;
    const world = this.repository.createWorld({
      ...worldInput,
      id,
      host: session.identity,
      hostTeamId: teamId,
      invitationSecret: invitationSecret ?? undefined,
    });
    this.touch(world.id, session.identity.id);
    return {
      snapshot: this.snapshotFromWorld(
        world,
        session,
        invitationSecret ?? undefined,
      ),
      invitationSecret,
    };
  }

  getSnapshot(
    worldId: string,
    bearerToken?: string,
    invitationSecret?: string,
  ): PersistentWorldLobbySnapshot {
    const world = this.requireWorld(worldId);
    const session = bearerToken
      ? this.repository.resumeControllerSession(bearerToken)
      : undefined;
    this.requireViewAccess(world, session?.identity, invitationSecret);
    if (session) this.touch(world.id, session.identity.id);
    return this.snapshotFromWorld(world, session, invitationSecret);
  }

  listPublic(bearerToken?: string): PersistentWorldCard[] {
    const viewer = bearerToken
      ? this.repository.resumeControllerSession(bearerToken)?.identity
      : undefined;
    return this.repository
      .listPublicWorlds()
      .map((world) => this.card(world, viewer));
  }

  listMine(bearerToken: string): PersistentWorldCard[] {
    const session = this.resumeSession(bearerToken);
    return this.repository
      .listWorldsForIdentity(session.identity.id)
      .map((world) => this.card(world, session.identity));
  }

  listNotifications(bearerToken: string): PersistentWorldInAppNotification[] {
    const session = this.resumeSession(bearerToken);
    return z
      .array(PersistentWorldInAppNotificationSchema)
      .parse(this.repository.listInAppNotifications(session.identity.id));
  }

  markNotificationRead(
    bearerToken: string,
    notificationId: string,
  ): PersistentWorldInAppNotification {
    const session = this.resumeSession(bearerToken);
    return PersistentWorldInAppNotificationSchema.parse(
      this.repository.markInAppNotificationRead(
        session.identity.id,
        notificationId,
        this.now(),
      ),
    );
  }

  rsvp(
    worldId: string,
    bearerToken: string,
    inputValue: unknown,
  ): PersistentWorldLobbySnapshot {
    const session = this.resumeSession(bearerToken);
    const input = PersistentWorldRsvpRequestSchema.parse(inputValue);
    const world = this.requireWorld(worldId);
    if (world.phase === "active" && this.repository.getRuntime(worldId)) {
      throw new PersistentWorldServiceError(
        410,
        "JOIN_CLOSED",
        "The playable roster was sealed when this world began",
      );
    }
    this.repository.rsvp({
      worldId,
      identity: session.identity,
      teamId: input.teamId,
      invitationSecret: input.invitationSecret,
    });
    this.touch(worldId, session.identity.id);
    return this.getSnapshot(worldId, bearerToken, input.invitationSecret);
  }

  leave(worldId: string, bearerToken: string): void {
    const session = this.resumeSession(bearerToken);
    if (this.repository.getRuntime(worldId)) {
      throw new PersistentWorldServiceError(
        409,
        "ROSTER_SEALED",
        "The roster is sealed after the map has been provisioned",
      );
    }
    this.repository.leaveWorld(worldId, session.identity.id);
    this.presence.get(worldId)?.delete(session.identity.id);
  }

  postQuickChat(
    worldId: string,
    bearerToken: string,
    inputValue: unknown,
  ): PersistentWorldQuickChat {
    const session = this.resumeSession(bearerToken);
    const input = PersistentWorldQuickChatRequestSchema.parse(inputValue);
    if (!lobbyQuickChatKeys.has(input.phraseKey)) {
      throw new PersistentWorldServiceError(
        400,
        "QUICK_CHAT_UNKNOWN",
        "Lobby chat accepts only phrases from the quick-chat catalog",
      );
    }
    this.touch(worldId, session.identity.id);
    return this.repository.postQuickChat({
      id: input.id,
      worldId,
      sender: session.identity,
      phraseKey: input.phraseKey,
    });
  }

  setReminders(
    worldId: string,
    bearerToken: string,
    inputValue: unknown,
  ): PersistentWorldReminderSelection {
    const session = this.resumeSession(bearerToken);
    const input = PersistentWorldReminderRequestSchema.parse(inputValue);
    this.touch(worldId, session.identity.id);
    return this.repository.setReminderSelection(
      worldId,
      session.identity.id,
      input.leadTimesMs,
    );
  }

  cancel(worldId: string, bearerToken: string): PersistentWorldLobbySnapshot {
    const session = this.resumeSession(bearerToken);
    const world = this.repository.cancelWorld(worldId, session.identity);
    return this.snapshotFromWorld(world, session);
  }

  activateDueWorlds(): PersistentWorld[] {
    const activated: PersistentWorld[] = [];
    for (const due of this.repository.listWorldsDueToStart(this.now())) {
      const world = this.repository.markActive(due.id, this.now());
      activated.push(world);
      this.queueRuntime(world);
    }
    return activated;
  }

  archiveStaleWorlds(): PersistentWorldArchiveSweep {
    return this.repository.archiveStaleWorlds(
      this.now(),
      RUNTIME_START_GRACE_MS,
    );
  }

  startScheduler(intervalMs: number = 1000): void {
    if (this.scheduler) return;
    this.archiveStaleWorlds();
    this.activateDueWorlds();
    this.queueReconcile();
    this.scheduler = setInterval(() => {
      this.archiveStaleWorlds();
      this.activateDueWorlds();
      this.queueReconcile();
    }, intervalMs);
    this.scheduler.unref?.();
  }

  stopScheduler(): void {
    if (!this.scheduler) return;
    clearInterval(this.scheduler);
    this.scheduler = undefined;
  }

  close(): void {
    this.stopScheduler();
    this.repository.close();
  }

  private snapshotFromWorld(
    world: PersistentWorld,
    session?: PersistentWorldControllerSession,
    invitationSecret?: string,
  ): PersistentWorldLobbySnapshot {
    const identity = session?.identity;
    const viewerRsvp = identity
      ? world.rsvps.find((rsvp) => rsvp.identity.id === identity.id)
      : undefined;
    const runtime = this.repository.getRuntime(world.id);
    const reminderOptionsMs = inferredReminderLeadTimes(
      world.startsAt - world.createdAt,
    );
    const selectedReminderLeadTimesMs = identity
      ? (this.repository.getReminderSelection(world.id, identity.id)
          ?.leadTimesMs ?? [])
      : [];
    const quickChat = this.repository
      .listQuickChat(world.id)
      .map((message) => ({
        id: message.id,
        sender: this.publicIdentity(message.sender),
        phraseKey: message.phraseKey,
        sentAt: message.sentAt,
      }));
    const latestQuickChat = quickChat[quickChat.length - 1];
    const revision = Math.max(
      world.updatedAt,
      latestQuickChat?.sentAt ?? 0,
      this.repository.getReminderSelection(world.id, identity?.id ?? "")
        ?.updatedAt ?? 0,
    );
    const isFull = world.rsvps.length >= world.maxHumans;
    const inviteValid =
      world.access === "public" ||
      Boolean(
        invitationSecret && this.safeInvitation(world.id, invitationSecret),
      );
    const canRsvp =
      !viewerRsvp &&
      !isFull &&
      world.phase !== "finished" &&
      world.phase !== "cancelled" &&
      runtime === undefined &&
      (world.access === "public"
        ? world.phase === "scheduled" && this.now() < world.startsAt
        : inviteValid && this.now() < world.joinClosesAt);

    return PersistentWorldLobbySnapshotSchema.parse({
      revision,
      serverTime: this.now(),
      world: this.worldView(world),
      members: world.rsvps.map((rsvp) => ({
        identity: this.publicIdentity(rsvp.identity),
        isHost: rsvp.isHost,
        teamId: rsvp.teamId,
        joinedAt: rsvp.joinedAt,
        presence: this.isOnline(world.id, rsvp.identity.id)
          ? "online"
          : "offline",
        isViewer: rsvp.identity.id === identity?.id,
      })),
      quickChat,
      reminderOptionsMs,
      selectedReminderLeadTimesMs,
      viewer: {
        identity: identity ? this.publicIdentity(identity) : null,
        isMember: Boolean(viewerRsvp),
        isHost: viewerRsvp?.isHost ?? false,
        canRsvp,
        canChat: Boolean(viewerRsvp),
        canCancel: viewerRsvp?.isHost === true && world.phase === "scheduled",
        hasVerifiedEmail:
          identity?.verifiedEmail !== null &&
          identity?.verifiedEmail !== undefined,
      },
      // A game ID is a capability to attempt a worker join. Reveal it only
      // after the worker acknowledged creation and only to an RSVP identity
      // that has been cryptographically bound to a gameplay principal.
      runtimeGameId:
        viewerRsvp &&
        runtime?.state === "ready" &&
        this.repository.gameplayIdentityHash(viewerRsvp.identity.id)
          ? runtime.gameId
          : null,
    });
  }

  private card(
    world: PersistentWorld,
    viewer?: PersistentWorldIdentity,
  ): PersistentWorldCard {
    const isViewerMember = world.rsvps.some(
      (rsvp) => rsvp.identity.id === viewer?.id,
    );
    const viewerStatus =
      viewer && isViewerMember
        ? this.repository.runtimePlayerStatus(world.id, viewer.id)
        : undefined;
    return PersistentWorldCardSchema.parse({
      world: this.worldView(world),
      host: this.publicIdentity(world.host),
      rsvpCount: world.rsvps.length,
      isViewerMember,
      viewerEliminated: viewerStatus?.isAlive === false,
    });
  }

  private worldView(world: PersistentWorld) {
    return PersistentWorldViewSchema.parse({
      id: world.id,
      name: world.name,
      targetDuration: world.targetDuration,
      access: world.access,
      mode: world.mode,
      maxHumans: world.maxHumans,
      phase: world.phase,
      startsAt: world.startsAt,
      joinClosesAt: world.joinClosesAt,
      scheduleLocked: world.scheduleLockedAt !== null,
      createdAt: world.createdAt,
      activatedAt: world.activatedAt,
    });
  }

  private publicIdentity(identity: PersistentWorldIdentity) {
    return { id: identity.id, displayName: identity.displayName };
  }

  private requireWorld(worldId: string): PersistentWorld {
    const world = this.repository.getWorld(worldId);
    if (!world) {
      throw new PersistentWorldServiceError(
        404,
        "WORLD_NOT_FOUND",
        "World does not exist",
      );
    }
    return world;
  }

  private requireViewAccess(
    world: PersistentWorld,
    identity?: PersistentWorldIdentity,
    invitationSecret?: string,
  ): void {
    if (world.access === "public") return;
    if (
      identity &&
      world.rsvps.some((rsvp) => rsvp.identity.id === identity.id)
    ) {
      return;
    }
    if (invitationSecret && this.safeInvitation(world.id, invitationSecret)) {
      return;
    }
    throw new PersistentWorldServiceError(
      403,
      "INVITATION_REQUIRED",
      "A valid private-world invitation is required",
    );
  }

  private safeInvitation(worldId: string, secret: string): boolean {
    try {
      return this.repository.verifyInvitation(worldId, secret);
    } catch (error) {
      if (error instanceof PersistentWorldRepositoryError) return false;
      throw error;
    }
  }

  private touch(worldId: string, identityId: string): void {
    const byIdentity = this.presence.get(worldId) ?? new Map<string, number>();
    byIdentity.set(identityId, this.now());
    this.presence.set(worldId, byIdentity);
    try {
      this.repository.recordLastSeen(worldId, identityId, this.now());
    } catch (error) {
      if (!(error instanceof PersistentWorldRepositoryError)) throw error;
    }
  }

  private isOnline(worldId: string, identityId: string): boolean {
    const lastSeen = this.presence.get(worldId)?.get(identityId);
    return lastSeen !== undefined && this.now() - lastSeen <= PRESENCE_TTL_MS;
  }

  private queueRuntime(world: PersistentWorld): void {
    if (!this.runtimeCoordinator) return;
    void this.runtimeCoordinator.ensure(world).catch(this.onRuntimeError);
  }

  private queueReconcile(): void {
    if (!this.runtimeCoordinator) return;
    void this.runtimeCoordinator.reconcile().catch(this.onRuntimeError);
  }

  private randomToken(prefix: string, bytes: number): string {
    return `${prefix}_${this.secureRandomBytes(bytes).toString("base64url")}`;
  }
}

export function persistentWorldServiceError(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (error instanceof PersistentWorldServiceError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof PersistentWorldRepositoryError) {
    const statusByCode: Partial<Record<typeof error.code, number>> = {
      FORBIDDEN: 403,
      INVALID_INVITATION: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      SCHEDULE_LOCKED: 409,
      WORLD_FULL: 409,
      JOIN_CLOSED: 410,
      INVALID_ARGUMENT: 400,
      INVALID_PHASE: 409,
      LEASE_INVALID: 409,
      NOT_DUE: 409,
    };
    return {
      status: statusByCode[error.code] ?? 400,
      code: error.code,
      message: error.message,
    };
  }
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      code: "INVALID_REQUEST",
      message: z.prettifyError(error),
    };
  }
  return {
    status: 500,
    code: "WORLD_INTERNAL_ERROR",
    message: "Persistent-world request failed",
  };
}
