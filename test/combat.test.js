// Tests for hostile detection (no live server needed — we mock the entities).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Combat } from '../src/bot/combat.js'
import { DEFAULTS } from '../src/config/config.js'

const selfEntity = { id: 0, position: { distanceTo: () => 5 } }
const bot = { entity: selfEntity, entities: {} }
const combat = new Combat(bot, DEFAULTS, () => {})

const ent = (props) => ({ position: { distanceTo: () => 5 }, ...props })

test('skeletons and zombies are hostile', () => {
  assert.equal(combat._isHostile(ent({ name: 'skeleton' })), true)
  assert.equal(combat._isHostile(ent({ name: 'zombie' })), true)
})

test('detects hostile via entity.kind / entity.type too', () => {
  assert.equal(combat._isHostile(ent({ name: 'something', kind: 'Hostile mobs' })), true)
  assert.equal(combat._isHostile(ent({ name: 'whatever', type: 'hostile' })), true)
})

test('cows, players and ourselves are NOT hostile', () => {
  assert.equal(combat._isHostile(ent({ name: 'cow' })), false)
  assert.equal(combat._isHostile(ent({ name: 'Steve', type: 'player' })), false)
  assert.equal(combat._isHostile(bot.entity), false)
})

test('threatNear is false when no entities are around', () => {
  assert.equal(combat.threatNear(), false)
})
