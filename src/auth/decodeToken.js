// 📦 Ce fichier = le "décodeur de jeton" (token Minecraft).
//    Un "mctoken" est un long texte en 3 morceaux séparés par des points (un JWT).
//    Le morceau du milieu contient des infos lisibles: le pseudo, l'UUID,
//    et surtout la DATE D'EXPIRATION. On les lit ici, sans rien deviner.
//
//    (English: decodes a Minecraft services JWT to read name, uuid and expiry.
//     We do NOT verify the signature — we only read the public payload.)

/**
 * Décode la partie "payload" d'un JWT (sans vérifier la signature).
 * @param {string} jwt - le mctoken
 * @returns {object} le contenu décodé
 */
export function decodeJwtPayload (jwt) {
  const parts = String(jwt).split('.')
  if (parts.length < 2) throw new Error('Token invalide (ce n\'est pas un JWT)')
  // base64url -> base64 -> JSON
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const json = Buffer.from(b64, 'base64').toString('utf8')
  return JSON.parse(json)
}

/**
 * Transforme un UUID sans tirets en UUID avec tirets.
 * "22c66a73f31a48a1ba1a897897ea0218" -> "22c66a73-f31a-48a1-ba1a-897897ea0218"
 */
export function dashifyUuid (id) {
  if (!id || id.includes('-')) return id
  return [
    id.slice(0, 8), id.slice(8, 12), id.slice(12, 16),
    id.slice(16, 20), id.slice(20, 32)
  ].join('-')
}

/**
 * Lit les infos utiles d'un mctoken: pseudo, UUID, dates.
 * @param {string} mctoken
 * @returns {{
 *   name: string, uuid: string, uuidDashed: string,
 *   xuid: string|null, issuedAt: number, expiresAt: number,
 *   expiresInSeconds: number, isExpired: boolean
 * }}
 */
export function inspectMcToken (mctoken) {
  const p = decodeJwtPayload(mctoken)

  // Le pseudo et l'UUID sont dans "pfd" (profile data) ou "profiles.mc".
  const profile = Array.isArray(p.pfd) ? p.pfd.find(x => x.type === 'mc') : null
  const uuid = (profile && profile.id) || (p.profiles && p.profiles.mc) || null
  const name = (profile && profile.name) || null

  const now = Math.floor(Date.now() / 1000)
  const expiresAt = Number(p.exp) || 0
  const issuedAt = Number(p.iat) || (expiresAt ? expiresAt - 86400 : now)

  return {
    name,
    uuid,
    uuidDashed: dashifyUuid(uuid),
    xuid: p.xid || p.xuid || null,
    issuedAt,
    expiresAt,
    expiresInSeconds: expiresAt - issuedAt,
    isExpired: expiresAt > 0 ? expiresAt <= now : true,
    secondsUntilExpiry: expiresAt - now
  }
}

export default { decodeJwtPayload, dashifyUuid, inspectMcToken }
