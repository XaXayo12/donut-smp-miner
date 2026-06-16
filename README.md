# 🍩 Donut SMP Miner

A clean, **multi-account, self-sufficient dirt-mining bot for DonutSMP**, built on the
[GenerelSchwerz fork of mineflayer](https://github.com/GenerelSchwerz/mineflayer)
(v4.37.1, with the `@nxg-org/mineflayer-physics-util` physics plugin enabled).

Each bot logs in **with a token** (no password typed anywhere), **refreshes that token
automatically**, runs through a **proxy**, and is **fully isolated** from the others.
It even **makes its own tools**: it chops wood, crafts shovels, mines dirt, throws away
junk, and when its inventory is full of dirt it **leaves the server and reports "done"**.
It also **defends itself** against hostile mobs and **raises a shield**.

> 🚀 **New here?** Read the step-by-step setup: [`docs/SETUP.md`](docs/SETUP.md)
> · 🧠 How it works: [`docs/HOW_IT_WORKS.md`](docs/HOW_IT_WORKS.md)
> · 🔐 Security: [`docs/SECURITE.md`](docs/SECURITE.md)
> · 🇫🇷 Guide débutant en français : [`docs/INSTALLATION_FR.md`](docs/INSTALLATION_FR.md)

---

## ✨ Features

| Feature | What it does |
|--------|--------------|
| 🔑 **Token login** | Connects using your Minecraft token — no password, no browser. |
| 🔄 **Auto token-refresh** | When a token expires (~24h), it's rebuilt automatically from the Microsoft refresh token. |
| 🧑‍🤝‍🧑 **Heavy multi-account** | Run many accounts at once. **Strict isolation** — separate bot, token cache, proxy and brain per account. One account never disturbs another. |
| 🌐 **Per-account proxy** | SOCKS5 / HTTP, per-account or rotated. SRV-record aware. |
| 🪵 **Self-sufficient tools** | Out of shovels? It mines wood → crafts planks → sticks → a crafting table → **a full batch of shovels**, then keeps mining. |
| 🎒 **Real inventory management** | Periodically checks the **real** inventory, keeps only dirt (+ tools/wood/gear), **drops the junk**, and moves a shovel into the hand. |
| ✅ **Done & disconnect** | When the inventory is full of dirt, it **logs out** and writes a `done` report (console + `data/reports.log`). |
| 🛡️ **Self-defense** | Detects hostile mobs (skeletons, zombies, …), **raises a shield**, fights back, and backs away from creepers. |
| 🔐 **Encrypted vault** | All accounts/tokens encrypted at rest (AES-256-GCM + scrypt) behind a master password. |
| 📊 **Live dashboard** | Colored, auto-refreshing table: state, dirt mined, HP, position, last action. |
| ♻️ **Auto-reconnect** | Drops are handled automatically with back-off + token refresh. |

---

## 🚀 Quick start

```bash
npm install
npm start
```

…or on Windows just **double-click `start.bat`**.

On first launch it will: (1) create a **master password**, (2) offer to **import accounts**
(a `.zip` export or a folder), (3) drop you into a **menu** to start the bots.

---

## 🧠 The work loop (per bot)

```
       ┌─ hostile mob nearby? ─────────► DEFEND  (raise shield, attack, flee creepers)
       │
       ├─ inventory full of dirt? ─────► DONE    (drop junk, disconnect, report)
       │
       ├─ no shovel in hand? ──────────► RESTOCK
       │        mine wood → planks → sticks → crafting table → craft max shovels
       │        → move a shovel into the hand
       │
       └─ otherwise ───────────────────► MINE one dirt block, keep only dirt
```

Every step uses **real** mineflayer actions (real digging, real crafting-table windows,
real item drops, real shield use). Details in [`docs/HOW_IT_WORKS.md`](docs/HOW_IT_WORKS.md).

---

## 📁 Project structure

```
src/
├─ index.js            ← entry point (menu + dashboard)
├─ vault/              ← encryption + vault file
├─ accounts/           ← import .zip / accounts.txt + cookies
├─ auth/               ← decode tokens, refresh tokens, seed auth cache
├─ proxy/              ← SOCKS5 / HTTP proxy (SRV-aware)
├─ bot/
│  ├─ createBot.js     ← one managed bot per account (login + reconnect)
│  ├─ brain.js         ← the decision loop / state machine
│  ├─ gather.js        ← find → walk → dig → collect drops
│  ├─ crafting.js      ← logs → planks → sticks → table → shovels
│  ├─ inventory.js     ← keep dirt, drop junk, equip shovel
│  └─ combat.js        ← detect hostiles, shield, attack
├─ manager/            ← runs many bots together + done reports
├─ ui/                 ← console theme + live dashboard
└─ config/             ← settings loader
```

---

## ⚙️ Configuration

Settings live in `config/config.json` (created from the defaults on first run).
**📖 Full reference with every option and examples: [`docs/CONFIG.md`](docs/CONFIG.md).**
Quick highlights:

- `server.host` / `port` — defaults to `donutsmp.net:25565`. `version: false` = auto-detect.
- `work.rtpCommand` / `rtpOnStart` — teleport to fresh terrain on spawn (`/rtp overworld`).
- `mining.maxPitDepth`, `dropCollectRadius`, `sweepEveryBlocks` — mining + drop pickup tuning.
- `work.shovelsPerBatch`, `keepDirtItems`, `fullWhenFreeSlotsAtMost` — tools, loot, "done".
- `combat.enabled`, `useShield`, `hostileTypes`, `engageRange` — self-defense.
- `proxy.enabled`, `proxy.mode` (`per-account` / `rotate`), `proxy.list`.

Changes over time are tracked in [`CHANGELOG.md`](CHANGELOG.md).

---

## 🔐 Security (honest)

- Accounts encrypted with **AES-256-GCM**, key derived via **scrypt**. Lose the master
  password → vault unrecoverable (by design).
- `data/`, `config/config.json`, `samples/`, `*.zip` are **git-ignored** — secrets never
  reach GitHub.
- While a bot runs, `prismarine-auth` needs the token on disk in `data/token-cache/`
  (plaintext, git-ignored, wiped on `Ctrl+C`). Full notes: [`docs/SECURITE.md`](docs/SECURITE.md).

---

## ✅ What has actually been tested (no guessing)

- ✔️ Dependencies install; the mineflayer **fork is v4.37.1 with the nxg physics plugin**.
- ✔️ **22/22 unit tests pass** (vault, importer, token decode, proxy, inventory keep/junk, hostile detection).
- ✔️ The **token-refresh chain works for real** (Microsoft → Xbox → Minecraft, both accounts).
- ✔️ **Live on DonutSMP**: token login → survival spawn, **`/rtp overworld`**, continuous
  dirt mining, self-heal re-/rtp, partial wood→shovel crafting, and self-defense were all
  observed working against the real server (protocol 774 / MC 1.21.11).

**Honest caveats:** drop pickup is ~50–70% depending on terrain, and wild shovel-crafting
is best-effort (needs an adjacent tree). Both are tunable (`docs/CONFIG.md`) and don't stop
the bot from mining. Botting may break server rules — use accounts you own (see Disclaimer).

---

## ⚠️ Disclaimer

Automation/botting may violate DonutSMP's rules and can get accounts banned. Use on
accounts you own and accept the risk. For learning and personal automation.

## 📜 License

MIT — see [`LICENSE`](LICENSE).
