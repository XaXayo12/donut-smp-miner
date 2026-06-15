// 📦 Ce fichier = le "re-générateur de jeton".
//    Un mctoken ne vit que ~24h. Pour ne PAS se reconnecter à la main,
//    on utilise le "refresh token" Microsoft pour fabriquer un NOUVEAU mctoken.
//    C'est la chaîne officielle Microsoft -> Xbox -> Minecraft.
//    Tous les liens et formats viennent de la lib prismarine-auth (vérifiés).
//
//    (English: turns a Microsoft refresh token into a fresh Minecraft token,
//     via the standard MSA -> XBL -> XSTS -> Minecraft services chain.
//     Endpoints/format mirror prismarine-auth exactly.)

// Node 24 a "fetch" intégré, pas besoin de librairie.

// L'identifiant client = le "titre" Minecraft Java.
// Il DOIT correspondre au champ "aid" de tes jetons (….402b5328) — vérifié.
const CLIENT_ID = '00000000402b5328' // Titles.MinecraftJava
const SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL'

const EP = {
  liveToken: 'https://login.live.com/oauth20_token.srf',
  xblUser: 'https://user.auth.xboxlive.com/user/authenticate',
  xsts: 'https://xsts.auth.xboxlive.com/xsts/authorize',
  mcLogin: 'https://api.minecraftservices.com/authentication/login_with_xbox',
  mcProfile: 'https://api.minecraftservices.com/minecraft/profile'
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'User-Agent': 'MinecraftLauncher/2.2.10675'
}

// Petit utilitaire: lance une erreur lisible si la réponse n'est pas OK.
async function readOrThrow (res, where) {
  if (res.ok) return res.json()
  const body = await res.text().catch(() => '')
  throw new Error(`${where} a échoué (${res.status} ${res.statusText}) ${body.slice(0, 300)}`)
}

/**
 * Étape 1 — Microsoft: refresh token -> nouveau access token (+ nouveau refresh token).
 * @param {string} refreshToken
 * @param {function} [fetchImpl] - fetch personnalisé (ex: via proxy)
 */
export async function refreshMsa (refreshToken, fetchImpl = fetch) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: SCOPE,
    redirect_uri: 'https://login.live.com/oauth20_desktop.srf'
  })
  const res = await fetchImpl(EP.liveToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  const data = await readOrThrow(res, 'Microsoft (refresh)')
  // data = { access_token, refresh_token, expires_in, ... }
  return data
}

/** Étape 2 — Xbox Live: access token Microsoft -> jeton Xbox + userHash. */
export async function xblAuth (msaAccessToken, fetchImpl = fetch) {
  const res = await fetchImpl(EP.xblUser, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `t=${msaAccessToken}` // 't=' pour le flow "live" (vérifié)
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    })
  })
  const data = await readOrThrow(res, 'Xbox Live')
  return { token: data.Token, userHash: data.DisplayClaims.xui[0].uhs }
}

/** Étape 3 — XSTS: jeton Xbox -> jeton XSTS (autorisation pour Minecraft). */
export async function xstsAuth (xblToken, fetchImpl = fetch) {
  const res = await fetchImpl(EP.xsts, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    })
  })
  if (res.status === 401) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`XSTS refusé (XErr ${err.XErr ?? '?'}). Le compte a peut-être un souci Xbox (âge, ban, pas de profil Xbox).`)
  }
  const data = await readOrThrow(res, 'XSTS')
  return { token: data.Token, userHash: data.DisplayClaims.xui[0].uhs }
}

/** Étape 4 — Minecraft: jeton XSTS -> mctoken Minecraft. */
export async function mcLogin (userHash, xstsToken, fetchImpl = fetch) {
  const res = await fetchImpl(EP.mcLogin, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ identityToken: `XBL3.0 x=${userHash};${xstsToken}` })
  })
  const data = await readOrThrow(res, 'Minecraft (login_with_xbox)')
  // data = { access_token, expires_in, token_type, ... }
  return data
}

/** Étape 5 (option) — récupère le profil (pseudo + UUID). */
export async function fetchProfile (mcToken, fetchImpl = fetch) {
  const res = await fetchImpl(EP.mcProfile, {
    headers: { ...JSON_HEADERS, Authorization: `Bearer ${mcToken}` }
  })
  return readOrThrow(res, 'Profil Minecraft')
}

/**
 * TOUTE la chaîne d'un coup: refresh token -> mctoken frais.
 * @returns {Promise<{
 *   mcToken: string, expiresInSeconds: number, obtainedOn: number,
 *   newRefreshToken: string, profile: {id:string,name:string}|null
 * }>}
 */
export async function refreshFullChain (refreshToken, { fetchImpl = fetch, withProfile = true } = {}) {
  const msa = await refreshMsa(refreshToken, fetchImpl)
  const xbl = await xblAuth(msa.access_token, fetchImpl)
  const xsts = await xstsAuth(xbl.token, fetchImpl)
  const mc = await mcLogin(xsts.userHash, xsts.token, fetchImpl)
  const profile = withProfile ? await fetchProfile(mc.access_token, fetchImpl).catch(() => null) : null
  return {
    mcToken: mc.access_token,
    expiresInSeconds: mc.expires_in || 86400,
    obtainedOn: Date.now(),
    newRefreshToken: msa.refresh_token || refreshToken, // Microsoft fait tourner le refresh token
    profile
  }
}

export default { refreshMsa, xblAuth, xstsAuth, mcLogin, fetchProfile, refreshFullChain }
