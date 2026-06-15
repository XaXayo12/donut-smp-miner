// Tests du coffre-fort chiffré.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { encryptJson, decryptJson } from '../src/vault/crypto.js'
import { Vault } from '../src/vault/vault.js'

test('chiffre puis déchiffre = mêmes données', async () => {
  const data = { accounts: [{ name: 'Bob', secret: 'xyz' }] }
  const pack = await encryptJson(data, 'monMotDePasse')
  const back = await decryptJson(pack, 'monMotDePasse')
  assert.deepEqual(back, data)
})

test('mauvais mot de passe = erreur', async () => {
  const pack = await encryptJson({ a: 1 }, 'bon')
  await assert.rejects(() => decryptJson(pack, 'mauvais'), /incorrect/i)
})

test('Vault: créer, ajouter, rouvrir', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'))
  const file = path.join(dir, 'vault.enc')

  const v1 = new Vault(file)
  await v1.create('pw1234')
  v1.upsertAccount({ id: '1', name: 'Alice', mctoken: 'tok' })
  await v1.save()

  const v2 = new Vault(file)
  await v2.open('pw1234')
  assert.equal(v2.getAccounts().length, 1)
  assert.equal(v2.findAccount('Alice').mctoken, 'tok')

  await assert.rejects(() => new Vault(file).open('faux'), /incorrect/i)
  fs.rmSync(dir, { recursive: true, force: true })
})
