// 📦 Ce fichier = le "coffre-fort" niveau maths.
//    Il transforme ton MOT DE PASSE en clé secrète, puis chiffre/déchiffre
//    du texte avec cette clé. On utilise des outils standards de Node.js
//    (scrypt pour la clé, AES-256-GCM pour le chiffrement). Rien d'inventé.
//
//    (English: password-based encryption helpers using Node's built-in crypto.
//     scrypt to derive a key from the password, AES-256-GCM to encrypt.)

import crypto from 'node:crypto'

const KDF = {
  N: 2 ** 15, // coût CPU/mémoire de scrypt (32768) — solide et raisonnable
  r: 8,
  p: 1,
  keyLen: 32 // 32 octets = clé AES-256
}

/**
 * Fabrique une clé secrète à partir du mot de passe + un "sel" aléatoire.
 * Le même mot de passe + le même sel = la même clé. Sel différent = clé différente.
 */
function deriveKey (password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KDF.keyLen, { N: KDF.N, r: KDF.r, p: KDF.p, maxmem: 256 * 1024 * 1024 }, (err, key) => {
      if (err) reject(err)
      else resolve(key)
    })
  })
}

/**
 * Chiffre un objet JavaScript et renvoie un paquet sûr à écrire sur le disque.
 * @param {object} data - les données en clair (ex: la liste des comptes)
 * @param {string} password - le mot de passe maître
 * @returns {Promise<object>} paquet chiffré (à sauver en JSON)
 */
export async function encryptJson (data, password) {
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12) // 12 octets recommandé pour GCM
  const key = await deriveKey(password, salt)

  const plaintext = Buffer.from(JSON.stringify(data), 'utf8')
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    version: 1,
    kdf: 'scrypt',
    kdfParams: { N: KDF.N, r: KDF.r, p: KDF.p },
    cipher: 'aes-256-gcm',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    data: ciphertext.toString('base64')
  }
}

/**
 * Déchiffre un paquet créé par encryptJson.
 * Lève une erreur claire si le mot de passe est mauvais.
 * @returns {Promise<object>} les données en clair
 */
export async function decryptJson (pack, password) {
  if (!pack || pack.cipher !== 'aes-256-gcm') {
    throw new Error('Format de coffre inconnu ou corrompu.')
  }
  const salt = Buffer.from(pack.salt, 'base64')
  const iv = Buffer.from(pack.iv, 'base64')
  const authTag = Buffer.from(pack.authTag, 'base64')
  const ciphertext = Buffer.from(pack.data, 'base64')
  const key = await deriveKey(password, salt)

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return JSON.parse(plaintext.toString('utf8'))
  } catch {
    // GCM échoue si la clé est mauvaise OU si le fichier a été modifié.
    throw new Error('Mot de passe incorrect (ou coffre endommagé).')
  }
}

export default { encryptJson, decryptJson }
