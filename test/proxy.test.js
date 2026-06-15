// Tests de l'analyse des adresses de proxy.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseProxy } from '../src/proxy/proxy.js'

test('socks5 avec scheme + identifiants', () => {
  const p = parseProxy('socks5://user:pass@1.2.3.4:1080')
  assert.deepEqual(p, { type: 'socks5', host: '1.2.3.4', port: 1080, userId: 'user', password: 'pass' })
})

test('http avec scheme', () => {
  const p = parseProxy('http://10.0.0.1:8080')
  assert.equal(p.type, 'http')
  assert.equal(p.port, 8080)
})

test('format ip:port (socks5 par défaut)', () => {
  const p = parseProxy('1.2.3.4:1080')
  assert.equal(p.type, 'socks5')
  assert.equal(p.host, '1.2.3.4')
})

test('format ip:port:user:pass', () => {
  const p = parseProxy('1.2.3.4:1080:bob:secret')
  assert.deepEqual(p, { type: 'socks5', host: '1.2.3.4', port: 1080, userId: 'bob', password: 'secret' })
})

test('vide = null', () => {
  assert.equal(parseProxy(''), null)
  assert.equal(parseProxy(null), null)
})
