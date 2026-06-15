// 📦 Ce fichier = "le bot complet, prêt à l'emploi".
//    Il assemble tout pour UN compte:
//       - connexion par jeton (token login) + refresh automatique
//       - proxy (si configuré)
//       - physique du fork activée (plugin nxg) + pathfinder
//       - le minage (miner.js)
//       - reconnexion automatique
//    Il "émet" des événements pour que le tableau de bord affiche l'état.
//
//    (English: a managed bot for one account. Token login w/ auto-refresh,
//     proxy, fork physics plugin, mining, and auto-reconnect.)

import { EventEmitter } from 'node:events'
import path from 'node:path'
import mineflayer from 'mineflayer'
import physicsUtil from '@nxg-org/mineflayer-physics-util' // default = loader(bot) (le "plugin physic" du fork)
import { startMining } from './miner.js'
import { makeConnect, parseProxy } from '../proxy/proxy.js'
import { seedAuthCache, readBackRefreshToken, readBackMcToken, wipeAuthCache } from '../auth/seedCache.js'

const AUTH_TITLE = '00000000402b5328' // Titles.MinecraftJava — correspond au champ "aid" des jetons

export class ManagedBot extends EventEmitter {
  /**
   * @param {object} account - un compte du coffre
   * @param {object} config - la config globale
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
    this.miner = null
    this.shouldRun = false
    this.reconnects = 0
    this.afkTimer = null

    this.state = 'idle' // idle | connecting | online | mining | reconnecting | needs-login | stopped | error
    this.stats = { mined: 0, lastEvent: '', position: null, health: null, ping: null }
  }

  setState (state, note) {
    this.state = state
    if (note) this.stats.lastEvent = note
    this.emit('state', this.state, note)
  }

  // Démarre (et garde) le bot en vie.
  start () {
    this.shouldRun = true
    this.reconnects = 0
    this._connect()
  }

  // Arrête proprement (et n'essaie plus de se reconnecter).
  stop () {
    this.shouldRun = false
    this._cleanup()
    try { this.bot?.quit('arrêt demandé') } catch { /* ignore */ }
    this.setState('stopped', 'arrêté')
  }

  _cleanup () {
    if (this.afkTimer) { clearInterval(this.afkTimer); this.afkTimer = null }
    if (this.miner) { this.miner.stop(); this.miner = null }
  }

  _connect () {
    if (!this.shouldRun) return
    this._cleanup()
    this.setState('connecting', 'connexion…')

    // 1) On prépare le cache d'auth avec NOTRE jeton + refresh token.
    const info = this.account.tokenInfo || {}
    seedAuthCache({
      folder: this.tokenCacheDir,
      username: this.account.name,
      mcToken: this.account.mctoken,
      expiresInSeconds: info.expiresInSeconds || 86400,
      obtainedOn: (info.issuedAt ? info.issuedAt * 1000 : Date.now()),
      refreshToken: this.account.refreshToken
    })

    // 2) Proxy éventuel.
    const proxy = parseProxy(this.resolveProxy(this.account))

    // 3) On construit le bot mineflayer (connexion par jeton).
    let bot
    try {
      bot = mineflayer.createBot({
        host: this.config.server.host,
        port: this.config.server.port,
        version: this.config.server.version,
        username: this.account.name, // sert aussi au nom du cache prismarine-auth
        auth: 'microsoft',
        flow: 'live',
        authTitle: AUTH_TITLE,
        profilesFolder: this.tokenCacheDir,
        connect: makeConnect({ host: this.config.server.host, port: this.config.server.port, proxy }),
        // Si prismarine-auth réclame une connexion manuelle = le compte ne peut
        // PAS se connecter tout seul (jeton périmé ET refresh token absent/mort).
        onMsaCode: (code) => this._handleNeedsLogin(code)
      })
    } catch (e) {
      this.setState('error', 'createBot a échoué: ' + e.message)
      return this._scheduleReconnect()
    }

    this.bot = bot
    this._wire(bot)
  }

  _wire (bot) {
    // Active le "plugin physic" du fork (vérifié: export par défaut = loader(bot)).
    try { bot.loadPlugin(physicsUtil) } catch (e) { this.emit('warn', 'physics-util non chargé: ' + e.message) }

    bot.once('login', () => {
      // Connexion réussie -> on récupère le jeton/refresh tournés et on les sauve.
      this._captureRotatedCredentials()
      this.setState('online', 'connecté (login)')
    })

    bot.once('spawn', () => {
      this.reconnects = 0
      this.stats.mined = 0
      this.setState('mining', 'apparu, je mine')
      this._startAfk(bot)
      this.miner = startMining(bot, this.config, {
        onMine: (count) => { this.stats.mined = count; this.emit('mined', count) },
        onStatus: (text) => { this.stats.lastEvent = text; this.emit('status', text) },
        log: (msg) => this.emit('log', msg)
      })
    })

    bot.on('health', () => { this.stats.health = bot.health })
    bot.on('move', () => { if (bot.entity) this.stats.position = bot.entity.position.floored() })

    bot.on('kicked', (reason) => this.emit('log', 'kické: ' + stringifyReason(reason)))
    bot.on('error', (err) => this.emit('log', 'erreur: ' + err.message))

    bot.on('end', (reason) => {
      this._cleanup()
      if (this.state === 'needs-login' || this.state === 'stopped') return
      this.emit('log', 'déconnecté: ' + (reason || ''))
      this._scheduleReconnect()
    })
  }

  _handleNeedsLogin (code) {
    // On NE poursuit PAS la connexion interactive (mode automatique).
    this.shouldRun = false
    this.setState('needs-login', 'reconnexion manuelle nécessaire (jeton périmé, pas de refresh valide)')
    this.emit('needs-login', { account: this.account, code })
    try { this.bot?.quit() } catch { /* ignore */ }
  }

  _captureRotatedCredentials () {
    // prismarine-auth a pu fabriquer un nouveau mctoken et faire tourner le refresh token.
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
      // On met à jour notre objet ET on demande au gestionnaire de sauver dans le coffre.
      if (creds.refreshToken) this.account.refreshToken = creds.refreshToken
      if (creds.mctoken) this.account.mctoken = creds.mctoken
      this.onCredentials(this.account, creds)
      this.emit('token-updated', creds)
    }
  }

  _startAfk (bot) {
    if (!this.config.behavior.antiAfk) return
    this.afkTimer = setInterval(() => {
      // Petit saut + petit regard, seulement si on n'est pas en train de bouger.
      try {
        bot.setControlState('jump', true)
        setTimeout(() => bot.setControlState('jump', false), 250)
        bot.look(Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.6, false)
      } catch { /* ignore */ }
    }, this.config.behavior.antiAfkIntervalMs)
  }

  _scheduleReconnect () {
    if (!this.shouldRun) return
    const max = this.config.behavior.maxReconnects
    if (max > 0 && this.reconnects >= max) {
      this.setState('stopped', `limite de reconnexions atteinte (${max})`)
      return
    }
    this.reconnects++
    this.setState('reconnecting', `reconnexion #${this.reconnects} dans ${Math.round(this.config.behavior.reconnectDelayMs / 1000)}s`)
    setTimeout(() => this._connect(), this.config.behavior.reconnectDelayMs)
  }

  // Efface les jetons en clair laissés sur le disque (à appeler à la fermeture).
  wipeCache () { wipeAuthCache(this.tokenCacheDir) }
}

function sanitize (s) { return String(s || 'compte').replace(/[^a-zA-Z0-9_-]/g, '_') }
function stringifyReason (r) { try { return typeof r === 'string' ? r : JSON.stringify(r) } catch { return String(r) } }

export default ManagedBot
