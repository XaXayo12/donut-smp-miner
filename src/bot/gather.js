// 📦 gather.js — find a block, walk to it, dig it, pick up the drop.
//    Generic: used both for wood (logs) and for dirt.

import pathfinderPkg from 'mineflayer-pathfinder'
const { goals } = pathfinderPkg
const { GoalNear } = goals

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

function withTimeout (promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label || 'timeout')), ms))
  ])
}

// Is this entity a dropped item lying on the ground?
function isItemDrop (bot, e) {
  if (!e || !e.position) return false
  return e.name === 'item' || e.objectType === 'Item' ||
    e.entityType === bot.registry.entitiesByName?.item?.id
}

/** Walk onto nearby dropped items so physics picks them up. */
export async function collectNearbyDrops (bot, radius = 6, maxMs = 6000) {
  const start = Date.now()
  for (;;) {
    if (Date.now() - start > maxMs) return
    const drop = Object.values(bot.entities)
      .filter(e => isItemDrop(bot, e))
      .map(e => ({ e, d: e.position.distanceTo(bot.entity.position) }))
      .filter(x => x.d < radius)
      .sort((a, b) => a.d - b.d)[0]
    if (!drop) return
    if (drop.d < 1.2) { await sleep(250); continue } // close enough, let pickup happen
    try {
      await withTimeout(
        bot.pathfinder.goto(new GoalNear(drop.e.position.x, drop.e.position.y, drop.e.position.z, 0)),
        3000, 'reach drop'
      )
    } catch { return }
  }
}

/** Convert a list of block names into the ids that exist on this server/version. */
export function blockIdsForNames (bot, names) {
  return names.map(n => bot.registry.blocksByName[n]?.id).filter(id => id != null)
}

/** All ids whose block name ends with one of the given suffixes (version-proof). */
export function blockIdsBySuffix (bot, suffixes) {
  return bot.registry.blocksArray
    .filter(b => suffixes.some(s => b.name.endsWith(s)))
    .map(b => b.id)
}

/**
 * Mine ONE block matching `ids`, then collect its drop.
 * @returns {boolean} true if a block was mined
 */
export async function mineOne (bot, ids, { maxDistance = 24, digTimeoutMs = 12000, isSafe } = {}, log = () => {}) {
  const positions = bot.findBlocks({ matching: ids, maxDistance, count: 40 })
  for (const pos of positions) {
    const block = bot.blockAt(pos)
    if (!block) continue
    if (isSafe && !isSafe(block)) continue
    try {
      await withTimeout(
        bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 1)),
        digTimeoutMs, 'travel'
      )
      const fresh = bot.blockAt(pos)
      if (!fresh || fresh.boundingBox === 'empty') continue
      await withTimeout(bot.dig(fresh), digTimeoutMs, 'dig')
      await collectNearbyDrops(bot, 6, 4000)
      return true
    } catch (e) {
      log('skip block (' + e.message + ')')
    }
  }
  return false
}

/**
 * Keep mining matching blocks until we have `count` of them collected (or no
 * more are reachable). `countItems` returns how many we currently have.
 */
export async function gatherUntil (bot, ids, { count, maxDistance, digTimeoutMs, isSafe, countItems }, hooks = {}) {
  const log = hooks.log || (() => {})
  const onProgress = hooks.onProgress || (() => {})
  let stuck = 0
  while (countItems() < count) {
    if (!hooks.shouldContinue || hooks.shouldContinue()) {
      const ok = await mineOne(bot, ids, { maxDistance, digTimeoutMs, isSafe }, log)
      onProgress(countItems())
      if (!ok) {
        stuck++
        if (stuck >= 3) { log('nothing reachable to gather'); return false }
        await sleep(1500)
      } else {
        stuck = 0
      }
    } else {
      return false
    }
  }
  return true
}

export default { collectNearbyDrops, blockIdsForNames, blockIdsBySuffix, mineOne, gatherUntil }
