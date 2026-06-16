# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project aims to follow [Semantic Versioning](https://semver.org/).

## [1.2.0] — Live-tested on DonutSMP

Everything in this release was validated against the **real** DonutSMP server
(login, spawn, mining, movement, combat). See `docs/HOW_IT_WORKS.md`.

### Added
- **`/rtp overworld` on arrival** — the spawn is a dug-up hub with no trees, so
  each bot teleports to **fresh wilderness** (untouched dirt + real trees).
  Configurable via `work.rtpCommand` / `work.rtpOnStart`.
- **Self-heal** — if a bot makes no dirt progress for `work.reRtpWhenStuckSeconds`
  (bad biome, water, unreachable terrain) it teleports again automatically.
- **Systematic mining** — digs the nearest *adjacent* target first in a
  deterministic order, then walks only when nothing is in reach.
- **Smart drop pickup** — only collects **close** drops (`mining.dropCollectRadius`)
  plus an amortized **sweep** every `mining.sweepEveryBlocks` blocks; never wanders
  off to chase a far drop.
- **Pit-depth cap** (`mining.maxPitDepth`) — strip-mines sideways instead of
  sinking into a deep hole, so the bot stays near its drops.
- **Per-cycle watchdog** — no single stuck action can ever freeze a bot.

### Fixed
- Pinned protocol to **1.21.11** (DonutSMP/Velocity protocol 774) and enabled
  `hideErrors` to silence harmless `player_info` tab-list parse noise on 1.21.6+.
- `safeGoto` cancels stale pathfinding goals — fixes the *"goal was changed"*
  spam and the freezes it caused.
- Navigation may dig (`canDig`) so the bot is never trapped in the hole-riddled
  mining terrain; mining stays "reach-first" so it's still fast.
- Crafting is hard-time-boxed so it can never starve dirt mining.
- Removed a deprecated `entity.objectType` access that flooded the console.

### Known limitations
- Drop collection is ~50–70% depending on terrain (items merge as they're picked
  up). Tune with `mining.dropCollectRadius`, `sweepEveryBlocks`, `maxPitDepth`.
- Wild shovel-crafting is best-effort (a tree must be adjacent). The bot mines
  dirt fine without a shovel — throughput is bounded by movement, not dig speed.

## [1.1.0] — Self-sufficient brain

### Added
- Self-sufficient work loop: mine wood → planks → sticks → crafting table →
  **a batch of shovels** → mine dirt.
- **Real inventory management**: keep only dirt (+ tools/wood/gear), drop the
  junk, move a shovel into the hand — all via real window/packet actions.
- **Done & disconnect**: when the inventory is full of dirt, log out and write a
  `done` report (`data/reports.log`).
- **Self-defense** (`src/bot/combat.js`): detect hostiles, raise a shield, fight
  back, back away from creepers.
- Strict **per-account isolation** (own bot, token cache, proxy, brain).
- Whole codebase, docs and console output translated to **English**.

## [1.0.0] — Initial release

### Added
- **Token login** for DonutSMP via `prismarine-auth` cache seeding (no password).
- **Automatic token refresh** (Microsoft → Xbox → XSTS → Minecraft).
- **Encrypted vault** (AES-256-GCM + scrypt) for all account secrets.
- **Multi-account** orchestration with a **live console dashboard**.
- **SOCKS5 / HTTP proxy** support (per-account or rotated, SRV-aware).
- Importer for the `WEB-*.zip` export format (`accounts.txt` + `cookies/`).
- Built on the **GenerelSchwerz mineflayer fork** (4.37.1) with the nxg physics
  plugin + `mineflayer-pathfinder`.
- Beginner docs (FR ELI5 + EN) and offline unit tests.

[1.2.0]: https://github.com/your-user/donut-smp-miner/releases
[1.1.0]: https://github.com/your-user/donut-smp-miner/releases
[1.0.0]: https://github.com/your-user/donut-smp-miner/releases
