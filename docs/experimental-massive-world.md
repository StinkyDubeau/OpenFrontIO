# Massive world experiment

This document describes the isolated `experimental/massive-world-demo` branch.
It is a long-shot interaction and architecture prototype, not a change to the
standard IdleFront or OpenFront ruleset.

## What the playable slice proves

- A 64 × 32 strategic atlas addresses 2,048 tactical sectors.
- Each sector represents a normal OpenFront-scale board of roughly two million
  tiles, producing a 4.096-billion-tile **logical address space**.
- The browser receives an 8 KiB RGBA summary texture for the entire atlas. It
  never loads 4.096 billion tactical tiles.
- Only one tactical sector runs at a time. Entering it uses the canonical
  `join-lobby` flow and the unchanged OpenFront simulation and renderer.
- A canonical stock-game win is bridged back to the exact selected sector as
  an idempotent strategic capture. A loss or early exit leaves the frontier
  unchanged, and the Win screen's Exit action returns to the atlas rather than
  the title screen.
- Before the travel milestone, tactical entry uses the stock Amazon River map
  and the atlas permits border and river expansion. After the duration-scaled
  milestone, the stock World map and deliberately short ocean crossings open.
- The one-hour, one-day, and one-week selections scale strategic command
  regeneration, background front activity, and the travel milestone.
- Atlas progress, camera position, selected sector, and offline elapsed time
  survive a local browser or Expo WebView restart.

The strategic pressure/capture model is deliberately small and aggregated. It
is not yet authoritative OpenFront combat, and the derived logical-tile and AI
cohort counts must not be described as fully simulated tiles or independent
bots. It exists to test whether expanding through a huge world feels useful
between tactical sessions.

## Preview entry points

- A development client reaches the slice directly at
  `/experimental/massive-world?duration=1d` (or `1h` / `7d`).
- The Expo shell can target the same route with
  `EXPO_PUBLIC_GAME_URL=https://atlas-dev.sightings.today/experimental/massive-world?duration=1d`.
  URL normalization adds any missing pathname slash without corrupting the
  duration query.
- The durable development hostname remains behind its existing preview-login
  cookie. The password is runtime configuration and must never be placed in
  the repository or Expo bundle.

## Why the experiment is layered

The current engine assumes a single full rectangular `GameMapImpl`. Both the
simulation worker and renderer allocate resources proportional to the complete
map. A naïve 4.096-billion-tile map would require tens of gigabytes of CPU and
GPU memory per client, and a renderer or worker per sector would be worse.

The viable boundary is therefore:

1. A cheap macro atlas for navigation, world pacing, presence, and summaries.
2. A versioned sector manifest that maps global sector coordinates to one
   ordinary OpenFront runtime and map asset.
3. Exactly one active tactical renderer and simulation worker per player.
4. Server subscriptions for the visible sector window plus a small neighbor
   ring, rather than broadcasting every tactical turn to every player.
5. Deterministic sector checkpoints and paged replay for cold re-entry.

The prototype already follows points 1 and 3 and implements a local
sector/outcome identity bridge for point 2. The tactical terrain itself is
still a stock scenario rather than a generated geographic projection of the
selected macro cell. Its local model stands in for the future summary service;
the authoritative server manifest, subscription protocol, and checkpoint
store are the next infrastructure boundary.

## Current performance envelope

The atlas state upload is 2,048 × 4 bytes and the full-screen shader is constant
cost with respect to the logical world size. Device pixel ratio is capped at 2.
Close-detail roads, cities, and cohort cells fade out at overview zoom. The
atlas requestAnimationFrame loop and timer are suspended while tactical
OpenFront is active and while the native app is backgrounded. WebGL context
loss is handled and resources are recreated after iOS restores the view.

A stock Giant World Map test with 400 simple tribes and its 107 authored
nations averaged about 9.8 ms per simulation tick and peaked near 127 MB of JS
heap on the development desktop. That map alone requires roughly 152 MB of
known map-sized GPU textures and is 4,108 pixels wide, which exceeds the 4,096
texture limit on some devices. The tactical handoff consequently uses the
phone-safe stock World/Amazon River maps instead of presenting Giant World Map
as universally mobile-safe.

## Production gates

The experiment should not be promoted to a persistent multiplayer mode until
these gates are met:

- Persist a versioned world/sector manifest and immutable engine build hash.
- Make the server authoritative for macro ownership, travel edges, schedules,
  and tactical-runtime allocation.
- Add acknowledged journal persistence and deterministic checkpoints; a
  one-day game currently creates 864,000 turns at 10 Hz and cold replay is not
  a usable reconnect strategy.
- Make the 170-minute stock hard win limit an opt-in profile field whose default
  remains byte-for-byte compatible with current OpenFront.
- Persist the final reserved-player roster atomically with runtime creation.
- Add readiness that proves workers and active runtime journals are attached,
  not merely that the HTTP process is alive.
- Restore the last same-origin world route in the Expo shell after WebView
  process death and complete real account/gameplay authentication across
  devices.
- Introduce a composite `(sectorId, localTileRef)` identity before any combat
  can cross a seam. A paged renderer needs neighbor halos for border and rail
  shaders and explicit seam ownership.
- Load-test sector allocation, reconnect, checkpoint recovery, and mobile GPU
  memory before raising human or AI limits.

## Fidelity invariant

Tactical combat, structures, roads, railways, diplomacy, economy, boats, AI,
and rendering begin from the current OpenFront rules and assets. Experimental
pacing selects _where and when_ a stock sector is entered; it does not silently
rewrite those rules. Any future deviation belongs in an explicit, versioned
experience profile and must leave the standard profile unchanged.
