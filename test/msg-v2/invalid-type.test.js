const test = require('node:test')
const assert = require('node:assert')
const Keypair = require('ppppp-keypair')
const MsgV2 = require('../../lib/msg-v2')

test('invalid type not a string', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  assert.throws(
    () => {
      MsgV2.create({
        keypair,
        data: { text: 'Hello world!' },
        type: 123,
      })
    },
    /invalid type/,
    'not a string'
  )
})

test('invalid type with "/" character', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  assert.throws(
    () => {
      MsgV2.create({
        keypair,
        data: { text: 'Hello world!' },
        type: 'group/init',
      })
    },
    /invalid type/,
    'invalid type if contains /'
  )
})

test('invalid type with "*" character', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  assert.throws(
    () => {
      MsgV2.create({
        keypair,
        data: { text: 'Hello world!' },
        type: 'star*',
      })
    },
    /invalid type/,
    'invalid type if contains *'
  )
})

test('invalid type too short', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  assert.throws(
    () => {
      MsgV2.create({
        keypair,
        data: { text: 'Hello world!' },
        type: 'xy',
      })
    },
    /shorter than 3/,
    'invalid type if too short'
  )
})

test('invalid type too long', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  assert.throws(
    () => {
      MsgV2.create({
        keypair,
        data: { text: 'Hello world!' },
        type: 'a'.repeat(120),
      })
    },
    /100\+ characters long/,
    'invalid type if too long'
  )
})
