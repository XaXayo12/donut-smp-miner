// 📦 Ce fichier = "l'importateur de comptes".
//    Il sait lire les exports que tu as (les .zip "WEB-xxxx.zip" ou un dossier),
//    qui contiennent:
//       - accounts.txt           -> une ligne par compte: [Pseudo]cookie:cookie | mctoken: XXXX
//       - cookies/<pseudo>.txt    -> les cookies + parfois "# RefreshToken: ...."
//    Il transforme tout ça en objets "compte" propres pour le coffre.
//
//    (English: imports accounts from the WEB-*.zip export format, or a folder
//     containing accounts.txt + cookies/. Pure parsing, no network.)

import fs from 'node:fs'
import crypto from 'node:crypto'
import AdmZip from 'adm-zip'
import { parseNetscapeCookies } from '../util/netscapeCookies.js'
import { inspectMcToken } from '../auth/decodeToken.js'

// Lit une ligne de accounts.txt -> { name, mctoken } (ou null si illisible)
function parseAccountLine (line) {
  const text = line.trim()
  if (!text) return null
  // Pseudo entre crochets au début: [Over41]....
  const nameMatch = text.match(/^\[([^\]]+)\]/)
  // mctoken: après "mctoken:"
  const tokenMatch = text.match(/mctoken\s*[:=]\s*([A-Za-z0-9._-]+)/i)
  if (!tokenMatch) return null
  return {
    name: nameMatch ? nameMatch[1] : null,
    mctoken: tokenMatch[1]
  }
}

// Construit un objet "compte" complet à partir des morceaux.
function buildAccount ({ name, mctoken, cookieText }) {
  const account = {
    id: crypto.randomUUID(),
    name: name || null,
    uuid: null,
    mctoken: mctoken || null,
    refreshToken: null,
    cookies: [],
    proxy: null, // rempli plus tard si tu veux (par compte)
    enabled: true,
    importedAt: new Date().toISOString(),
    tokenInfo: null // infos décodées (expiration, etc.)
  }

  // On lit le jeton pour récupérer pseudo/UUID/expiration de façon fiable.
  if (mctoken) {
    try {
      const info = inspectMcToken(mctoken)
      account.uuid = info.uuid
      if (!account.name && info.name) account.name = info.name
      account.tokenInfo = info
    } catch { /* jeton illisible: on garde quand même la ligne */ }
  }

  // On lit les cookies + le refresh token s'il existe.
  if (cookieText) {
    const { refreshToken, cookies } = parseNetscapeCookies(cookieText)
    account.refreshToken = refreshToken
    account.cookies = cookies
  }

  return account
}

// Cherche le fichier cookies du compte (insensible à la casse).
function findCookieEntry (cookieFiles, name) {
  if (!name) return null
  const lower = name.toLowerCase()
  return cookieFiles.find(f => f.base === lower) || null
}

/**
 * Importe depuis un fichier .zip.
 * @returns {Array<object>} liste de comptes
 */
export function importFromZip (zipPath) {
  const zip = new AdmZip(zipPath)
  const entries = zip.getEntries()

  let accountsText = ''
  const cookieFiles = [] // { base: '<pseudo en minuscule>', text }

  for (const e of entries) {
    if (e.isDirectory) continue
    const name = e.entryName.replace(/\\/g, '/')
    if (/(^|\/)accounts\.txt$/i.test(name)) {
      accountsText = e.getData().toString('utf8')
    } else if (/(^|\/)cookies\//i.test(name) && name.toLowerCase().endsWith('.txt')) {
      const base = name.split('/').pop().replace(/\.txt$/i, '').toLowerCase()
      cookieFiles.push({ base, text: e.getData().toString('utf8') })
    }
  }

  return assemble(accountsText, cookieFiles)
}

/**
 * Importe depuis un dossier déjà décompressé (contenant accounts.txt + cookies/).
 */
export function importFromFolder (folderPath) {
  const accountsPath = findFile(folderPath, 'accounts.txt')
  const accountsText = accountsPath ? fs.readFileSync(accountsPath, 'utf8') : ''

  const cookieFiles = []
  const cookiesDir = findDir(folderPath, 'cookies')
  if (cookiesDir) {
    for (const f of fs.readdirSync(cookiesDir)) {
      if (!f.toLowerCase().endsWith('.txt')) continue
      cookieFiles.push({
        base: f.replace(/\.txt$/i, '').toLowerCase(),
        text: fs.readFileSync(`${cookiesDir}/${f}`, 'utf8')
      })
    }
  }

  return assemble(accountsText, cookieFiles)
}

// Importe automatiquement depuis un chemin (zip OU dossier).
export function importFromPath (p) {
  const stat = fs.statSync(p)
  if (stat.isDirectory()) return importFromFolder(p)
  if (p.toLowerCase().endsWith('.zip')) return importFromZip(p)
  throw new Error('Chemin non supporté: donne un .zip ou un dossier.')
}

// Assemble les lignes de comptes avec leurs cookies.
function assemble (accountsText, cookieFiles) {
  const out = []
  for (const line of accountsText.split(/\r?\n/)) {
    const parsed = parseAccountLine(line)
    if (!parsed) continue
    const cookieEntry = findCookieEntry(cookieFiles, parsed.name)
    out.push(buildAccount({
      name: parsed.name,
      mctoken: parsed.mctoken,
      cookieText: cookieEntry ? cookieEntry.text : null
    }))
  }
  return out
}

// --- petites aides fichiers (insensibles à la casse) ---
function findFile (dir, fileName) {
  const target = fileName.toLowerCase()
  const hit = fs.readdirSync(dir).find(f => f.toLowerCase() === target)
  return hit ? `${dir}/${hit}` : null
}
function findDir (dir, dirName) {
  const target = dirName.toLowerCase()
  const hit = fs.readdirSync(dir).find(f => f.toLowerCase() === target && fs.statSync(`${dir}/${f}`).isDirectory())
  return hit ? `${dir}/${hit}` : null
}

export default { importFromZip, importFromFolder, importFromPath }
