const test = require('node:test')
const assert = require('node:assert')
const Keypair = require('ppppp-keypair')
const MsgV3 = require('../../lib/msg-v3')

test('MsgV3 invalid domain not a string', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  assert.throws(
    () => {
      MsgV3.create({
        keypair,
        data: { text: 'Hello world!' },
        domain: 123,
      })
    },
    /invalid domain/,
    'not a string'
  )
})

test('MsgV3 invalid domain with "/" character', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  assert.throws(
    () => {
      MsgV3.create({
        keypair,
        data: { text: 'Hello world!' },
        domain: 'group/init',
      })
    },
    /invalid domain/,
    'invalid domain if contains /'
  )
})

test('MsgV3 invalid domain with "*" character', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  assert.throws(
    () => {
      MsgV3.create({
        keypair,
        data: { text: 'Hello world!' },
        domain: 'star*',
      })
    },
    /invalid domain/,
    'invalid domain if contains *'
  )
})

test('MsgV3 invalid domain too short', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  assert.throws(
    () => {
      MsgV3.create({
        keypair,
        data: { text: 'Hello world!' },
        domain: 'xy',
      })
    },
    /shorter than 3/,
    'invalid domain if too short'
  )
})

test('MsgV3 invalid domain too long', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  assert.throws(
    () => {
      MsgV3.create({
        keypair,
        data: { text: 'Hello world!' },
        domain: 'a'.repeat(120),
      })
    },
    /100\+ characters long/,
    'invalid domain if too long'
  )
})
