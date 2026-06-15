// Tests du décodeur de jeton. Aucun vrai jeton ici : on en fabrique un faux.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeJwtPayload, dashifyUuid, inspectMcToken } from '../src/auth/decodeToken.js'

// Fabrique un faux JWT (header.payload.signature) avec un payload donné.
function fakeJwt (payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'none' })}.${b64(payload)}.signature`
}

test('dashifyUuid ajoute les tirets', () => {
  assert.equal(dashifyUuid('22c66a73f31a48a1ba1a897897ea0218'), '22c66a73-f31a-48a1-ba1a-897897ea0218')
  assert.equal(dashifyUuid('already-has-dashes'), 'already-has-dashes')
})

test('decodeJwtPayload lit le JSON du milieu', () => {
  const jwt = fakeJwt({ hello: 'world', n: 1 })
  assert.deepEqual(decodeJwtPayload(jwt), { hello: 'world', n: 1 })
})

test('inspectMcToken: jeton futur = valide', () => {
  const now = Math.floor(Date.now() / 1000)
  const jwt = fakeJwt({
    exp: now + 3600,
    iat: now,
    pfd: [{ type: 'mc', id: 'abc123', name: 'TestPlayer' }],
    xid: '123'
  })
  const info = inspectMcToken(jwt)
  assert.equal(info.name, 'TestPlayer')
  assert.equal(info.uuid, 'abc123')
  assert.equal(info.isExpired, false)
  assert.ok(info.secondsUntilExpiry > 0)
})

test('inspectMcToken: jeton passé = périmé', () => {
  const now = Math.floor(Date.now() / 1000)
  const jwt = fakeJwt({ exp: now - 10, iat: now - 86410, profiles: { mc: 'deadbeef' } })
  const info = inspectMcToken(jwt)
  assert.equal(info.isExpired, true)
  assert.equal(info.uuid, 'deadbeef')
})
