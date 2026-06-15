// 📦 Ce fichier = le "lecteur de cookies".
//    Les comptes exportés ont un fichier de cookies au format "Netscape"
//    (le même format que les extensions de navigateur). On le lit ici.
//    On récupère aussi le "RefreshToken" Microsoft s'il est écrit en commentaire.
//
//    (English: parses a Netscape cookie jar file + the optional
//     "# RefreshToken: ..." header line that some exports include.)

/**
 * Lit le contenu texte d'un fichier de cookies Netscape.
 * @param {string} text - le contenu brut du fichier .txt
 * @returns {{ refreshToken: string|null, cookies: Array<object> }}
 */
export function parseNetscapeCookies (text) {
  const lines = text.split(/\r?\n/)
  let refreshToken = null
  const cookies = []

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line) continue

    // Certaines exportations mettent le refresh token Microsoft tout en haut,
    // dans un commentaire: "# RefreshToken: M.C5xx_BAY...."
    if (line.startsWith('#')) {
      const m = line.match(/refresh[\s_-]?token\s*[:=]\s*(\S+)/i)
      if (m) refreshToken = m[1]
      continue // les autres lignes en "#" sont juste des commentaires
    }

    // Une ligne de cookie = 7 colonnes séparées par des tabulations:
    // domain  includeSubdomains  path  secure  expiry  name  value
    const parts = line.split('\t')
    if (parts.length < 7) continue

    cookies.push({
      domain: parts[0],
      includeSubdomains: parts[1] === 'TRUE',
      path: parts[2],
      secure: parts[3] === 'TRUE',
      expires: Number(parts[4]) || 0,
      name: parts[5],
      value: parts.slice(6).join('\t')
    })
  }

  return { refreshToken, cookies }
}

/**
 * Retrouve la valeur d'un cookie par son nom (ex: "ESTSAUTH").
 * @returns {string|null}
 */
export function findCookie (cookies, name) {
  const c = cookies.find(c => c.name === name)
  return c ? c.value : null
}

export default { parseNetscapeCookies, findCookie }
