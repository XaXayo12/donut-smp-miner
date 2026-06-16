// 📦 crafting.js — turn wood into shovels, for real.
//
//    Chain:  logs --> planks --> sticks --> (crafting table) --> shovels
//
//    All crafting uses bot.craft(), which really opens the 2x2 grid or the
//    crafting table window and performs the clicks. We compute how many we can
//    craft from `recipe.delta` (negative entries = ingredients consumed).

import pathfinderPkg from 'mineflayer-pathfinder'
const { goals } = pathfinderPkg
const { GoalNear, GoalPlaceBlock } = goals
import { Vec3 } from 'vec3'

const FACES = [
  new Vec3(0, 1, 0), new Vec3(0, -1, 0),
  new Vec3(1, 0, 0), new Vec3(-1, 0, 0),
  new Vec3(0, 0, 1), new Vec3(0, 0, -1)
]

function itemId (bot, name) { return bot.registry.itemsByName[name]?.id }
function blockId (bot, name) { return bot.registry.blocksByName[name]?.id }
function countOf (bot, name) {
  const id = itemId(bot, name)
  return id == null ? 0 : bot.inventory.count(id, null)
}

// How many times can we run this recipe with the items we currently hold?
function maxCraftable (bot, recipe) {
  const consumed = recipe.delta.filter(d => d.count < 0)
  if (!consumed.length) return 0
  let max = Infinity
  for (const c of consumed) {
    const have = bot.inventory.count(c.id, null)
    max = Math.min(max, Math.floor(have / -c.count))
  }
  return Number.isFinite(max) ? max : 0
}

// Try to craft `wanted` of an item type; returns how many crafts actually ran.
async function craftItemType (bot, itemType, wanted, table, log) {
  const recipes = bot.recipesFor(itemType, null, 1, table ?? null)
  if (!recipes.length) return 0
  const recipe = recipes[0]
  const can = maxCraftable(bot, recipe)
  const times = Math.max(0, Math.min(wanted, can))
  if (times <= 0) return 0
  await bot.craft(recipe, times, table || undefined)
  log?.(`crafted ${times}x ${bot.registry.items[itemType]?.name}`)
  return times
}

// --- planks -----------------------------------------------------------------

function plankItemTypes (bot) {
  return bot.registry.itemsArray.filter(i => i.name.endsWith('_planks')).map(i => i.id)
}

/** Convert logs into planks until we have at least `min` planks. */
export async function ensurePlanks (bot, min, log) {
  let have = bot.inventory.items().filter(i => i.name.endsWith('_planks')).reduce((s, i) => s + i.count, 0)
  if (have >= min) return have
  for (const id of plankItemTypes(bot)) {
    if (have >= min) break
    // each craft yields 4 planks → number of crafts needed
    const need = Math.ceil((min - have) / 4)
    const made = await craftItemType(bot, id, need, null, log)
    have += made * 4
  }
  return have
}

// --- sticks -----------------------------------------------------------------

/** Make sticks until we have at least `min`. (2 planks -> 4 sticks) */
export async function ensureSticks (bot, min, log) {
  const stickId = itemId(bot, 'stick')
  let have = countOf(bot, 'stick')
  if (have >= min) return have
  await ensurePlanks(bot, Math.ceil((min - have) / 4) * 2, log)
  const need = Math.ceil((min - have) / 4)
  const made = await craftItemType(bot, stickId, need, null, log)
  return have + made * 4
}

// --- crafting table ---------------------------------------------------------

/** Make sure we own a crafting_table item (craft from 4 planks if needed). */
export async function ensureCraftingTableItem (bot, log) {
  if (countOf(bot, 'crafting_table') > 0) return true
  await ensurePlanks(bot, 4, log)
  const made = await craftItemType(bot, itemId(bot, 'crafting_table'), 1, null, log)
  return made > 0
}

/**
 * Return a usable crafting table BLOCK to craft on:
 *  - reuse one nearby if present, else
 *  - place our own and return it.
 */
export async function getOrPlaceCraftingTable (bot, log) {
  const id = blockId(bot, 'crafting_table')
  // 1) already one within reach?
  const near = bot.findBlock({ matching: id, maxDistance: 4 })
  if (near) return near

  // 2) place our own
  if (!(await ensureCraftingTableItem(bot, log))) return null
  const tableItem = bot.inventory.items().find(i => i.name === 'crafting_table')
  await bot.equip(tableItem, 'hand')

  // Find a solid block with empty space above to place the table on top of it.
  const base = bot.entity.position.floored()
  const candidates = [
    base.offset(1, -1, 0), base.offset(-1, -1, 0),
    base.offset(0, -1, 1), base.offset(0, -1, -1),
    base.offset(0, -1, 0)
  ]
  for (const pos of candidates) {
    const ref = bot.blockAt(pos)
    const above = bot.blockAt(pos.offset(0, 1, 0))
    if (ref && ref.boundingBox === 'block' && above && above.boundingBox === 'empty') {
      try {
        await bot.lookAt(pos.offset(0.5, 1, 0.5), true)
        await bot.placeBlock(ref, new Vec3(0, 1, 0))
        const placed = bot.blockAt(pos.offset(0, 1, 0))
        if (placed && placed.name === 'crafting_table') {
          log?.('placed a crafting table')
          return placed
        }
      } catch { /* try next spot */ }
    }
  }
  log?.('could not place a crafting table nearby')
  return null
}

// --- shovels ----------------------------------------------------------------

/**
 * Craft as many shovels as possible, up to `maxCount`.
 * Ensures planks + sticks + a table first. Returns shovels crafted.
 * (Wooden shovel = 1 plank on top + 2 sticks below → needs a table.)
 */
export async function craftShovels (bot, tier, maxCount, log) {
  const shovelName = `${tier}_shovel`
  const shovelType = itemId(bot, shovelName)
  if (shovelType == null) { log?.(`unknown shovel type: ${shovelName}`); return 0 }

  // Need, per shovel: 1 plank + 2 sticks. Prepare a batch.
  await ensurePlanks(bot, maxCount + 4, log)     // +4 spare for table/sticks
  await ensureSticks(bot, maxCount * 2, log)

  const table = await getOrPlaceCraftingTable(bot, log)
  if (!table) return 0

  // Walk close to the table so the window opens reliably.
  try { await bot.pathfinder.goto(new GoalNear(table.position.x, table.position.y, table.position.z, 2)) } catch { /* ignore */ }

  const made = await craftItemType(bot, shovelType, maxCount, table, log)
  return made
}

export default { ensurePlanks, ensureSticks, ensureCraftingTableItem, getOrPlaceCraftingTable, craftShovels }
