const test = require('node:test')
const assert = require('node:assert')
const Keypair = require('ppppp-keypair')
const MsgV4 = require('../../lib/msg-v4')

test('MsgV4 domain validation', async (t) => {
  await t.test('Not a string', (t) => {
    const keypair = Keypair.generate('ed25519', 'alice')

    assert.throws(
      () => {
        MsgV4.create({
          keypair,
          data: { text: 'Hello world!' },
          domain: 123,
        })
      },
      /invalid domain/,
      'not a string'
    )
  })

  await t.test('"/" character', (t) => {
    const keypair = Keypair.generate('ed25519', 'alice')

    assert.throws(
      () => {
        MsgV4.create({
          keypair,
          data: { text: 'Hello world!' },
          domain: 'group/init',
        })
      },
      /invalid domain/,
      'invalid domain if contains /'
    )
  })

  await t.test('"*" character', (t) => {
    const keypair = Keypair.generate('ed25519', 'alice')

    assert.throws(
      () => {
        MsgV4.create({
          keypair,
          data: { text: 'Hello world!' },
          domain: 'star*',
        })
      },
      /invalid domain/,
      'invalid domain if contains *'
    )
  })

  await t.test('Too short', (t) => {
    const keypair = Keypair.generate('ed25519', 'alice')

    assert.throws(
      () => {
        MsgV4.create({
          keypair,
          data: { text: 'Hello world!' },
          domain: 'xy',
        })
      },
      /shorter than 3/,
      'invalid domain if too short'
    )
  })

  await t.test('too long', (t) => {
    const keypair = Keypair.generate('ed25519', 'alice')

    assert.throws(
      () => {
        MsgV4.create({
          keypair,
          data: { text: 'Hello world!' },
          domain: 'a'.repeat(120),
        })
      },
      /100\+ characters long/,
      'invalid domain if too long'
    )
  })
})
