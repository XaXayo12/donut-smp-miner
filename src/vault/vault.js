// 📦 Ce fichier = le "coffre-fort" niveau fichier.
//    Il ouvre/crée un fichier chiffré (data/vault.enc) qui contient TOUS
//    les comptes (pseudos, jetons, refresh tokens, cookies).
//    Pour l'ouvrir, il faut le MOT DE PASSE MAÎTRE. Sans lui, le fichier
//    est illisible. C'est ça, le "vault" demandé.
//
//    (English: file-backed encrypted vault holding all accounts. Needs the
//     master password to open. Uses crypto.js under the hood.)

import fs from 'node:fs'
import path from 'node:path'
import { encryptJson, decryptJson } from './crypto.js'

export class Vault {
  /**
   * @param {string} filePath - chemin du fichier coffre (ex: data/vault.enc)
   */
  constructor (filePath) {
    this.filePath = filePath
    this.password = null
    this.data = null // { accounts: [...] } une fois ouvert
  }

  exists () {
    return fs.existsSync(this.filePath)
  }

  /**
   * Crée un nouveau coffre vide protégé par `password`.
   */
  async create (password) {
    this.password = password
    this.data = { accounts: [] }
    await this.save()
  }

  /**
   * Ouvre un coffre existant avec le mot de passe donné.
   * Lève une erreur si le mot de passe est faux.
   */
  async open (password) {
    const pack = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
    this.data = await decryptJson(pack, password) // lève si mauvais mdp
    this.password = password
    if (!this.data.accounts) this.data.accounts = []
    return this.data
  }

  /**
   * Sauvegarde (re-chiffre) le contenu actuel sur le disque, de façon atomique.
   */
  async save () {
    if (this.password == null) throw new Error('Coffre non ouvert.')
    const pack = await encryptJson(this.data, this.password)
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const tmp = this.filePath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(pack, null, 2))
    fs.renameSync(tmp, this.filePath) // remplacement atomique
  }

  // ----- petites aides pour gérer les comptes -----

  getAccounts () {
    return this.data?.accounts ?? []
  }

  findAccount (idOrName) {
    return this.getAccounts().find(a => a.id === idOrName || a.name?.toLowerCase() === String(idOrName).toLowerCase())
  }

  /**
   * Ajoute un compte, ou met à jour celui qui a le même pseudo.
   * @returns {object} le compte enregistré
   */
  upsertAccount (account) {
    const list = this.data.accounts
    const i = list.findIndex(a => a.name?.toLowerCase() === account.name?.toLowerCase())
    if (i >= 0) {
      list[i] = { ...list[i], ...account, id: list[i].id }
      return list[i]
    }
    list.push(account)
    return account
  }

  removeAccount (idOrName) {
    const before = this.data.accounts.length
    this.data.accounts = this.data.accounts.filter(a => a.id !== idOrName && a.name?.toLowerCase() !== String(idOrName).toLowerCase())
    return this.data.accounts.length < before
  }
}

export default Vault
