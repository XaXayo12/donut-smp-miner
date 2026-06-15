// 📦 Ce fichier = "le mineur".
//    C'est le cerveau qui fait creuser la terre au bot:
//      1) trouve les blocs de terre autour de lui
//      2) marche jusqu'au bloc (avec pathfinder)
//      3) prend une pelle si possible, puis casse le bloc
//      4) recommence
//    Avec des sécurités: pas de trou trop profond, abandon si un bloc bloque.
//
//    (English: dirt-mining loop using mineflayer-pathfinder. Safe + stoppable.)

import pathfinderPkg from 'mineflayer-pathfinder'
const { pathfinder, Movements, goals } = pathfinderPkg
const { GoalNear } = goals

/**
 * Lance le minage sur un bot déjà connecté.
 * @param {object} bot - le bot mineflayer
 * @param {object} config - la config (config.mining)
 * @param {object} hooks - { onMine(count), onStatus(text), log(msg) }
 * @returns {{ stop: function }} un contrôleur pour arrêter
 */
export function startMining (bot, config, hooks = {}) {
  const M = config.mining
  let running = true
  let mined = 0
  const recentlyFailed = new Map() // "x,y,z" -> timestamp (blocs à éviter un moment)

  const onMine = hooks.onMine || (() => {})
  const onStatus = hooks.onStatus || (() => {})
  const log = hooks.log || (() => {})

  // Prépare pathfinder une seule fois.
  if (!bot.pathfinder) bot.loadPlugin(pathfinder)
  const movements = new Movements(bot)
  movements.canDig = true
  bot.pathfinder.setMovements(movements)

  // Liste des IDs de blocs "terre" (selon la version réelle du serveur).
  function targetIds () {
    return M.targetBlocks
      .map(name => bot.registry.blocksByName[name]?.id)
      .filter(id => id != null)
  }

  // Équipe une pelle si le bot en a une (sinon il creuse à la main, plus lent).
  async function equipShovel () {
    const shovel = bot.inventory.items().find(i => i.name.endsWith('_shovel'))
    if (shovel && (!bot.heldItem || bot.heldItem.type !== shovel.type)) {
      try { await bot.equip(shovel, 'hand') } catch { /* pas grave */ }
    }
  }

  // Est-ce dangereux de casser ce bloc ? (trou trop profond sous le bot)
  function isSafe (block) {
    if (!M.reachOnly) return true
    // On regarde combien d'air il y a sous le bloc visé.
    let depth = 0
    let p = block.position.offset(0, -1, 0)
    while (depth <= M.maxFallDistance) {
      const b = bot.blockAt(p)
      if (!b || b.boundingBox === 'empty') { depth++; p = p.offset(0, -1, 0) } else break
    }
    return depth <= M.maxFallDistance
  }

  function key (pos) { return `${pos.x},${pos.y},${pos.z}` }

  async function findNext () {
    const ids = targetIds()
    if (ids.length === 0) return null
    const positions = bot.findBlocks({
      matching: ids,
      maxDistance: M.horizontalRadius,
      count: 80
    })
    const now = Date.now()
    for (const pos of positions) {
      const k = `${pos.x},${pos.y},${pos.z}`
      const failedAt = recentlyFailed.get(k)
      if (failedAt && now - failedAt < 30000) continue // évité pendant 30s
      const block = bot.blockAt(pos)
      if (block && isSafe(block)) return block
    }
    return null
  }

  async function loop () {
    while (running) {
      let block
      try {
        block = await findNext()
      } catch (e) {
        log('Erreur recherche de bloc: ' + e.message)
      }

      if (!block) {
        onStatus('aucune terre à portée, j\'attends…')
        await sleep(2000)
        continue
      }

      onStatus(`je vais miner en ${block.position.x} ${block.position.y} ${block.position.z}`)
      try {
        // 1) marcher jusqu'à être à portée (GoalNear = "approche à 1 bloc")
        await withTimeout(
          bot.pathfinder.goto(new GoalNear(block.position.x, block.position.y, block.position.z, 1)),
          M.digTimeoutMs,
          'trajet trop long'
        )
        if (!running) break

        // 2) pelle + creuser
        await equipShovel()
        const fresh = bot.blockAt(block.position)
        if (!fresh || fresh.boundingBox === 'empty') continue // déjà cassé
        await withTimeout(bot.dig(fresh), M.digTimeoutMs, 'minage trop long')

        mined++
        onMine(mined)
      } catch (e) {
        // Ce bloc pose problème: on l'évite un moment et on continue.
        recentlyFailed.set(key(block.position), Date.now())
        log('Bloc ignoré (' + e.message + ')')
      }

      if (M.pauseBetweenBlocksMs > 0) await sleep(M.pauseBetweenBlocksMs)
    }
  }

  loop().catch(e => log('Boucle de minage arrêtée: ' + e.message))

  return {
    stop () {
      running = false
      try { bot.pathfinder?.setGoal(null) } catch { /* ignore */ }
    },
    get mined () { return mined }
  }
}

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

// Limite le temps d'une promesse, pour ne jamais rester bloqué.
function withTimeout (promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label || 'timeout')), ms))
  ])
}

export default { startMining }
