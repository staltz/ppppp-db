const test = require('node:test')
const assert = require('node:assert')
const Keypair = require('ppppp-keypair')
const MsgV3 = require('../../lib/msg-v3')

test('validate root msg', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const identity = MsgV3.getMsgHash(
    MsgV3.createIdentity(keypair, 'person', 'alice')
  )
  const pubkeys = new Set([keypair.public])

  const rootMsg = MsgV3.createRoot(identity, 'post', keypair)
  const rootHash = MsgV3.getMsgHash(rootMsg)
  const tangle = new MsgV3.Tangle(rootHash)

  const err = MsgV3.validate(rootMsg, tangle, pubkeys, rootHash, rootHash)
  assert.ifError(err, 'valid root msg')
})

test('validate identity tangle', (t) => {
  const pubkeys = new Set()
  const keypair1 = Keypair.generate('ed25519', 'alice')
  pubkeys.add(keypair1.public)

  const identityMsg0 = MsgV3.createIdentity(keypair1, 'person', 'alice')
  const identity = MsgV3.getMsgHash(identityMsg0)
  const identityMsg0Hash = identity

  const tangle = new MsgV3.Tangle(identity)

  let err = MsgV3.validate(
    identityMsg0,
    tangle,
    pubkeys,
    identityMsg0Hash,
    identity
  )
  assert.ifError(err, 'valid identity root msg')

  tangle.add(identity, identityMsg0)

  const keypair2 = Keypair.generate('ed25519', 'bob')

  const identityMsg1 = MsgV3.create({
    identity: 'self',
    identityTips: null,
    domain: 'identity',
    data: { add: keypair2.public },
    tangles: {
      [identity]: tangle,
    },
    keypair: keypair1, // announcing keypair2 but signing with keypair1
  })
  const identityMsg1Hash = MsgV3.getMsgHash(identityMsg1)

  err = MsgV3.validate(
    identityMsg1,
    tangle,
    pubkeys,
    identityMsg1Hash,
    identity
  )
  assert.ifError(err, 'valid identity msg')
})

test('validate 2nd msg with existing root', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const identity = MsgV3.getMsgHash(
    MsgV3.createIdentity(keypair, 'person', 'alice')
  )
  const pubkeys = new Set([keypair.public])

  const rootMsg = MsgV3.createRoot(identity, 'post', keypair)
  const rootHash = MsgV3.getMsgHash(rootMsg)
  const tangle = new MsgV3.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = MsgV3.create({
    identity,
    identityTips: [identity],
    domain: 'post',
    data: { text: 'Hello world!' },
    tangles: {
      [rootHash]: tangle,
    },
    keypair,
  })
  const msgHash1 = MsgV3.getMsgHash(msg1)
  tangle.add(msgHash1, msg1)

  const err = MsgV3.validate(msg1, tangle, pubkeys, msgHash1, rootHash)
  assert.ifError(err, 'valid 2nd msg')
})

test('validate 2nd forked msg', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const identity = MsgV3.getMsgHash(
    MsgV3.createIdentity(keypair, 'person', 'alice')
  )
  const pubkeys = new Set([keypair.public])

  const rootMsg = MsgV3.createRoot(identity, 'post', keypair)
  const rootHash = MsgV3.getMsgHash(rootMsg)
  const tangle = new MsgV3.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1A = MsgV3.create({
    identity,
    identityTips: [identity],
    domain: 'post',
    data: { text: 'Hello world!' },
    tangles: {
      [rootHash]: tangle,
    },
    keypair,
  })
  const msgHash1A = MsgV3.getMsgHash(msg1A)

  const msg1B = MsgV3.create({
    identity,
    identityTips: [identity],
    domain: 'post',
    data: { text: 'Hello world!' },
    tangles: {
      [rootHash]: tangle,
    },
    keypair,
  })
  const msgHash1B = MsgV3.getMsgHash(msg1B)

  tangle.add(msgHash1A, msg1A)
  tangle.add(msgHash1B, msg1B)
  const err = MsgV3.validate(msg1B, tangle, pubkeys, msgHash1B, rootHash)
  assert.ifError(err, 'valid 2nd forked msg')
})
