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
