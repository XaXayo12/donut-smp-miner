// Tests for the "keep vs junk" inventory logic (no live bot needed).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeKeepPredicate, isShovel, isShield } from '../src/bot/inventory.js'
import { DEFAULTS } from '../src/config/config.js'

const keep = makeKeepPredicate(DEFAULTS)
const item = (name) => ({ name })

test('keeps dirt (the loot)', () => {
  assert.equal(keep(item('dirt')), true)
  assert.equal(keep(item('coarse_dirt')), true)
})

test('keeps tools, crafting materials and combat gear', () => {
  assert.equal(keep(item('wooden_shovel')), true)
  assert.equal(keep(item('oak_log')), true)
  assert.equal(keep(item('oak_planks')), true)
  assert.equal(keep(item('stick')), true)
  assert.equal(keep(item('crafting_table')), true)
  assert.equal(keep(item('shield')), true)
  assert.equal(keep(item('iron_sword')), true)
})

test('throws away the junk', () => {
  assert.equal(keep(item('cobblestone')), false)
  assert.equal(keep(item('gravel')), false)
  assert.equal(keep(item('flint')), false)
  assert.equal(keep(item('wheat_seeds')), false)
})

test('item type helpers', () => {
  assert.equal(isShovel(item('diamond_shovel')), true)
  assert.equal(isShovel(item('diamond_pickaxe')), false)
  assert.equal(isShield(item('shield')), true)
})
