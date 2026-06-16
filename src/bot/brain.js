// 📦 brain.js — the bot's decision loop (state machine).
//
//   The cycle, repeated forever until the inventory is full of dirt:
//
//     ┌─ enemy nearby? ─────────────► DEFEND (shield + attack), then resume
//     │
//     ├─ inventory full of dirt? ───► DONE (drop junk, disconnect, report)
//     │
//     ├─ no shovel in hand? ────────► RESTOCK
//     │        (mine wood → craft planks → sticks → table → max shovels →
//     │         move a shovel into the hand)
//     │
//     └─ otherwise ─────────────────► MINE one dirt block, keep only dirt
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

  // Per-bot movement settings (isolated to THIS bot).
  if (!bot.pathfinder) bot.loadPlugin(pathfinder)
  const movements = new Movements(bot)
  movements.canDig = true
  movements.scafoldingBlocks = [] // never place our hard-won dirt as scaffolding
  bot.pathfinder.setMovements(movements)

  const combat = new Combat(bot, config, log)
  const keep = makeKeepPredicate(config)

  const dirtIds = () => blockIdsForNames(bot, M.targetBlocks)
  const woodIds = () => blockIdsBySuffix(bot, ['_log'])
  const countLogs = () => bot.inventory.items().filter(i => i.name.endsWith('_log')).reduce((s, i) => s + i.count, 0)

  // Don't dig a block if it would drop us into a hole deeper than allowed.
  function isSafe (block) {
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

  // Gather wood and craft a fresh batch of shovels.
  async function restockShovels () {
    onStatus('out of shovels → restocking')

    // 1) make sure we have enough logs
    if (countLogs() < W.logsNeededPerBatch) {
      onStatus('mining wood')
      try { await bot.unequip('hand') } catch { /* punch with bare hand */ }
      let tries = 0
      while (running && countLogs() < W.logsNeededPerBatch) {
        if (combat.threatNear()) { await combat.engage(() => running); continue }
        const ok = await mineOne(bot, woodIds(), { maxDistance: W.woodSearchRadius, digTimeoutMs: M.digTimeoutMs }, log)
        if (!ok) {
          if (++tries >= 4) { onStatus('no wood found nearby'); return false }
          await sleep(1500)
        }
      }
    }

    // 2) craft as many shovels as the wood allows
    onStatus('crafting shovels')
    try {
      const made = await craftShovels(bot, W.shovelTier, W.shovelsPerBatch, log)
      onStatus(made > 0 ? `crafted ${made} shovel(s)` : 'crafting produced no shovel')
    } catch (e) {
      log('crafting failed: ' + e.message)
    }
    await collectNearbyDrops(bot, 4, 2000)

    // 3) move one into the hand
    return equipShovelToHand(bot, log)
  }

  async function loop () {
    while (running) {
      try {
        // 1) DEFEND first — survival beats mining.
        if (combat.threatNear()) {
          onStatus('⚔ defending')
          await combat.engage(() => running)
          continue
        }

        // 2) DONE — inventory is basically all dirt.
        if (isInventoryFull(bot, config)) {
          await tidyInventory() // make sure it's really dirt, not junk
          if (isInventoryFull(bot, config)) {
            const report = { mined, dirt: dirtCount(bot, config), name: bot.username }
            onStatus(`✅ DONE — ${report.dirt} dirt collected`)
            onDone(report)
            running = false
            break
          }
        }

        // 3) RESTOCK — need a shovel in hand.
        if (!hasShovelInHand(bot)) {
          if (!(await equipShovelToHand(bot, log))) {
            const ok = await restockShovels()
            if (!ok) { await sleep(2500); continue } // try again next cycle
          }
        }

        // 4) periodic tidy so junk never clogs the inventory
        if (blocksSinceTidy >= W.tidyEveryBlocks) await tidyInventory()

        // 5) MINE one dirt block
        onStatus('mining dirt')
        const ok = await mineOne(bot, dirtIds(), { maxDistance: M.horizontalRadius, digTimeoutMs: M.digTimeoutMs, isSafe }, log)
        if (ok) { mined++; blocksSinceTidy++; onMine(mined) } else { onStatus('no dirt in reach, waiting'); await sleep(2000) }

        if (M.pauseBetweenBlocksMs > 0) await sleep(M.pauseBetweenBlocksMs)
      } catch (e) {
        log('brain error: ' + e.message)
        await sleep(1500)
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

export default { startBrain }
