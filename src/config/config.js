// 📦 Ce fichier = le "lecteur de réglages".
//    Il lit config/config.json (tes réglages). Si un réglage manque, il met
//    une valeur par défaut raisonnable. Tu n'es jamais bloqué.
//
//    (English: loads config/config.json and fills missing values with defaults.)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

// Réglages par défaut. Tu peux TOUT changer dans config/config.json.
export const DEFAULTS = {
  server: {
    host: 'donutsmp.net', // l'adresse du serveur DonutSMP
    port: 25565,
    version: false // false = mineflayer devine la version automatiquement
  },
  mining: {
    // Les blocs considérés comme "terre" à miner.
    targetBlocks: ['dirt', 'grass_block', 'coarse_dirt', 'rooted_dirt', 'dirt_path', 'podzol', 'mud'],
    horizontalRadius: 16, // cherche la terre dans ce rayon (blocs) autour du bot
    maxFallDistance: 3, // ne creuse pas un trou plus profond que ça sous soi
    digTimeoutMs: 10000, // abandonne un bloc s'il met trop de temps
    reachOnly: true, // ne mine que les blocs atteignables sans tomber dans le vide
    pauseBetweenBlocksMs: 150 // petite pause humaine entre 2 blocs
  },
  behavior: {
    reconnectDelayMs: 8000, // attente avant de se reconnecter après une déco
    maxReconnects: 0, // 0 = illimité
    refreshMarginSeconds: 600, // rafraîchit le jeton 10 min AVANT qu'il expire
    antiAfk: true, // petits mouvements pour ne pas être kické "AFK"
    antiAfkIntervalMs: 45000,
    startStaggerMs: 4000 // décalage entre le démarrage de chaque compte
  },
  proxy: {
    enabled: false, // mettre true pour utiliser les proxys
    // mode 'per-account' = chaque compte garde son proxy (champ account.proxy)
    // mode 'rotate'      = on distribue la liste ci-dessous aux comptes
    mode: 'per-account',
    list: [] // ex: ["socks5://user:pass@1.2.3.4:1080", "1.2.3.4:1081"]
  },
  console: {
    refreshMs: 1000 // fréquence de rafraîchissement du tableau de bord
  }
}

// Fusion "profonde" simple: les valeurs de l'utilisateur écrasent les défauts.
function deepMerge (base, extra) {
  const out = Array.isArray(base) ? [...base] : { ...base }
  for (const k of Object.keys(extra || {})) {
    if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], extra[k])
    } else {
      out[k] = extra[k]
    }
  }
  return out
}

export function configPath () {
  return path.join(ROOT, 'config', 'config.json')
}

/** Charge la config (avec les défauts). Crée le fichier s'il n'existe pas. */
export function loadConfig () {
  const file = configPath()
  let user = {}
  if (fs.existsSync(file)) {
    try {
      user = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (e) {
      throw new Error(`config/config.json est mal écrit (JSON invalide): ${e.message}`)
    }
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(DEFAULTS, null, 2))
  }
  return deepMerge(DEFAULTS, user)
}

export const paths = {
  root: ROOT,
  data: path.join(ROOT, 'data'),
  vault: path.join(ROOT, 'data', 'vault.enc'),
  tokenCache: path.join(ROOT, 'data', 'token-cache')
}

export default { DEFAULTS, loadConfig, configPath, paths }
