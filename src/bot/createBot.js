// 📦 createBot.js — one fully-managed bot for ONE account.
//    Bundles: token login + auto token-refresh, proxy, the fork's physics
//    plugin, the decision brain (brain.js), self-defense, and auto-reconnect.
//    Emits events so the dashboard can show live state.
//
//    Isolation: every account gets its own ManagedBot, its own token-cache
//    folder, its own proxy and its own brain. Nothing mutable is shared.

import { EventEmitter } from 'node:events'
import path from 'node:path'
import mineflayer from 'mineflayer'
import physicsUtil from '@nxg-org/mineflayer-physics-util' // default export = loader(bot): the fork's physics plugin
import { startBrain } from './brain.js'
import { makeConnect, parseProxy } from '../proxy/proxy.js'
import { seedAuthCache, readBackRefreshToken, readBackMcToken, wipeAuthCache } from '../auth/seedCache.js'

const AUTH_TITLE = '00000000402b5328' // Titles.MinecraftJava — matches the token "aid" field

export class ManagedBot extends EventEmitter {
  /**
   * @param {object} account - one account from the vault
   * @param {object} config - global config
   * @param {object} deps - { tokenCacheDir, resolveProxy(account), onCredentials(account, creds) }
   */
  constructor (account, config, deps = {}) {
    super()
    this.account = account
    this.config = config
    this.tokenCacheDir = path.join(deps.tokenCacheDir, sanitize(account.id || account.name))
    this.resolveProxy = deps.resolveProxy || (() => account.proxy || null)
    this.onCredentials = deps.onCredentials || (() => {})

    this.bot = null
    this.brain = null
    this.shouldRun = false
    this.reconnects = 0

    this.state = 'idle' // idle | connecting | online | mining | reconnecting | needs-login | done | stopped | error
    this.stats = { mined: 0, lastEvent: '', position: null, health: null }
  }

  setState (state, note) {
    this.state = state
    if (note) this.stats.lastEvent = note
    this.emit('state', this.state, note)
  }

  start () {
    this.shouldRun = true
    this.reconnects = 0
    this._connect()
  }

  stop () {
    this.shouldRun = false
    this._cleanup()
    try { this.bot?.quit('stop requested') } catch { /* ignore */ }
    this.setState('stopped', 'stopped')
  }

  _cleanup () {
    if (this.brain) { this.brain.stop(); this.brain = null }
  }

  _connect () {
    if (!this.shouldRun) return
    this._cleanup()
    this.setState('connecting', 'connecting…')

    // 1) Pre-fill the auth cache with OUR token + refresh token.
    const info = this.account.tokenInfo || {}
    seedAuthCache({
      folder: this.tokenCacheDir,
      username: this.account.name,
      mcToken: this.account.mctoken,
      expiresInSeconds: info.expiresInSeconds || 86400,
      obtainedOn: (info.issuedAt ? info.issuedAt * 1000 : Date.now()),
      refreshToken: this.account.refreshToken
    })

    // 2) Optional proxy (SRV-aware connect).
    const proxy = parseProxy(this.resolveProxy(this.account))

    // 3) Build the mineflayer bot (token login).
    let bot
    try {
      bot = mineflayer.createBot({
        host: this.config.server.host,
        port: this.config.server.port,
        version: this.config.server.version,
        username: this.account.name, // also used for the prismarine-auth cache hash
        auth: 'microsoft',
        flow: 'live',
        authTitle: AUTH_TITLE,
        profilesFolder: this.tokenCacheDir,
        connect: makeConnect({ host: this.config.server.host, port: this.config.server.port, proxy }),
        // If prismarine-auth asks for interactive login, the account can't log in
        // on its own (token expired AND refresh token dead/absent).
        onMsaCode: (code) => this._handleNeedsLogin(code)
      })
    } catch (e) {
      this.setState('error', 'createBot failed: ' + e.message)
      return this._scheduleReconnect()
    }

    this.bot = bot
    this._wire(bot)
  }

  _wire (bot) {
    // Enable the fork's physics plugin (verified: default export is loader(bot)).
    try { bot.loadPlugin(physicsUtil) } catch (e) { this.emit('warn', 'physics-util not loaded: ' + e.message) }

    bot.once('login', () => {
      this._captureRotatedCredentials() // save refreshed token/refresh-token
      this.setState('online', 'logged in')
    })

    bot.once('spawn', () => {
      this.reconnects = 0
      this.stats.mined = 0
      this.setState('mining', 'spawned, working')
      this.brain = startBrain(bot, this.config, {
        onMine: (count) => { this.stats.mined = count; this.emit('mined', count) },
        onStatus: (text) => { this.stats.lastEvent = text; this.emit('status', text) },
        onDone: (report) => this._handleDone(report),
        log: (msg) => this.emit('log', msg)
      })
    })

    bot.on('health', () => { this.stats.health = bot.health })
    bot.on('move', () => { if (bot.entity) this.stats.position = bot.entity.position.floored() })

    bot.on('kicked', (reason) => this.emit('log', 'kicked: ' + stringifyReason(reason)))
    bot.on('error', (err) => this.emit('log', 'error: ' + err.message))

    bot.on('end', (reason) => {
      this._cleanup()
      if (this.state === 'needs-login' || this.state === 'stopped' || this.state === 'done') return
      this.emit('log', 'disconnected: ' + (reason || ''))
      this._scheduleReconnect()
    })
  }

  // Inventory full of dirt → leave the server and report.
  _handleDone (report) {
    this.shouldRun = false
    this.setState('done', `done — ${report.dirt} dirt`)
    this.emit('done', report)
    try { this.bot?.quit('inventory full of dirt') } catch { /* ignore */ }
  }

  _handleNeedsLogin (code) {
    this.shouldRun = false
    this.setState('needs-login', 'manual re-login needed (token expired, no valid refresh)')
    this.emit('needs-login', { account: this.account, code })
    try { this.bot?.quit() } catch { /* ignore */ }
  }

  _captureRotatedCredentials () {
    const newRefresh = readBackRefreshToken(this.tokenCacheDir, this.account.name)
    const mca = readBackMcToken(this.tokenCacheDir, this.account.name)
    const creds = {}
    if (newRefresh && newRefresh !== this.account.refreshToken) creds.refreshToken = newRefresh
    if (mca && mca.access_token && mca.access_token !== this.account.mctoken) {
      creds.mctoken = mca.access_token
      creds.expiresInSeconds = mca.expires_in
      creds.obtainedOn = mca.obtainedOn
    }
    if (Object.keys(creds).length) {
      if (creds.refreshToken) this.account.refreshToken = creds.refreshToken
      if (creds.mctoken) this.account.mctoken = creds.mctoken
      this.onCredentials(this.account, creds)
      this.emit('token-updated', creds)
    }
  }

  _scheduleReconnect () {
    if (!this.shouldRun) return
    const max = this.config.behavior.maxReconnects
    if (max > 0 && this.reconnects >= max) {
      this.setState('stopped', `reconnect limit reached (${max})`)
      return
    }
    this.reconnects++
    this.setState('reconnecting', `reconnect #${this.reconnects} in ${Math.round(this.config.behavior.reconnectDelayMs / 1000)}s`)
    setTimeout(() => this._connect(), this.config.behavior.reconnectDelayMs)
  }

  wipeCache () { wipeAuthCache(this.tokenCacheDir) }
}

function sanitize (s) { return String(s || 'account').replace(/[^a-zA-Z0-9_-]/g, '_') }
function stringifyReason (r) { try { return typeof r === 'string' ? r : JSON.stringify(r) } catch { return String(r) } }

export default ManagedBot
