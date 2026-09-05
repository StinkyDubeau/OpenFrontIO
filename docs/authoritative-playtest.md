# Server-authoritative playtest — 2026-09-05

## What this release does

New persistent worlds run the existing OpenFront GameRunner in one Node worker
thread per world. Browsers render the resulting state; they do not execute the
world's combat, economy, pathfinding or AI. The network worker remains separate
from that CPU work. The server targets the existing 100 ms turn interval, not
the speed of the slowest phone.

No combat, structure, AI, economy, movement-cost or pacing formula was changed.
The only core implementation edits are exposing the existing full player-view
projection and releasing consumed GameRunner turn entries every 1,024 turns.
This does not release the server's durable/replay journal.

Clients use a versioned binary view envelope, field diffs and typed arrays.
The normal renderer/HUD/query interface is retained. Action queries go to the
server, while gameplay intents retain their authenticated server-stamped
identity and existing rule validation. Static structures are not redundantly
resent every tick; moving units receive final server positions.

Fresh joins receive the current render state (players, units, terrain changes,
rails and destroyed visual-layer tiles). Historical notifications/animations
are not replayed. Short reconnects resume a bounded delta tail; older or
interrupted initial loads reload a fresh view. This is a **render snapshot**,
not an engine checkpoint.

Each socket has an eight-frame acknowledged delivery window, a bounded queue
and a stalled-consumer timeout. It cannot hold back the world or other clients.
Repeated snapshot subscriptions on the same socket are ignored. Queries are
rate limited. A heartbeat keeps the connection alive during server recovery.

Also fixed an existing guest credential bug: splitting base64url signatures
on underscores randomly rejected valid tokens. Verification now uses the fixed
43-character SHA-256 signature boundary, with 128 generated regression cases.

## How to test

1. Deploy the same commit for both server and browser bundles. Reload existing
   browser tabs after deployment. The mobile wrapper uses the web build from
   its configured origin; it must point at the updated deployment too.
2. Open `https://www.idlefront.io/?debug=1`.
3. One person selects **Quick start**. Other players select **Quick join**
   within the one-minute countdown. There are eight human slots. These new
   test worlds are named `Server playtest ...` to distinguish older runtimes.
4. Enter the map, expand/attack, disconnect/rejoin, and compare devices.
   The debug overlay labels execution CPU as **Server simulation**. Client
   view/GPU-submit measurements remain separate.

The runtime selection is persisted with the world configuration. Older worlds
without `serverSimulation: true` retain the legacy execution path. Replays and
ordinary non-managed matches retain that path too. Anonymized worlds are
excluded until per-viewer identity projections are implemented. Set
`IDLE_SERVER_SIMULATION=0` before creating worlds to disable this rollout;
it does not mutate a running world's execution mode.

## Measurements and verification

Initial 1,800-tick headless run: Expanded Earth (8,216 × 3,896), 2,000 bots,
default nations and two human identities. One view joined at tick 901.

| Work                                    |     Mean |      p95 |       p99 |
| --------------------------------------- | -------: | -------: | --------: |
| Server simulation + projection/encoding | 53.24 ms | 81.95 ms | 166.89 ms |
| One client's decode + GameView update   |  2.53 ms |  3.98 ms |   5.38 ms |

These are distinct workloads, not a claim of a 21× total frame-rate increase.
They exclude DOM, GPU execution, socket compression and internet latency.
Occasional long ticks remain. One world averaged below its 100 ms budget;
this is not proof that arbitrary numbers of worlds fit the production host.

The initial tick-901 snapshot was 75.4 MB uncompressed over 563 chunks. Local
snapshot generation/application took 0.94 s, **excluding download time**.
Average initial uncompressed live payload was 221 KB/tick. Compression and
viewport subscriptions remain important; full-world visibility is not a
bandwidth solution for ten-times-larger boards.

The real local WebSocket test authenticated three independent identities.
Two clients matched across 359 live frames, one reconnected, a normal attack
was observed, and the third client intentionally stopped acknowledging.
Healthy clients continued at 9.95 TPS. Initial load was excluded from TPS.

Final 1,800-tick rerun also compared all current unit positions against the
authoritative snapshot. Tile state, unit positions and player reserves matched.
While other development worlds and the full test suite were running, server
work averaged 69.92 ms and client decode/view 3.79 ms (p95 9.68 ms). These are
contended-host figures, not a clean before/after comparison. The stationary-unit
projection reduced mean uncompressed payload to 199 KB/tick. Sampled deflate
frames averaged 65 KB (roughly 5.2 Mbit/s at 10 TPS); the tick-901 snapshot
compressed to about 17.45 MB. Actual Internet delivery still needs measurement.

Final regression run: **298 test files, 3,183 tests passed**. TypeScript and
production Vite build passed. Existing Vite asset-resolution/chunk-size warnings
remain; this pass did not rewrite the UI assets.

Reproduce with:

```text
tsx tests/perf/client/AuthoritativePerf.ts 1800
tsx tests/perf/client/AuthoritativeSocketSmoke.ts
vitest run
tsc --noEmit
vite build
```

The socket smoke test is intentionally hardwired to localhost:9000 and creates
one clearly named public development fixture. It does not touch production.
The test does not delete existing user worlds. Shell tests need `sh` on PATH.

Visual validation on this Windows Chrome session was blocked by its hardware
acceleration warning. Quick start reached the game route; no claim is made
about GPU frame rate on that machine. Client CPU/state tests use the actual
GameView, not a substitute simulation.

## What this does not yet solve

- Full engine checkpoints and restart-safe week-long worlds. Current server
  recovery still rebuilds the simulation from its journal; it can exceed the
  initialization timeout as a world ages. **Do not treat four-hour deploys as
  safe for week-long play yet.** Begin with short multiplayer playtests.
- Running-world engine version pinning and deployment isolation.
- Ten-times-larger worlds: clients still keep full terrain/ownership state;
  interest-managed pages, owner-ID limits and actor-density budgets remain.
- Parallel execution inside one world. Each world's simulation is intentionally
  sequential to preserve OpenFront's ordering. Multiple worlds use workers.
- The existing upstream 170-minute victory/lifecycle limits. No pacing exception
  was introduced in this performance pass.

See `server-authority-performance-plan.md` for the larger-scale constraints and
the next implementation gates. Production Debian throughput and internet/mobile
bandwidth still require the user's multi-device playtest.
