# 🍩 Donut SMP Miner

A clean, multi-account **dirt-mining bot for DonutSMP**, built on the
[GenerelSchwerz fork of mineflayer](https://github.com/GenerelSchwerz/mineflayer)
(v4.37.1, with the `@nxg-org/mineflayer-physics-util` physics plugin enabled).

It logs in **with tokens** (no password typed anywhere), **refreshes those tokens
automatically** so you don't have to reconnect by hand, supports **proxies**,
runs **many accounts at once**, stores everything inside an **encrypted vault**,
and shows a **live console dashboard**.

> 🇫🇷 **Tu débutes ? Lis le guide pas-à-pas pour enfant de 5 ans :**
> [`docs/INSTALLATION_FR.md`](docs/INSTALLATION_FR.md)

---

## ✨ Features

| Feature | What it does |
|--------|--------------|
| 🔑 **Token login** | Connects using your Minecraft token — no password, no browser. |
| 🔄 **Auto token-refresh** | When a token expires (~24h), it's rebuilt automatically from your Microsoft refresh token. No manual reconnect. |
| 🧑‍🤝‍🧑 **Multi-account** | Run as many accounts as you want, all at once, each with its own state. |
| 🌐 **Proxy support** | SOCKS5 and HTTP proxies, per-account or rotated across accounts. |
| 🔐 **Encrypted vault** | All accounts/tokens are encrypted at rest with AES‑256‑GCM behind a master password. |
| ⛏️ **Dirt mining** | Finds, walks to, and digs dirt-type blocks using `mineflayer-pathfinder`, with safety checks. |
| 📊 **Live dashboard** | A colored, auto-refreshing table: who's online, blocks mined, health, position. |
| ♻️ **Auto-reconnect** | Drops are handled automatically with back-off. |

---

## 🚀 Quick start

```bash
# 1. Install Node.js LTS  →  https://nodejs.org   (one time)
# 2. From this folder:
npm install
npm start
```

…or on Windows just **double-click `start.bat`** (it installs everything for you).

On first launch it will:
1. ask you to **create a master password** (this protects your vault),
2. offer to **import accounts** (point it at a `.zip` export or a folder),
3. drop you into a **menu** where you can start the bots.

Full beginner walkthrough: [`docs/INSTALLATION_FR.md`](docs/INSTALLATION_FR.md) (FR) · architecture: [`docs/COMMENT_CA_MARCHE.md`](docs/COMMENT_CA_MARCHE.md).

---

## 📁 Project structure

```
donut-smp-miner/
├─ start.bat              ← double-click launcher (Windows)
├─ package.json
├─ config/
│  ├─ config.example.json ← copy of the default settings (documented)
│  └─ config.json         ← YOUR settings (auto-created, git-ignored)
├─ data/                  ← 🔒 secrets live here (git-ignored)
│  ├─ vault.enc           ← encrypted accounts vault
│  └─ token-cache/        ← per-account auth cache while running
├─ samples/               ← put your account exports here (git-ignored)
├─ docs/                  ← documentation (FR, beginner-friendly)
├─ src/
│  ├─ index.js            ← entry point (menu + dashboard)
│  ├─ vault/              ← encryption + vault file
│  ├─ accounts/           ← import .zip / accounts.txt + cookies
│  ├─ auth/               ← decode tokens, refresh tokens, seed auth cache
│  ├─ proxy/              ← SOCKS5 / HTTP proxy
│  ├─ bot/                ← the mineflayer bot + mining logic
│  ├─ manager/            ← runs many bots together
│  ├─ ui/                 ← console theme + live dashboard
│  └─ config/             ← settings loader
└─ test/                  ← offline unit tests (`npm test`)
```

---

## ⚙️ Configuration

Settings live in `config/config.json` (created from the defaults on first run).
See [`config/config.example.json`](config/config.example.json) for every option.
Highlights:

- `server.host` / `server.port` — defaults to `donutsmp.net:25565`.
- `server.version` — `false` means auto-detect.
- `mining.targetBlocks` — which blocks count as "dirt".
- `mining.horizontalRadius`, `mining.maxFallDistance` — search + safety.
- `behavior.refreshMarginSeconds` — refresh tokens this long before expiry.
- `proxy.enabled`, `proxy.mode` (`per-account` / `rotate`), `proxy.list`.

---

## 🔐 Security

- Accounts are encrypted with **AES‑256‑GCM**; the key is derived from your
  master password with **scrypt**. Lose the password → the vault is unrecoverable
  (by design).
- `data/`, `config/config.json`, `samples/`, and `*.zip` are **git-ignored** so
  you never push secrets to GitHub.
- **Honest limitation:** while a bot is running, `prismarine-auth` needs the token
  on disk in `data/token-cache/` (plaintext, git-ignored). It's wiped when you
  quit with `Ctrl+C`. See [`docs/SECURITE.md`](docs/SECURITE.md).

---

## ✅ What has actually been tested (no guessing)

Verified on this machine:

- ✔️ Dependencies install; the mineflayer **fork is v4.37.1 with the nxg physics plugin**.
- ✔️ **14/14 unit tests pass** (vault encryption, importer, token decode, proxy parsing).
- ✔️ The **token-refresh chain works for real** against Microsoft → Xbox → Minecraft
  (tested with the actual exported accounts).
- ✔️ **mineflayer's own auth path accepts the injected token** and returns a live
  Minecraft profile for both accounts (queried Mojang's profile API successfully).

**Not yet tested live (be aware):**

- ❌ The actual in-game connection to DonutSMP and the digging behavior have **not**
  been run against the live server here (doing so risks the accounts and requires
  actually joining). The mining code follows the documented mineflayer/pathfinder
  API but should be validated by you in-game first.

---

## ⚠️ Disclaimer

Automation/botting may violate DonutSMP's rules and can get accounts banned.
Use this on accounts you own and accept the risk. This project is for learning
and personal automation.

## 📜 License

MIT — see `package.json`.
