# Idle Multiplayer OpenFront Fork — Handoff

## Mission

Use OpenFront as the starting point for a persistent, idle multiplayer online game. A player must be able to leave and return without losing the session, move between devices, use a simplified mobile experience, and sign in on the web for the full desktop experience.

## Repository context

- Upstream: `openfrontio/OpenFrontIO`
- User fork: `StinkyDubeau/OpenFrontIO`
- Local checkout folder: `openfront-idle`
- Working branch: `agent/idle-multiplayer-foundation`
- Upstream baseline at checkout: `19ca3a1682644c8fffa3f34cf96c4e8606794565`
- The existing user fork was already present when work began and its `main` ref was not overwritten.

## Product requirements already decided

- Persistent, connect/disconnect-friendly multiplayer sessions.
- Cross-device continuity under a durable player identity.
- A simplified, touch-friendly mobile experience.
- A full desktop web experience for deeper interaction and visibility.
- The first runnable build must bind to the LAN and be shared as a phone-accessible URL.
- After the first live build, begin a planning phase for core pacing and hosting.
- During that planning phase, inspect the user's `sightings.today` project and reuse relevant network-stack and hosting knowledge.

## Verified OpenFront architecture

OpenFront is split into deterministic TypeScript simulation (`src/core`), a Pixi.js/Lit web client (`src/client`), and a Node.js/Express/WebSocket coordination server (`src/server`). The separate API is a closed-source Cloudflare Worker and is not included in this repository.

Important correction to the initial assumption: the game simulation is not server-authoritative today. Each client runs the deterministic simulation in a worker. The server gathers player intents into turns and relays those turns to clients. This is useful multiplayer infrastructure, but durable idle progress and safe reconnects will require an explicit authority, persistence, snapshot, replay, and reconciliation design.

Relevant entry points:

- `src/core/Schemas.ts`: wire messages and intent schemas.
- `src/core/GameRunner.ts`: deterministic simulation orchestration.
- `src/core/game/GameImpl.ts`: game-state implementation.
- `src/server/GameServer.ts`: WebSocket server and game loop.
- `src/server/Master.ts`: lobby and game registry.
- `docs/Architecture.md`: current architecture overview.
- `docs/Auth.md`: current authentication flow.

## Planning questions to resolve next

1. Core pacing: tick cadence, meaningful return intervals, offline progress limits, catch-up rules, and session lifespan.
2. Authority model: server-authoritative simulation, authoritative snapshots plus deterministic replay, or another hybrid.
3. Persistence: player identity, session ownership, snapshots/event log, idempotent commands, and cross-device conflict handling.
4. Mobile scope: which actions remain available, notification expectations, bandwidth/battery constraints, and responsive UI boundaries.
5. Hosting: map the `sightings.today` network stack onto WebSocket routing, durable state, storage, CDN assets, observability, backups, and deployment cost.
6. Security and abuse: authentication, replay protection, clock manipulation, rate limits, and multi-device concurrency.
7. Migration strategy: decide which OpenFront systems and assets to retain before extensive game-design work.

## Constraints and cautions

- Current code is AGPL v3 with additional attribution terms; network deployment must be reviewed for AGPL compliance.
- Open assets under `resources/` are CC BY-SA 4.0.
- Assets under `proprietary/` and external/CDN assets are not licensed for reuse outside the official service. Replace or remove them before a distributable derivative build.
- Keep `src/core` deterministic; upstream requires tests for all core changes.
- Install dependencies with `npm run inst` (`npm ci --ignore-scripts`), not `npm install`.
- User-visible strings must use the translation system and be added to `resources/lang/en.json`.

## Immediate execution sequence

1. Preserve this brief in the first branch commit.
2. Install pinned dependencies and run the existing LAN development command.
3. Verify the page from the host and provide the LAN URL for phone preview.
4. Inspect `sightings.today` before proposing the pacing/hosting plan.
5. Produce a focused architecture decision record before implementing persistence or game-loop changes.

## Defaults accepted for the first playable milestone

The user accepted the recommended defaults on August 14, 2026:

- Original working title and presentation rather than OpenFront branding or proprietary assets.
- Eight to sixteen players on a seven-day seasonal map.
- Passive `Supply` and active `Influence` as the initial economy.
- Two to four short visits per day, meaningful progress after four to eight hours, and a 24-hour offline-production cap.
- A distinct `pressure_tap` action. Tapping another territory creates visible, capped, decaying pressure and earns capped Influence; it never changes ownership, removes resources, or eliminates an AFK player.
- Live pressure heat/ripples plus aggregated return summaries naming the attacker.
- Durable server-side observation of accepted and rejected taps, with 30-day raw-event and 90-day derived-risk targets.
- Silent risk scoring, reward suppression, shadow cooldowns, quarantine, and admin notification. Permanent bans require review.
- Guest-first play with a future Discord identity upgrade. One device holds the active command lease; other signed-in devices are read-only.
- First hosting target follows `sightings.today`: a single Debian/Proxmox VM, Node bound to loopback, Cloudflare Tunnel ingress, systemd supervision, SQLite WAL as the system of record, and encrypted verified off-host backups. PostgreSQL is the migration target before multi-node operation.

## First phone-preview finding

The original OpenFront development shell rendered on desktop Chromium but appeared as a blank white page with horizontal and vertical scrollbars in Firefox on iOS. The LAN server, static assets, and lobby WebSocket were independently healthy. Because all iOS browsers use WebKit and the original shell depends on a large Vite ES-module/Lit bootstrap, the first idle demo uses a standalone classic-script mobile entry point with an in-page diagnostic state. LAN auth also must not resolve `localhost` from the phone, because that refers to the phone rather than the development host.

## Verified first vertical slice

The live phone preview is `http://192.168.2.118:3000/idle/`. Use port 3000,
not the original Vite port 9000: an OpenFront service worker previously
installed on the Vite origin can intercept new paths and replay its cached app
shell. The authority origin serves the standalone document and same-origin API
without that worker.

The slice now includes:

- an original, dependency-free Pressure Atlas client with critical fallback
  CSS, classic JavaScript, twelve dynamic SVG regions, diagnostics, tap
  ripples, AFK copy, and no horizontal overflow in the live browser check;
- SQLite WAL authority with schema version/world revision, 24-hour Supply
  accrual, guest recovery, one active command lease, bot replacement up to
  twelve humans, and rolling seven-day windows;
- nonlethal, capped, six-hour-decaying pressure and capped Influence;
- protocol-versioned/idempotent taps, receipt metadata, coarse user-agent
  families, externally keyed network HMACs, 14-day live raw expiry plus a
  14-day encrypted recovery window, constant-size per-session replay
  watermarks, reversible risk decay, reward suppression, quarantine/admin
  aggregates, and transport hard ceilings;
- session credentials in headers rather than URLs, JSON-only command creation,
  a separate admin bearer credential, and public-origin admin disablement;
- Node 24 CI, build/test/lint/format/restart smoke, container contract build,
  environment-approved immutable GHCR publish, a locked host deploy/rollback
  wrapper with a schema-matched pre-deploy database snapshot, loopback systemd
  service, Cloudflare Tunnel config, and bounded encrypted restic backup/restore
  instructions. Host automation is deliberately deferred because this public
  fork must not expose a persistent management-network runner.

End-to-end verification created a guest, fetched state, applied and replayed a
tap, checked admin observation, restarted the authority against the same
database, recovered the same player, and confirmed Influence/revision did not
move backward. Live interaction remained reconciled after the five-second
poll, with exactly one `YOU` label on the actual owned territory.

The next planning phase still owns upgrades/spending, production automation,
season scoring/archive rewards, multi-world matchmaking, Discord linking, the
admin case UI, and calibrated anti-cheat rules.
