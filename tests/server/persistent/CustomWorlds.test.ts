import { WORLD_PRESETS } from "../../../src/core/WorldPresets";
import { PersistentWorldRepository } from "../../../src/server/persistent/PersistentWorldRepository";
import { PersistentWorldService } from "../../../src/server/persistent/PersistentWorldService";

describe("public custom games and scheduled worlds", () => {
  let now: number;
  let repository: PersistentWorldRepository;
  let service: PersistentWorldService;
  beforeEach(() => {
    now = 2_000_000_000_000;
    repository = new PersistentWorldRepository({
      dbPath: ":memory:",
      now: () => now,
    });
    service = new PersistentWorldService(repository, { now: () => now });
  });
  afterEach(() => service.close());

  function create(startMode: "host" | "scheduled" = "host") {
    const host = service.createGuestSession({ displayName: "Host" });
    const created = service.createWorld(host.bearerToken, {
      name: "A name unrelated to the preset",
      startMode,
      gamePreset: startMode === "host" ? "great-lakes" : "scheduled-earth",
      targetDuration: "1d",
      access: "public",
      mode: "ffa",
      maxHumans: 8,
      startsAt: now + 60_000,
    });
    return { host, id: created.snapshot.world.id, snapshot: created.snapshot };
  }

  it("keeps custom rooms waiting indefinitely without timers or stale-world cancellation", () => {
    const { id } = create();
    now += 30 * 24 * 60 * 60_000;
    expect(service.activateDueWorlds()).toEqual([]);
    expect(service.archiveStaleWorlds().cancelled).toEqual([]);
    expect(repository.getWorld(id)?.phase).toBe("scheduled");
    expect(service.getSnapshot(id).reminderOptionsMs).toEqual([]);
    expect(service.getSnapshot(id).viewer.canRsvp).toBe(true);
    const guest = service.createGuestSession({ displayName: "Late guest" });
    expect(service.rsvp(id, guest.bearerToken, {}).viewer.isMember).toBe(true);
    service.leave(id, guest.bearerToken);
    expect(service.getSnapshot(id, guest.bearerToken).viewer.isMember).toBe(
      false,
    );
  });

  it("starts once, only for the host, and anchors the actual time at the click", () => {
    const { host, id } = create();
    const guest = service.createGuestSession({ displayName: "Guest" });
    service.rsvp(id, guest.bearerToken, {});
    expect(() => service.startCustomWorld(id, guest.bearerToken)).toThrow(
      /host/,
    );
    expect(() => repository.markActive(id, now + 60_000)).toThrow(/host/);
    now += 20 * 60_000;
    const first = service.startCustomWorld(id, host.bearerToken);
    expect(first.world).toMatchObject({
      phase: "active",
      startsAt: now,
      gamePreset: "great-lakes",
    });
    expect(first.members).toHaveLength(2);
    now += 1000;
    expect(service.startCustomWorld(id, host.bearerToken).world.startsAt).toBe(
      first.world.startsAt,
    );
  });

  it("does not let a host start a scheduled game early or replace its preset", () => {
    const { id, host } = create("scheduled");
    expect(() => service.startCustomWorld(id, host.bearerToken)).toThrow(
      /scheduled/,
    );
    expect(service.activateDueWorlds()).toHaveLength(0);
    now += 60_000;
    expect(service.activateDueWorlds().map((world) => world.id)).toEqual([id]);
    expect(service.activateDueWorlds()).toEqual([]);
    expect(repository.getWorld(id)?.gamePreset).toBe("scheduled-earth");
  });

  it("cannot start cancelled games or invent custom presets", () => {
    const { id, host } = create();
    service.cancel(id, host.bearerToken);
    expect(() => service.startCustomWorld(id, host.bearerToken)).toThrow(
      /ended/,
    );
    for (const settings of [
      { startMode: "host", gamePreset: "scheduled-earth" },
      { startMode: "scheduled", gamePreset: "great-lakes" },
      { startMode: "host", gamePreset: "unlimited-money" },
    ]) {
      expect(() =>
        service.createWorld(host.bearerToken, {
          ...settings,
          name: "Invalid",
          targetDuration: "1d",
          access: "public",
          mode: "ffa",
          maxHumans: 8,
          startsAt: now + 60_000,
        }),
      ).toThrow();
    }
  });

  it("rejects reminders and rescheduling for custom rooms", () => {
    const { id, host } = create();
    expect(() =>
      service.setReminders(id, host.bearerToken, { leadTimesMs: [60_000] }),
    ).toThrow(/host/);
    expect(() =>
      repository.updateSchedule(id, host.session.identity, now + 120_000),
    ).toThrow(/schedule/);
  });

  it("keeps Great Lakes at 10x ships/trains and the other custom choices at 5x", () => {
    expect(WORLD_PRESETS["great-lakes"]).toMatchObject({
      trade: 10,
      trains: 10,
      attackDivisor: 15,
    });
    for (const id of ["enormous-earth", "hd-earth-9x"] as const) {
      expect(WORLD_PRESETS[id]).toMatchObject({
        trade: 5,
        trains: 5,
        attackDivisor: 15,
      });
    }
    expect(WORLD_PRESETS["scheduled-earth"]).toMatchObject({
      trade: 1,
      trains: 1,
      attackDivisor: 1,
    });
  });
});
