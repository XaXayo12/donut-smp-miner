// 📦 Ce fichier = le "préparateur de connexion".
//    mineflayer se connecte avec la lib "prismarine-auth", qui lit des petits
//    fichiers de cache. Ici on ÉCRIT ces fichiers AVANT de lancer le bot,
//    avec NOTRE mctoken et NOTRE refresh token. Comme ça mineflayer:
//       - utilise notre jeton tout de suite (zéro page de connexion)
//       - et si le jeton est périmé, il se sert du refresh token pour en
//         refaire un, tout seul.
//
//    Les noms de fichiers et les formats sont COPIÉS de prismarine-auth
//    (lus dans node_modules), donc rien n'est inventé.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// Reproduit prismarine-auth: createHash = 6 premiers hex du sha1(username).
function cacheHash (username) {
  return crypto.createHash('sha1').update(username ?? '', 'binary').digest('hex').substr(0, 6)
}

function cacheFile (folder, username, cacheName) {
  return path.join(folder, `${cacheHash(username)}_${cacheName}-cache.json`)
}

/**
 * Écrit les fichiers de cache pour un compte.
 * @param {object} opts
 * @param {string} opts.folder    - dossier de cache de CE compte
 * @param {string} opts.username  - le pseudo passé à mineflayer (sert au hash)
 * @param {string} [opts.mcToken] - mctoken actuel (peut être périmé)
 * @param {number} [opts.expiresInSeconds] - durée de vie du mctoken
 * @param {number} [opts.obtainedOn]       - quand on l'a obtenu (ms)
 * @param {string} [opts.refreshToken]     - refresh token Microsoft (si dispo)
 */
export function seedAuthCache ({ folder, username, mcToken, expiresInSeconds, obtainedOn, refreshToken }) {
  fs.mkdirSync(folder, { recursive: true })

  // Cache "mca" = le jeton Minecraft prêt à l'emploi.
  if (mcToken) {
    const mca = {
      mca: {
        access_token: mcToken,
        token_type: 'Bearer',
        expires_in: Number(expiresInSeconds) || 86400,
        obtainedOn: Number(obtainedOn) || Date.now()
      }
    }
    fs.writeFileSync(cacheFile(folder, username, 'mca'), JSON.stringify(mca))
  }

  // Cache "live" = le refresh token, pour fabriquer un nouveau jeton si besoin.
  if (refreshToken) {
    const live = {
      token: {
        refresh_token: refreshToken,
        access_token: '', // vide -> prismarine-auth fera un refresh
        expires_in: 0,
        obtainedOn: Date.now()
      }
    }
    fs.writeFileSync(cacheFile(folder, username, 'live'), JSON.stringify(live))
  }
}

/**
 * Après une session, prismarine-auth a peut-être REMPLACÉ le refresh token
 * (Microsoft les fait tourner). On le relit pour le re-sauver dans le coffre.
 * @returns {string|null} le refresh token courant, ou null
 */
export function readBackRefreshToken (folder, username) {
  try {
    const file = cacheFile(folder, username, 'live')
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return data?.token?.refresh_token || null
  } catch {
    return null
  }
}

/**
 * Relit le mctoken courant du cache (utile pour connaître la nouvelle expiration).
 * @returns {{access_token:string, expires_in:number, obtainedOn:number}|null}
 */
export function readBackMcToken (folder, username) {
  try {
    const file = cacheFile(folder, username, 'mca')
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return data?.mca || null
  } catch {
    return null
  }
}

/** Efface le dossier de cache d'un compte (pour ne pas laisser de jetons en clair). */
export function wipeAuthCache (folder) {
  try {
    fs.rmSync(folder, { recursive: true, force: true })
  } catch { /* pas grave */ }
}

export default { seedAuthCache, readBackRefreshToken, readBackMcToken, wipeAuthCache }
