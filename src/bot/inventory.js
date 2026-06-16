// 📦 inventory.js — REAL inventory management.
//
//    Everything here acts on `bot.inventory`, which is the LIVE inventory synced
//    with the server (not a fake guess). Moving/dropping items uses real window
//    packets (bot.equip / bot.toss), so we are "really" opening and touching the
//    inventory, exactly like a player would.
//
//    Responsibilities:
//      - find/equip a shovel into the hand (hotbar)
//      - decide what to keep (dirt + tools + crafting materials + combat gear)
//      - throw away the junk
//      - tell the brain when the inventory is "full of dirt"

// --- name helpers -----------------------------------------------------------

const endsWithAny = (name, suffixes) => suffixes.some(s => name.endsWith(s))

export function isShovel (item) { return item?.name?.endsWith('_shovel') }
export function isSword (item) { return item?.name?.endsWith('_sword') }
export function isShield (item) { return item?.name === 'shield' }

// Items we always keep so the bot can keep functioning.
function isCraftMaterial (name) {
  return name.endsWith('_log') || name.endsWith('_wood') ||
         name.endsWith('_planks') || name === 'stick' || name === 'crafting_table'
}
function isCombatGear (name) {
  return name.endsWith('_sword') || name === 'shield' ||
         endsWithAny(name, ['_helmet', '_chestplate', '_leggings', '_boots'])
}

/**
 * Build the predicate that decides "do we KEEP this item?".
 * Keep = dirt (the loot) + shovels + crafting materials + combat gear + food.
 * Everything else (cobblestone, gravel, flint, seeds, …) is junk -> tossed.
 */
export function makeKeepPredicate (config) {
  const dirt = new Set(config.work.keepDirtItems)
  const food = new Set(config.work.keepFood || [])
  return (item) => {
    const n = item.name
    return dirt.has(n) || isShovel(item) || n.endsWith('_axe') ||
           isCraftMaterial(n) || isCombatGear(n) || food.has(n)
  }
}

// --- queries ----------------------------------------------------------------

export function allItems (bot) { return bot.inventory.items() }

export function findBestShovel (bot) {
  // Prefer the shovel with the most remaining durability.
  const shovels = bot.inventory.items().filter(isShovel)
  if (!shovels.length) return null
  shovels.sort((a, b) => remainingDurability(b) - remainingDurability(a))
  return shovels[0]
}

function remainingDurability (item) {
  // maxDurability - damage. If unknown, assume "fresh".
  const max = item.maxDurability ?? 1000
  const used = item.durabilityUsed ?? (item.nbt ? 0 : 0)
  return max - used
}

export function hasShovelInHand (bot) {
  return isShovel(bot.heldItem)
}

export function dirtCount (bot, config) {
  const dirt = new Set(config.work.keepDirtItems)
  return bot.inventory.items()
    .filter(i => dirt.has(i.name))
    .reduce((sum, i) => sum + i.count, 0)
}

/**
 * Is the inventory "full of dirt"?  True when there are no (or very few) free
 * slots left AFTER junk has been tossed — i.e. the storage is basically all dirt.
 */
export function isInventoryFull (bot, config) {
  return bot.inventory.emptySlotCount() <= config.work.fullWhenFreeSlotsAtMost
}

// --- actions (real packets) -------------------------------------------------

/**
 * Make sure a shovel is in the hand. Returns true if we now hold a shovel.
 * This is the "open the inventory and move a shovel to the hotbar" step.
 */
export async function equipShovelToHand (bot, log = () => {}) {
  if (hasShovelInHand(bot)) return true
  const shovel = findBestShovel(bot)
  if (!shovel) return false
  log('checking inventory → moving a shovel into hand')
  try {
    await bot.equip(shovel, 'hand') // real inventory click
    return hasShovelInHand(bot)
  } catch (e) {
    log('could not equip shovel: ' + e.message)
    return false
  }
}

/**
 * Throw away every item that the keep-predicate rejects.
 * @returns {number} how many stacks were tossed
 */
export async function tossJunk (bot, keep, log = () => {}) {
  let tossed = 0
  for (const item of bot.inventory.items()) {
    if (keep(item)) continue
    try {
      await bot.toss(item.type, null, item.count) // real "drop" packet
      tossed++
      log(`dropped junk: ${item.count}x ${item.name}`)
    } catch (e) {
      log('could not drop ' + item.name + ': ' + e.message)
    }
  }
  return tossed
}

export default {
  isShovel, isSword, isShield, makeKeepPredicate, allItems, findBestShovel,
  hasShovelInHand, dirtCount, isInventoryFull, equipShovelToHand, tossJunk
}
