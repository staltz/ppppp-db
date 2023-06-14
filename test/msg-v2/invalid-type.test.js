const tape = require('tape')
const Keypair = require('ppppp-keypair')
const MsgV2 = require('../../lib/msg-v2')

tape('invalid type not a string', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  t.throws(
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
  t.end()
})

tape('invalid type with "/" character', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  t.throws(
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
  t.end()
})

tape('invalid type with "*" character', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  t.throws(
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
  t.end()
})

tape('invalid type too short', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  t.throws(
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
  t.end()
})

tape('invalid type too long', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  t.throws(
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

  t.end()
})
