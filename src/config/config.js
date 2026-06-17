// 📦 config.js — settings loader.
//    Reads config/config.json (your settings). Missing values fall back to the
//    defaults below, so you're never blocked. Edit config/config.json to tune.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

export const DEFAULTS = {
  server: {
    host: 'donutsmp.net', // the DonutSMP address
    port: 25565,
    version: false // false = mineflayer auto-detects the version
  },
  mining: {
    // Blocks treated as "dirt" to mine.
    targetBlocks: ['dirt', 'grass_block', 'coarse_dirt', 'rooted_dirt', 'dirt_path', 'podzol', 'mud'],
    horizontalRadius: 16, // search radius (blocks) around the bot for dirt
    maxFallDistance: 3, // don't dig a block that would drop us deeper than this
    maxPitDepth: 2, // never dig more than this far below the local surface (stay
    // shallow so the bot strip-mines sideways and stays near its drops)
    digTimeoutMs: 12000, // give up on a block if it takes too long
    reachOnly: true, // only dig blocks we can reach without falling into the void
    pauseBetweenBlocksMs: 150, // small human-like pause between blocks
    dropCollectRadius: 2.5, // only pick up drops within this radius (no far chasing)
    sweepEveryBlocks: 6, // every N dirt blocks, vacuum up scattered drops in one pass
    sweepRadius: 4 // how far that sweep reaches
  },
  work: {
    // Teleport to a FRESH area on arrival (untouched dirt + real trees).
    // DonutSMP: "/rtp overworld". Set rtpOnStart:false to stay at spawn.
    rtpOnStart: true,
    rtpCommand: '/rtp overworld',
    rtpWaitMs: 14000, // how long to wait for the teleport to happen
    reRtpWhenStuckSeconds: 30, // bad spot (wrong biome/water)? teleport again
    // The self-sufficient tool loop (wood -> shovels).
    shovelTier: 'wooden', // which shovel to craft: wooden/stone/iron…
    shovelsPerBatch: 6, // craft up to this many per restock ("max shovels")
    logsNeededPerBatch: 2, // logs to gather before crafting (a small tree is enough)
    woodSearchRadius: 48, // how far to look for trees
    woodBudgetMs: 12000, // max time spent trying to fetch wood before mining by hand
    tidyEveryBlocks: 16, // open inventory & drop junk every N dirt blocks
    fullWhenFreeSlotsAtMost: 0, // "inventory full" once free slots <= this -> disconnect
    // What we KEEP (the loot). Everything else is junk and gets dropped.
    keepDirtItems: ['dirt', 'coarse_dirt', 'rooted_dirt', 'podzol', 'mud', 'dirt_path', 'grass_block'],
    keepFood: ['bread', 'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'apple', 'carrot', 'baked_potato', 'golden_carrot']
  },
  combat: {
    enabled: true,
    useShield: true, // raise a shield (if the account owns one) vs arrows/melee
    hostileTypes: [
      'skeleton', 'stray', 'bogged', 'zombie', 'husk', 'drowned', 'spider', 'cave_spider',
      'creeper', 'witch', 'pillager', 'vindicator', 'zombified_piglin', 'enderman', 'phantom',
      'zoglin', 'hoglin', 'warden', 'blaze', 'slime'
    ],
    engageRange: 10, // start defending when a hostile is this close
    attackRange: 3, // melee range
    attackCooldownMs: 600, // wait between swings (full-damage hits)
    fleeHealth: 8 // at/below this HP, stop mining and teleport away (don't die)
  },
  behavior: {
    reconnectDelayMs: 8000, // wait before reconnecting after a drop
    maxReconnects: 0, // 0 = unlimited
    refreshMarginSeconds: 600, // refresh tokens this long before they expire
    startStaggerMs: 4000 // delay between starting each account
  },
  proxy: {
    enabled: false, // set true to use proxies
    // 'per-account' = each account keeps its own account.proxy
    // 'rotate'      = distribute the list below across accounts
    mode: 'per-account',
    list: [] // e.g. ["socks5://user:pass@1.2.3.4:1080", "1.2.3.4:1081"]
  },
  console: {
    refreshMs: 1000 // dashboard refresh rate
  }
}

// Shallow-ish deep merge: user values override defaults.
function deepMerge (base, extra) {
  const out = Array.isArray(base) ? [...base] : { ...base }
  for (const k of Object.keys(extra || {})) {
    if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], extra[k])
    } else {
      out[k] = extra[k]
    }
  }
  return out
}

export function configPath () {
  return path.join(ROOT, 'config', 'config.json')
}

/** Load config (with defaults). Creates the file if missing. */
export function loadConfig () {
  const file = configPath()
  let user = {}
  if (fs.existsSync(file)) {
    try {
      user = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (e) {
      throw new Error(`config/config.json is invalid JSON: ${e.message}`)
    }
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(DEFAULTS, null, 2))
  }
  return deepMerge(DEFAULTS, user)
}

export const paths = {
  root: ROOT,
  data: path.join(ROOT, 'data'),
  vault: path.join(ROOT, 'data', 'vault.enc'),
  tokenCache: path.join(ROOT, 'data', 'token-cache')
}

export default { DEFAULTS, loadConfig, configPath, paths }
