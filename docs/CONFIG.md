# ⚙️ Configuration guide

All settings live in **`config/config.json`**. It's created automatically on the
first run from the built-in defaults. A documented copy is in
[`config/config.example.json`](../config/config.example.json).

- You only need to write the keys you want to **change** — anything you omit
  falls back to the default.
- It's plain JSON, so **no comments** and **no trailing commas**. If the bot says
  *"config.json is not valid JSON"*, you probably left a comma or a `//` comment.

> Tip: to start clean, copy the example over your config:
> ```bash
> cp config/config.example.json config/config.json
> ```

---

## `server` — which server to join

| Key | Default | Meaning |
|-----|---------|---------|
| `host` | `"donutsmp.net"` | Server address. |
| `port` | `25565` | Server port. |
| `version` | `false` | `false` = auto-detect. Pin a string (e.g. `"1.21.11"`) if auto-detect misbehaves. |

```json
{ "server": { "host": "donutsmp.net", "port": 25565, "version": "1.21.11" } }
```

---

## `mining` — how it digs dirt

| Key | Default | Meaning |
|-----|---------|---------|
| `targetBlocks` | dirt/grass/… | Block names treated as "dirt" to mine. |
| `horizontalRadius` | `16` | How far to look for dirt when nothing is in reach. |
| `maxFallDistance` | `3` | Never dig a block that would drop the bot deeper than this. |
| `maxPitDepth` | `2` | Never dig more than this far below the local surface → the bot strip-mines **sideways** and stays near its drops. |
| `digTimeoutMs` | `12000` | Abandon a block if it takes longer than this. |
| `reachOnly` | `true` | Only dig blocks reachable without falling into the void. |
| `pauseBetweenBlocksMs` | `150` | Small human-like pause between blocks. |
| `dropCollectRadius` | `2.5` | Only pick up drops within this radius (no chasing far ones). |
| `sweepEveryBlocks` | `6` | Every N blocks, vacuum up scattered drops in one pass. |
| `sweepRadius` | `4` | How far that sweep reaches. |

**Want more dirt collected (slower)?** raise `dropCollectRadius` to `3.5`, lower
`sweepEveryBlocks` to `3`, and keep `maxPitDepth` at `2`.

**Want faster mining (less collected)?** raise `maxPitDepth` and `horizontalRadius`.

---

## `work` — teleport, tools, inventory, "done"

| Key | Default | Meaning |
|-----|---------|---------|
| `rtpOnStart` | `true` | Run the teleport command when the bot spawns. |
| `rtpCommand` | `"/rtp overworld"` | The teleport command to send (fresh terrain). |
| `rtpWaitMs` | `14000` | How long to wait for the teleport to happen. |
| `reRtpWhenStuckSeconds` | `30` | No dirt progress for this long → teleport again (bad spot). |
| `shovelTier` | `"wooden"` | Which shovel to craft (`wooden`/`stone`/…). |
| `shovelsPerBatch` | `6` | Craft up to this many shovels per restock. |
| `logsNeededPerBatch` | `2` | Logs to gather before crafting (a small tree is enough). |
| `woodSearchRadius` | `48` | How far to look for trees. |
| `woodBudgetMs` | `12000` | Max time spent fetching wood before going back to mining. |
| `tidyEveryBlocks` | `16` | Open the inventory & drop junk every N dirt blocks. |
| `fullWhenFreeSlotsAtMost` | `0` | Inventory is "full of dirt" once free slots ≤ this → disconnect + report. |
| `keepDirtItems` | dirt list | The loot to **keep**. Everything not in keep-rules is dropped. |
| `keepFood` | bread/… | Food items to keep (so the bot can eat). |

**Stay at spawn instead of teleporting:** `"rtpOnStart": false`.
**Different server's RTP:** change `rtpCommand` (e.g. `"/wild"`, `"/rtp"`).

---

## `combat` — self-defense

| Key | Default | Meaning |
|-----|---------|---------|
| `enabled` | `true` | Turn defense on/off. |
| `useShield` | `true` | Raise a shield (if the account owns one). |
| `hostileTypes` | skeleton/zombie/… | Mob names that trigger defense. |
| `engageRange` | `10` | Start defending when a hostile is this close. |
| `attackRange` | `3` | Melee range. |
| `attackCooldownMs` | `600` | Wait between swings (full-damage hits). |

---

## `proxy` — route bots through proxies

| Key | Default | Meaning |
|-----|---------|---------|
| `enabled` | `false` | Master switch. |
| `mode` | `"per-account"` | `per-account` (each account's own `proxy`) or `rotate` (spread `list`). |
| `list` | `[]` | Proxies to rotate. |

Accepted proxy formats:
```
socks5://user:pass@1.2.3.4:1080
http://1.2.3.4:8080
1.2.3.4:1080                 (socks5 by default)
1.2.3.4:1080:user:pass
```

```json
{
  "proxy": {
    "enabled": true,
    "mode": "rotate",
    "list": ["socks5://user:pass@1.2.3.4:1080", "1.2.3.4:1081"]
  }
}
```

---

## `behavior` — reconnect & accounts

| Key | Default | Meaning |
|-----|---------|---------|
| `reconnectDelayMs` | `8000` | Wait before reconnecting after a drop. |
| `maxReconnects` | `0` | `0` = unlimited. |
| `refreshMarginSeconds` | `600` | Refresh tokens this long before they expire. |
| `startStaggerMs` | `4000` | Delay between starting each account. |

## `console`

| Key | Default | Meaning |
|-----|---------|---------|
| `refreshMs` | `1000` | Dashboard refresh rate (ms). |

---

## Per-account overrides

Each account in the vault can carry its **own** `proxy` and an `enabled` flag.
Set those from the app's account screens (they live encrypted in the vault, not
in `config.json`).
