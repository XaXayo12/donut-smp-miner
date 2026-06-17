// 📦 gather.js — find blocks, dig them in a smart order, pick up the drops.
//    Used both for wood (logs) and for dirt.
//
//    Mining strategy (tuned from live testing on DonutSMP):
//      • Dig blocks that are ALREADY ADJACENT to the bot, nearest-first, in a
//        deterministic order. Because the block is right next to us, its drop
//        lands at our feet and is auto-collected (~100%), instead of being left
//        behind several blocks away.
//      • Only when nothing is adjacent do we WALK to the nearest target.
//      • Drop pickup only grabs CLOSE items — we never wander off to chase a far
//        drop (that wastes time and breaks the mining pattern).

import pathfinderPkg from 'mineflayer-pathfinder'
const { goals } = pathfinderPkg
const { GoalNear } = goals

const REACH = 3.2 // a block is "adjacent/in reach" within this many blocks

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

// --- block id helpers -------------------------------------------------------

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

// --- drop collection (close only) -------------------------------------------

// Is this entity a dropped item lying on the ground?
// (Avoid the deprecated entity.objectType getter — it spams warnings.)
function isItemDrop (bot, e) {
  if (!e || !e.position) return false
  return e.name === 'item' ||
    e.displayName === 'Item' ||
    e.entityType === bot.registry.entitiesByName?.item?.id
}

function nearestDrop (bot, maxDist) {
  const me = bot.entity.position
  let best = null
  for (const e of Object.values(bot.entities)) {
    if (!isItemDrop(bot, e)) continue
    const d = e.position.distanceTo(me)
    if (d <= maxDist && (!best || d < best.d)) best = { e, d }
  }
  return best
}

/**
 * Pick up the nearest CLOSE drop (and only that). If the closest drop is already
 * within pickup range we just wait a beat; otherwise we step onto it. We never
 * chase drops farther than `maxDist`.
 */
export async function collectClose (bot, maxDist = 2.5) {
  const drop = nearestDrop(bot, maxDist)
  if (!drop) return
  if (drop.d <= 1.3) { await sleep(180); return } // physics will pick it up
  try {
    await safeGoto(bot, new GoalNear(drop.e.position.x, drop.e.position.y, drop.e.position.z, 0), 1800)
  } catch { /* not worth it */ }
}

/**
 * Walk onto nearby dropped items so physics picks them up. Used after crafting /
 * tree-felling where several drops may scatter. (Bounded in time.)
 */
export async function collectNearbyDrops (bot, radius = 5, maxMs = 4000) {
  const start = Date.now()
  for (;;) {
    if (Date.now() - start > maxMs) return
    const drop = nearestDrop(bot, radius)
    if (!drop) return
    if (drop.d < 1.3) { await sleep(220); continue }
    try {
      await safeGoto(bot, new GoalNear(drop.e.position.x, drop.e.position.y, drop.e.position.z, 0), 2500)
    } catch { return }
  }
}

// --- digging ----------------------------------------------------------------

/**
 * Find the nearest target block that's already within reach, scanning a small
 * box around the bot in a fixed order (deterministic, tidy pattern).
 */
function findAdjacentTarget (bot, idSet, isSafe) {
  const eye = bot.entity.position
  const feet = eye.floored()
  let best = null
  // Deterministic scan order: feet level & one above first, then one below.
  for (const dy of [0, 1, -1]) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const pos = feet.offset(dx, dy, dz)
        const b = bot.blockAt(pos)
        if (!b || !idSet.has(b.type)) continue
        if (isSafe && !isSafe(b)) continue
        if (!bot.canDigBlock(b)) continue
        const d = pos.offset(0.5, 0.5, 0.5).distanceTo(eye)
        if (d > REACH) continue
        if (!best || d < best.d) best = { block: b, d }
      }
    }
  }
  return best?.block || null
}

// Smooth, human-like aim then dig (the dig's look is a tiny final correction).
async function faceAndDig (bot, block, digTimeoutMs) {
  const r = () => (Math.random() - 0.5) * 0.4
  await bot.lookAt(block.position.offset(0.5 + r(), 0.5 + r(), 0.5 + r()), false)
  await sleep(90)
  await withTimeout(bot.dig(block, true), digTimeoutMs, 'dig')
}

/**
 * Mine ONE block matching `ids`.
 * @returns {'dug'|'moved'|'none'}
 */
export async function mineOne (bot, ids, { maxDistance = 24, digTimeoutMs = 12000, isSafe, collectRadius = 2.5 } = {}, log = () => {}) {
  const idSet = ids instanceof Set ? ids : new Set(ids)

  // Phase 1 — dig an adjacent target. Because we keep our own floor (never dig
  // straight down) the bot stays level and naturally strafes over the drops,
  // so a quick close-range pickup is enough (no slow per-block walking).
  const adj = findAdjacentTarget(bot, idSet, isSafe)
  if (adj) {
    try {
      await faceAndDig(bot, adj, digTimeoutMs)
      // HONEST CHECK: confirm the block ACTUALLY broke. Under server rubber-band
      // the dig can "resolve" without removing the block — don't count those.
      const after = bot.blockAt(adj.position)
      if (after && idSet.has(after.type)) { log('dig did not break the block (rubber-band?)'); return 'none' }
      await collectClose(bot, collectRadius)
      return 'dug'
    } catch (e) {
      log('dig failed (' + e.message + ')')
    }
  }

  // Phase 2 — nothing adjacent: walk to the nearest target to get next to it.
  const near = bot.findBlock({ matching: ids, maxDistance, useExtraInfo: (b) => !isSafe || isSafe(b) })
  if (!near) return 'none'
  try {
    await safeGoto(bot, new GoalNear(near.position.x, near.position.y, near.position.z, 1), digTimeoutMs)
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
    if (hooks.shouldContinue && !hooks.shouldContinue()) return false
    const r = await mineOne(bot, ids, { maxDistance, digTimeoutMs, isSafe }, log)
    onProgress(countItems())
    if (r === 'none') {
      if (++stuck >= 3) { log('nothing reachable to gather'); return false }
      await sleep(1200)
    } else {
      stuck = 0
    }
  }
  return true
}

export default { safeGoto, collectClose, collectNearbyDrops, blockIdsForNames, blockIdsBySuffix, mineOne, gatherUntil }
