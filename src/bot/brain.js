// 📦 brain.js — the bot's decision loop (state machine).
//
//   Lessons from LIVE testing on DonutSMP:
//     • The dirt-mining area has holes/walls everywhere → navigation must be
//       allowed to dig, or the bot gets physically trapped and never moves.
//     • There are usually NO trees near the dirt spawn, and long-range pathing
//       to find one is slow/unreliable. So we NEVER stop mining to chase wood:
//       the bot mines dirt with a shovel if it has one, otherwise by hand, and
//       only crafts shovels when a tree is right next to it.
//
//   Priority each cycle:
//     1. DEFEND if a hostile mob is near (shield + attack).
//     2. DONE   if the inventory is full of dirt → disconnect + report.
//     3. SHOVEL prefer one (equip from inventory; craft only if a tree is
//        adjacent) — but never block mining.
//     4. MINE   one dirt block in reach, smoothly (strip-mine, no deep pits).
//
//   Each account runs its OWN brain on its OWN bot — nothing is shared.

import pathfinderPkg from 'mineflayer-pathfinder'
const { pathfinder, Movements } = pathfinderPkg

import { Combat } from './combat.js'
import { craftShovels } from './crafting.js'
import { blockIdsForNames, blockIdsBySuffix, mineOne, collectNearbyDrops } from './gather.js'
import {
  makeKeepPredicate, equipShovelToHand, hasShovelInHand,
  tossJunk, isInventoryFull, dirtCount
} from './inventory.js'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const jitter = (base, amt) => Math.max(0, base + Math.floor((Math.random() - 0.5) * amt))

export function startBrain (bot, config, hooks = {}) {
  const W = config.work
  const M = config.mining
  const log = hooks.log || (() => {})
  const onStatus = (t) => { hooks.onStatus?.(t) }
  const onMine = (n) => { hooks.onMine?.(n) }
  const onDone = (r) => { hooks.onDone?.(r) }

  let running = true
  let mined = 0
  let blocksSinceTidy = 0
  let nextWoodTry = 0 // cooldown so we don't keep trying to craft when it fails
  let lastProgressAt = Date.now() // for the "stuck → re-/rtp" self-heal
  let surfaceY = 0 // local ground level; capped pit depth keeps us near our drops
  const reRtpMs = Math.max(10, W.reRtpWhenStuckSeconds || 30) * 1000

  // Navigation may dig (terrain is full of holes here); mining is reach-first.
  if (!bot.pathfinder) bot.loadPlugin(pathfinder)
  const movements = new Movements(bot)
  movements.canDig = true
  movements.allow1by1towers = true
  movements.scafoldingBlocks = [] // never place our hard-won dirt as scaffolding
  bot.pathfinder.setMovements(movements)
  bot.pathfinder.thinkTimeout = 4000

  const combat = new Combat(bot, config, log)
  const keep = makeKeepPredicate(config)

  const dirtIds = () => blockIdsForNames(bot, M.targetBlocks)
  const woodIds = () => blockIdsBySuffix(bot, ['_log'])
  const countLogs = () => bot.inventory.items().filter(i => i.name.endsWith('_log')).reduce((s, i) => s + i.count, 0)

  // Strip-mine safety: only dig at/around feet (no deep pit), and never over a
  // drop bigger than maxFallDistance.
  function isSafe (block) {
    const feetY = Math.floor(bot.entity.position.y)
    if (block.position.y < feetY - 1) return false // no big single drop
    if (block.position.y < surfaceY - M.maxPitDepth) return false // stay shallow
    if (!M.reachOnly) return true
    let depth = 0
    let p = block.position.offset(0, -1, 0)
    while (depth <= M.maxFallDistance) {
      const b = bot.blockAt(p)
      if (!b || b.boundingBox === 'empty') { depth++; p = p.offset(0, -1, 0) } else break
    }
    return depth <= M.maxFallDistance
  }

  async function tidyInventory () {
    const dropped = await tossJunk(bot, keep, log)
    if (dropped) onStatus(`tidied inventory (dropped ${dropped} junk stacks)`)
    blocksSinceTidy = 0
  }

  // Chop adjacent wood + craft a batch of shovels. Only called when a tree is
  // basically next to us, so it stays quick. Returns true if we hold a shovel.
  async function chopAndCraft () {
    onStatus('🌳 a tree is here → making shovels')
    let idle = 0
    while (running && countLogs() < W.logsNeededPerBatch && idle < 3) {
      if (combat.threatNear()) { await combat.engage(() => running); continue }
      const r = await mineOne(bot, woodIds(), { maxDistance: 6, digTimeoutMs: 6000 }, log)
      if (r === 'none') idle++
      else { idle = 0; await sleep(jitter(180, 120)) }
    }
    if (countLogs() === 0) return false
    onStatus('🪓 crafting shovels')
    try {
      const made = await craftShovels(bot, W.shovelTier, W.shovelsPerBatch, log)
      onStatus(made > 0 ? `crafted ${made} shovel(s) ✓` : 'crafting produced no shovel')
    } catch (e) { log('crafting failed: ' + e.message) }
    await collectNearbyDrops(bot, 4, 2000)
    return equipShovelToHand(bot, log)
  }

  // One decision cycle.
  async function step () {
    // 1) DEFEND first.
    if (combat.threatNear()) {
      onStatus('⚔ defending')
      lastProgressAt = Date.now() // fighting counts as "not stuck"
      await combat.engage(() => running)
      return
    }

    // 1b) SURVIVE — if health is low, stop mining and teleport away from danger
    // (mobs, lava, a cave we exposed). Far better than dying.
    if (typeof bot.health === 'number' && bot.health <= (config.combat.fleeHealth ?? 8)) {
      onStatus(`🩸 low HP (${Math.round(bot.health)}) → fleeing`)
      await teleportToFreshArea()
      lastProgressAt = Date.now()
      return
    }

    // 2) DONE — inventory full of dirt.
    if (isInventoryFull(bot, config)) {
      await tidyInventory()
      if (isInventoryFull(bot, config)) {
        const report = { mined, dirt: dirtCount(bot, config), name: bot.username }
        onStatus(`✅ DONE — ${report.dirt} dirt collected`)
        onDone(report)
        running = false
        return
      }
    }

    // 2b) SELF-HEAL — no dirt progress for a while means this spot is bad
    // (wrong biome, water, unreachable terrain). Teleport somewhere fresh.
    if (Date.now() - lastProgressAt > reRtpMs) {
      onStatus('⌛ no progress here → teleporting to a fresh spot')
      await teleportToFreshArea()
      lastProgressAt = Date.now()
      return
    }

    // 3) SHOVEL — prefer one, but NEVER stop mining to chase wood.
    if (!hasShovelInHand(bot)) {
      if (!(await equipShovelToHand(bot, log))) {
        // Craft only if a tree is right next to us (no wandering off).
        const treeAdjacent = bot.findBlock({ matching: woodIds(), maxDistance: 6 })
        if (treeAdjacent && Date.now() >= nextWoodTry) {
          // Set the cooldown FIRST so an interrupted attempt can't retry-loop,
          // and hard-time-box the whole attempt so it never starves mining.
          nextWoodTry = Date.now() + 90000
          lastProgressAt = Date.now() // crafting is productive, not "stuck"
          try { await withTimeout(chopAndCraft(), 16000, 'craft budget') } catch (e) { log('craft attempt ended (' + e.message + ')') }
          try { bot.pathfinder.setGoal(null) } catch { /* ignore */ }
        }
      }
      // fall through → mine dirt with the shovel if we got one, else by hand
    }

    // 4) periodic tidy so junk never clogs the inventory
    if (blocksSinceTidy >= W.tidyEveryBlocks) await tidyInventory()

    // 5) MINE one dirt block in reach (smooth).
    onStatus(hasShovelInHand(bot) ? '⛏ mining dirt (shovel)' : '⛏ mining dirt (by hand)')
    const r = await mineOne(bot, dirtIds(), { maxDistance: M.horizontalRadius, digTimeoutMs: M.digTimeoutMs, isSafe, collectRadius: M.dropCollectRadius }, log)
    if (r === 'dug') {
      mined++; blocksSinceTidy++; onMine(mined)
      lastProgressAt = Date.now() // real progress → not stuck
      // Amortized drop sweep: every few blocks, vacuum up scattered drops in one
      // pass (cheaper than walking to each drop individually).
      if (mined % M.sweepEveryBlocks === 0) await collectNearbyDrops(bot, M.sweepRadius, 2500)
      await sleep(jitter(M.pauseBetweenBlocksMs + 100, 160)) // human reaction pause
    } else if (r === 'moved') {
      // Only ever RAISE the surface anchor while mining (descending is what got
      // the bot killed in caves). It's reset to the real ground only on teleport.
      surfaceY = Math.max(surfaceY, Math.floor(bot.entity.position.y))
      await sleep(jitter(100, 80))
    } else {
      onStatus('no dirt in reach, repositioning'); await sleep(jitter(700, 300))
    }
  }

  // Teleport to a fresh, untouched area so there's real dirt + trees nearby.
  // We stand still while the server runs its teleport warmup, then wait for the
  // big position jump + new chunks.
  async function teleportToFreshArea (initial = false) {
    if (!W.rtpCommand) return false
    if (initial && !W.rtpOnStart) return false
    onStatus('🌀 ' + W.rtpCommand)
    try { bot.pathfinder.setGoal(null) } catch { /* ignore */ }
    const before = bot.entity.position.clone()
    try { bot.chat(W.rtpCommand) } catch { /* ignore */ }
    const start = Date.now()
    while (running && Date.now() - start < W.rtpWaitMs) {
      await sleep(500)
      if (bot.entity.position.distanceTo(before) > 64) {
        onStatus('🌀 teleported to fresh terrain')
        await sleep(2500) // let the new chunks load
        lastProgressAt = Date.now()
        surfaceY = Math.floor(bot.entity.position.y)
        return true
      }
    }
    onStatus('teleport did not happen (cooldown?) — trying again shortly')
    return false
  }

  async function loop () {
    await sleep(2500) // let chunks load before scanning
    await teleportToFreshArea(true)
    lastProgressAt = Date.now()
    surfaceY = Math.floor(bot.entity.position.y)
    while (running) {
      try {
        // Watchdog: a single cycle may never hang the bot.
        await withTimeout(step(), 25000, 'cycle watchdog')
      } catch (e) {
        log('cycle reset (' + e.message + ')')
        try { bot.pathfinder.setGoal(null) } catch { /* ignore */ }
        await sleep(600)
      }
    }
  }

  loop().catch(e => log('brain stopped: ' + e.message))

  return {
    stop () {
      running = false
      try { bot.pathfinder?.setGoal(null) } catch { /* ignore */ }
    },
    get mined () { return mined }
  }
}

function withTimeout (promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label || 'timeout')), ms))
  ])
}

export default { startBrain }
