// 📦 combat.js — self-defense.
//    Detects hostile mobs (skeletons, zombies, …), raises a SHIELD if the bot
//    owns one, hits melee targets, and backs away from creepers.
//    Uses real APIs: bot.attack(), bot.activateItem(true) (offhand shield),
//    bot.deactivateItem(), and pathfinder GoalFollow to close the distance.

import pathfinderPkg from 'mineflayer-pathfinder'
const { goals } = pathfinderPkg
const { GoalFollow, GoalNear, GoalInvert } = goals

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

export class Combat {
  constructor (bot, config, log = () => {}) {
    this.bot = bot
    this.cfg = config.combat
    this.log = log
    this.hostiles = new Set(this.cfg.hostileTypes.map(s => s.toLowerCase()))
    this.shieldUp = false
  }

  // Is this entity something we should fight?
  _isHostile (e) {
    if (!e || e === this.bot.entity || !e.position) return false
    if (e.type === 'hostile') return true
    if (e.kind === 'Hostile mobs') return true
    const n = (e.name || e.mobType || '').toLowerCase()
    return this.hostiles.has(n)
  }

  _nearest (range) {
    let best = null; let bestD = Infinity
    for (const e of Object.values(this.bot.entities)) {
      if (!this._isHostile(e)) continue
      const d = e.position.distanceTo(this.bot.entity.position)
      if (d < range && d < bestD) { best = e; bestD = d }
    }
    return best
  }

  /** Quick check the brain calls between work actions. */
  threatNear () {
    return this.cfg.enabled && !!this._nearest(this.cfg.engageRange)
  }

  async _equipDefenses () {
    // Shield → off-hand (if we own one).
    if (this.cfg.useShield) {
      const shield = this.bot.inventory.items().find(i => i.name === 'shield')
      const offhand = this.bot.inventory.slots[45] // 45 = off-hand slot
      if (shield && (!offhand || offhand.name !== 'shield')) {
        try { await this.bot.equip(shield, 'off-hand'); this.log('equipped shield') } catch { /* ignore */ }
      }
    }
    // Prefer a sword in hand if we have one.
    const sword = this.bot.inventory.items().find(i => i.name.endsWith('_sword'))
    if (sword && this.bot.heldItem?.name !== sword.name) {
      try { await this.bot.equip(sword, 'hand') } catch { /* ignore */ }
    }
  }

  _raiseShield () {
    if (this.cfg.useShield && !this.shieldUp) {
      try { this.bot.activateItem(true); this.shieldUp = true } catch { /* ignore */ }
    }
  }

  _lowerShield () {
    if (this.shieldUp) {
      try { this.bot.deactivateItem(); this.shieldUp = false } catch { /* ignore */ }
    }
  }

  /**
   * Fight until no hostile is within engage range (or we're told to stop).
   * @param {function} shouldContinue - return false to bail out early
   */
  async engage (shouldContinue = () => true) {
    if (!this.cfg.enabled) return
    await this._equipDefenses()

    while (shouldContinue() && this.threatNear()) {
      const target = this._nearest(this.cfg.engageRange)
      if (!target) break

      const dist = target.position.distanceTo(this.bot.entity.position)
      const name = (target.name || target.mobType || '').toLowerCase()

      // Creepers: do NOT melee — back away so they don't explode on us.
      if (name === 'creeper' && dist < 5) {
        this._lowerShield()
        try {
          this.bot.pathfinder.setGoal(new GoalInvert(new GoalFollow(target, 6)), true)
        } catch { /* ignore */ }
        await sleep(400)
        continue
      }

      await this.bot.lookAt(target.position.offset(0, 1.4, 0), true)

      if (dist <= this.cfg.attackRange) {
        this._lowerShield() // can't hit with shield raised
        try { this.bot.attack(target) } catch { /* ignore */ }
        await sleep(this.cfg.attackCooldownMs)
        this._raiseShield() // block again between swings (vs skeleton arrows)
      } else {
        this._raiseShield() // advance behind the shield
        try { this.bot.pathfinder.setGoal(new GoalFollow(target, this.cfg.attackRange - 1), true) } catch { /* ignore */ }
        await sleep(300)
      }
    }

    this._lowerShield()
    try { this.bot.pathfinder.setGoal(null) } catch { /* ignore */ }
  }
}

export default { Combat }
