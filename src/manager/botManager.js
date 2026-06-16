// 📦 botManager.js — the conductor.
//    Runs MANY accounts at once, each isolated, hands each one its proxy,
//    saves refreshed tokens back into the vault, records "done" reports,
//    and keeps the list of bots for the live dashboard.

import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { ManagedBot } from '../bot/createBot.js'

export class BotManager extends EventEmitter {
  /**
   * @param {object} vault - the already-opened vault
   * @param {object} config - global config
   * @param {object} paths - paths (paths.data, paths.tokenCache)
   */
  constructor (vault, config, paths) {
    super()
    this.vault = vault
    this.config = config
    this.paths = paths
    this.bots = new Map() // id -> ManagedBot
    this._saving = Promise.resolve()
  }

  // Which proxy does this account use?
  _resolveProxy (account) {
    const p = this.config.proxy
    if (!p.enabled) return null
    if (p.mode === 'rotate' && p.list.length) {
      const index = [...this.bots.keys()].indexOf(account.id)
      return p.list[(index >= 0 ? index : 0) % p.list.length]
    }
    return account.proxy || null // 'per-account' mode
  }

  // Queue a vault save of an account's refreshed tokens (so rotations persist).
  _saveCredentials (account, creds) {
    this._saving = this._saving.then(async () => {
      const stored = this.vault.findAccount(account.id)
      if (!stored) return
      if (creds.refreshToken) stored.refreshToken = creds.refreshToken
      if (creds.mctoken) {
        stored.mctoken = creds.mctoken
        stored.tokenInfo = stored.tokenInfo || {}
        if (creds.obtainedOn) stored.tokenInfo.issuedAt = Math.floor(creds.obtainedOn / 1000)
        if (creds.expiresInSeconds) stored.tokenInfo.expiresInSeconds = creds.expiresInSeconds
      }
      stored.lastRefreshedAt = new Date().toISOString()
      await this.vault.save()
      this.emit('log', `🔄 tokens refreshed & saved for ${account.name}`)
    }).catch(err => this.emit('log', 'vault save error: ' + err.message))
    return this._saving
  }

  // Write a "done" line to data/reports.log and announce it loudly.
  _onDone (account, report) {
    const line = `[${new Date().toISOString()}] DONE ${account.name}: ${report.dirt} dirt (${report.mined} blocks mined)`
    try {
      fs.mkdirSync(this.paths.data, { recursive: true })
      fs.appendFileSync(path.join(this.paths.data, 'reports.log'), line + '\n')
    } catch { /* ignore */ }
    this.emit('log', '✅ ' + line)
    this.emit('done', { account, report })
  }

  _make (account) {
    const bot = new ManagedBot(account, this.config, {
      tokenCacheDir: this.paths.tokenCache,
      resolveProxy: (a) => this._resolveProxy(a),
      onCredentials: (a, creds) => this._saveCredentials(a, creds)
    })
    const relay = (evt) => bot.on(evt, (...args) => this.emit('bot', { id: account.id, name: account.name, event: evt, args, bot }))
    ;['state', 'mined', 'status', 'log', 'needs-login', 'token-updated', 'warn', 'done'].forEach(relay)
    bot.on('done', (report) => this._onDone(account, report))
    this.bots.set(account.id, bot)
    return bot
  }

  /** Start every enabled account, staggered so they don't all connect at once. */
  async startAll () {
    const accounts = this.vault.getAccounts().filter(a => a.enabled !== false)
    if (!accounts.length) { this.emit('log', 'No enabled accounts in the vault.'); return }
    let i = 0
    for (const account of accounts) {
      const bot = this.bots.get(account.id) || this._make(account)
      setTimeout(() => bot.start(), i * this.config.behavior.startStaggerMs)
      i++
    }
    this.emit('log', `Starting ${accounts.length} account(s)…`)
  }

  startOne (idOrName) {
    const account = this.vault.findAccount(idOrName)
    if (!account) return false
    const bot = this.bots.get(account.id) || this._make(account)
    bot.start()
    return true
  }

  stopAll () { for (const bot of this.bots.values()) bot.stop() }

  /** Flat list for the dashboard. */
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

  wipeAll () { for (const bot of this.bots.values()) bot.wipeCache() }
}

export default BotManager
