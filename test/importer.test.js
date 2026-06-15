// Tests de l'import de comptes + lecture des cookies.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseNetscapeCookies } from '../src/util/netscapeCookies.js'
import { importFromFolder } from '../src/accounts/importer.js'

test('parseNetscapeCookies lit le RefreshToken + les cookies', () => {
  const text = [
    '# RefreshToken: M.C524_TEST.abc',
    '# Netscape HTTP Cookie File',
    '.microsoft.com\tTRUE\t/\tTRUE\t1811063230\tFOO\tBAR'
  ].join('\n')
  const { refreshToken, cookies } = parseNetscapeCookies(text)
  assert.equal(refreshToken, 'M.C524_TEST.abc')
  assert.equal(cookies.length, 1)
  assert.equal(cookies[0].name, 'FOO')
  assert.equal(cookies[0].value, 'BAR')
})

test('importFromFolder assemble compte + cookies', () => {
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const jwt = `${b64({ alg: 'none' })}.${b64({ exp: now + 3600, iat: now, pfd: [{ type: 'mc', id: 'uuid1', name: 'Zoe' }] })}.sig`

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'imp-'))
  fs.writeFileSync(path.join(dir, 'accounts.txt'), `[Zoe]cookie:cookie | mctoken: ${jwt}\n`)
  fs.mkdirSync(path.join(dir, 'cookies'))
  fs.writeFileSync(path.join(dir, 'cookies', 'zoe.txt'), '# RefreshToken: M.R3_TEST.zzz\n')

  const accounts = importFromFolder(dir)
  assert.equal(accounts.length, 1)
  const a = accounts[0]
  assert.equal(a.name, 'Zoe')
  assert.equal(a.uuid, 'uuid1')
  assert.equal(a.refreshToken, 'M.R3_TEST.zzz')
  assert.equal(a.tokenInfo.isExpired, false)
  fs.rmSync(dir, { recursive: true, force: true })
})
