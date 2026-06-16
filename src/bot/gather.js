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

/**
 * Robust pathfinder.goto: resolves on arrival, rejects on timeout/no-path, and
 * ALWAYS cancels the underlying goal so the next path can't collide with a
 * still-running one (the cause of "goal was changed" spam). Late rejections from
 * the cancelled goal are swallowed.
 */
export function safeGoto (bot, goal, ms = 10000) {
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (ok, err) => {
      if (done) return
      done = true
      ok ? resolve('moved') : reject(err)
    }
    const p = bot.pathfinder.goto(goal)
    p.then(() => finish(true), (e) => finish(false, e)) // handles late rejection
    setTimeout(() => {
      if (done) return
      try { bot.pathfinder.setGoal(null) } catch { /* ignore */ }
      finish(false, new Error('timeout'))
    }, ms)
  })
}

// Is this entity a dropped item lying on the ground?
// (Avoid the deprecated entity.objectType getter — it spams warnings.)
function isItemDrop (bot, e) {
  if (!e || !e.position) return false
  return e.name === 'item' ||
    e.displayName === 'Item' ||
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
 * Mine ONE block matching `ids`.
 * Strategy learned from live testing:
 *   1. If a target block is already in reach → dig it directly (NO pathfinding).
 *      This is fast and avoids the pathfinder timing out on dig-paths.
 *   2. Otherwise WALK toward the nearest target (cheap path, no digging) so the
 *      next call can dig it in reach.
 * @returns {'dug'|'moved'|'none'}
 */
export async function mineOne (bot, ids, { maxDistance = 24, digTimeoutMs = 12000, isSafe } = {}, log = () => {}) {
  const safe = (b) => !isSafe || isSafe(b)

  // Phase 1 — dig the NEAREST block we can reach (close, so the drop lands at
  // our feet and gets auto-picked-up instead of left behind).
  const inReach = bot.findBlock({
    matching: ids,
    maxDistance: 3,
    useExtraInfo: (b) => safe(b) && bot.canDigBlock(b)
  })
  if (inReach) {
    try {
      // Smooth, human-like aim at a slightly randomized point on the block,
      // let the head settle, then dig (the dig's look is a tiny final correction).
      const r = () => (Math.random() - 0.5) * 0.5
      await bot.lookAt(inReach.position.offset(0.5 + r(), 0.5 + r(), 0.5 + r()), false)
      await sleep(120)
      await withTimeout(bot.dig(inReach, true), digTimeoutMs, 'dig')
      await collectNearbyDrops(bot, 5, 2500)
      return 'dug'
    } catch (e) {
      log('dig (in reach) failed: ' + e.message)
    }
  }

  // Phase 2 — walk toward the nearest target so we can dig it next time.
  const near = bot.findBlock({ matching: ids, maxDistance, useExtraInfo: (b) => safe(b) })
  if (!near) return 'none'
  try {
    await safeGoto(bot, new GoalNear(near.position.x, near.position.y, near.position.z, 2), digTimeoutMs)
    return 'moved'
  } catch {
    return 'none'
  }
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
      const r = await mineOne(bot, ids, { maxDistance, digTimeoutMs, isSafe }, log)
      onProgress(countItems())
      if (r === 'none') {
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
