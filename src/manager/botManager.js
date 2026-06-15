// 📦 Ce fichier = "le chef d'orchestre".
//    Il lance PLUSIEURS comptes en même temps, leur donne un proxy si besoin,
//    sauvegarde les nouveaux jetons dans le coffre, et garde la liste de tous
//    les bots pour le tableau de bord.
//
//    (English: orchestrates many ManagedBots: proxy assignment, staggered
//     start, and saving rotated tokens back into the encrypted vault.)

import { EventEmitter } from 'node:events'
import { ManagedBot } from '../bot/createBot.js'

export class BotManager extends EventEmitter {
  /**
   * @param {object} vault - le coffre déjà ouvert
   * @param {object} config - la config globale
   * @param {object} paths - chemins (paths.tokenCache)
   */
  constructor (vault, config, paths) {
    super()
    this.vault = vault
    this.config = config
    this.paths = paths
    this.bots = new Map() // id -> ManagedBot
    this._saving = Promise.resolve()
  }

  // Décide quel proxy donne-t-on à un compte.
  _resolveProxy (account) {
    const p = this.config.proxy
    if (!p.enabled) return null
    if (p.mode === 'rotate' && p.list.length) {
      // On distribue la liste dans l'ordre des comptes.
      const index = [...this.bots.keys()].indexOf(account.id)
      return p.list[(index >= 0 ? index : 0) % p.list.length]
    }
    return account.proxy || null // mode 'per-account'
  }

  // Sauvegarde (en file d'attente) les nouveaux jetons d'un compte dans le coffre.
  _saveCredentials (account, creds) {
    this._saving = this._saving.then(async () => {
      const stored = this.vault.findAccount(account.id)
      if (!stored) return
      if (creds.refreshToken) stored.refreshToken = creds.refreshToken
      if (creds.mctoken) {
        stored.mctoken = creds.mctoken
        // On met à jour les infos lisibles (expiration) de façon cohérente.
        stored.tokenInfo = stored.tokenInfo || {}
        if (creds.obtainedOn) stored.tokenInfo.issuedAt = Math.floor(creds.obtainedOn / 1000)
        if (creds.expiresInSeconds) stored.tokenInfo.expiresInSeconds = creds.expiresInSeconds
      }
      stored.lastRefreshedAt = new Date().toISOString()
      await this.vault.save()
      this.emit('log', `🔄 jetons mis à jour et sauvegardés pour ${account.name}`)
    }).catch(err => this.emit('log', 'Erreur sauvegarde coffre: ' + err.message))
    return this._saving
  }

  // Crée (sans démarrer) un bot géré pour un compte.
  _make (account) {
    const bot = new ManagedBot(account, this.config, {
      tokenCacheDir: this.paths.tokenCache,
      resolveProxy: (a) => this._resolveProxy(a),
      onCredentials: (a, creds) => this._saveCredentials(a, creds)
    })
    // On relaie les événements vers l'extérieur (préfixés par le compte).
    const relay = (evt) => bot.on(evt, (...args) => this.emit('bot', { id: account.id, name: account.name, event: evt, args, bot }))
    ;['state', 'mined', 'status', 'log', 'needs-login', 'token-updated', 'warn'].forEach(relay)
    this.bots.set(account.id, bot)
    return bot
  }

  /**
   * Démarre tous les comptes activés, avec un petit décalage entre chacun.
   */
  async startAll () {
    const accounts = this.vault.getAccounts().filter(a => a.enabled !== false)
    if (!accounts.length) {
      this.emit('log', 'Aucun compte activé dans le coffre.')
      return
    }
    let i = 0
    for (const account of accounts) {
      const bot = this.bots.get(account.id) || this._make(account)
      setTimeout(() => bot.start(), i * this.config.behavior.startStaggerMs)
      i++
    }
    this.emit('log', `Démarrage de ${accounts.length} compte(s)…`)
  }

  startOne (idOrName) {
    const account = this.vault.findAccount(idOrName)
    if (!account) return false
    const bot = this.bots.get(account.id) || this._make(account)
    bot.start()
    return true
  }

  stopAll () {
    for (const bot of this.bots.values()) bot.stop()
  }

  /** Liste à plat pour le tableau de bord. */
  snapshot () {
    return [...this.bots.values()].map(b => ({
      name: b.account.name,
      state: b.state,
      mined: b.stats.mined,
      health: b.stats.health,
      position: b.stats.position,
      lastEvent: b.stats.lastEvent
    }))
  }

  // Efface tous les caches de jetons en clair (à la fermeture).
  wipeAll () { for (const bot of this.bots.values()) bot.wipeCache() }
}

export default BotManager
