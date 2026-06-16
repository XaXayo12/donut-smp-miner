# 🧠 How it works (no magic, no guessing)

Everything below was verified against the real library code in `node_modules`
(and, for auth, tested live). Nothing here is assumed.

---

## 1) Token login

A modern Minecraft account connects with a **token** (`mctoken`), not a password.
That token is a JWT containing, in clear text, the **name**, **UUID** and an
**expiry date** (lifetime ~24h). `src/auth/decodeToken.js` reads those.

mineflayer logs in through **`prismarine-auth`**, which reads small cache files.
So before launching, `src/auth/seedCache.js` writes those cache files with our
token (`…_mca-cache.json`) and refresh token (`…_live-cache.json`). mineflayer
then uses **our** token immediately — no login page.

> ✅ Verified: calling `getMinecraftJavaToken()` (the exact function mineflayer
> uses) with the seeded cache returned a valid Minecraft profile for both accounts.

## 2) Automatic refresh

When the token dies (~24h), the **Microsoft refresh token** rebuilds a new one via
`Microsoft → Xbox Live → XSTS → Minecraft` (`src/auth/refresh.js`). The client id
is `00000000402b5328` (= Minecraft Java), taken straight from the token's own `aid`
field. Microsoft rotates the refresh token each time, so the new one is saved back
into the vault.

> ✅ Verified live: the full chain produced a fresh token for both accounts.
> ⚠️ If an account has no valid refresh token, it shows **needs-login** (red).

## 3) Per-account isolation

Each account runs its **own** `ManagedBot` (`src/bot/createBot.js`) with its **own**:
- mineflayer bot instance,
- token-cache folder (`data/token-cache/<account>/`),
- proxy,
- decision brain + pathfinder movements,
- combat handler.

The manager (`src/manager/botManager.js`) only shares the vault, and writes to it
through a serial queue. **No mutable state is shared between accounts**, so one bot
can never disturb another.

## 4) The work loop (`src/bot/brain.js`)

A state machine, checked every cycle:

1. **Defend** — if a hostile mob is within range, fight first (see §6).
2. **Done** — if the inventory is full of dirt, tidy it, then disconnect + report.
3. **Restock** — if no shovel is in hand:
   - mine wood (`gather.js`), then
   - craft planks → sticks → crafting table → **a batch of shovels** (`crafting.js`),
   - move a shovel into the hand (`inventory.js`).
4. **Mine** — dig one dirt block, collect the drop, keep only dirt.

"Make max shovels in a loop": `craftShovels()` crafts as many as the gathered wood
allows (`recipe.delta` tells us how many we can make). When the bot runs out again,
it loops back to wood.

## 5) Real inventory handling (`src/bot/inventory.js`)

`bot.inventory` is the **live, server-synced** inventory — not a guess. We:
- **keep** dirt + shovels + wood/planks/sticks/table + combat gear + food,
- **drop** everything else (`bot.toss`, a real packet),
- **equip** a shovel into the hand (`bot.equip`, a real inventory click).

"Inventory full of dirt" = no free slots left after junk is dropped → the bot
disconnects and writes a line to `data/reports.log` + the console.

## 6) Self-defense (`src/bot/combat.js`)

- Detects hostiles by `entity.kind === 'Hostile mobs'`, `entity.type === 'hostile'`,
  or name (skeleton, zombie, …).
- **Shield**: if the account owns one, it's equipped to the off-hand and raised with
  `bot.activateItem(true)` (great vs skeleton arrows), lowered to swing.
- **Melee**: `bot.attack(target)` on a cooldown, approaching with `GoalFollow`.
- **Creepers**: it backs away instead of meleeing, so it doesn't get blown up.

> Shields/swords are **used if owned**; the bot can't craft a shield (needs iron).

## 7) Proxy (`src/proxy/proxy.js`)

SOCKS5 and HTTP CONNECT. It resolves Minecraft **SRV** records first (like
minecraft-protocol does) and falls back to a direct connection. Per-account or
rotated across accounts.

## 8) Auto-reconnect

On a drop/kick, the bot waits then reconnects (`behavior.reconnectDelayMs`),
refreshing the token if needed. `done` and `needs-login` do **not** reconnect.
