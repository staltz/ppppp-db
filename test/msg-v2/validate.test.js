const test = require('node:test')
const assert = require('node:assert')
const Keypair = require('ppppp-keypair')
const MsgV2 = require('../../lib/msg-v2')

test('validate root msg', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const group = MsgV2.getMsgHash(MsgV2.createGroup(keypair, 'alice'))
  const pubkeys = new Set([keypair.public])

  const rootMsg = MsgV2.createRoot(group, 'post', keypair)
  const rootHash = MsgV2.getMsgHash(rootMsg)
  const tangle = new MsgV2.Tangle(rootHash)

  const err = MsgV2.validate(rootMsg, tangle, pubkeys, rootHash, rootHash)
  assert.ifError(err, 'valid root msg')
})

test('validate group tangle', (t) => {
  const pubkeys = new Set()
  const keypair1 = Keypair.generate('ed25519', 'alice')
  pubkeys.add(keypair1.public)

  const groupMsg0 = MsgV2.createGroup(keypair1, 'alice')
  const group = MsgV2.getMsgHash(groupMsg0)
  const groupMsg0Hash = group

  const tangle = new MsgV2.Tangle(group)

  let err = MsgV2.validate(groupMsg0, tangle, pubkeys, groupMsg0Hash, group)
  assert.ifError(err, 'valid group root msg')

  tangle.add(group, groupMsg0)

  const keypair2 = Keypair.generate('ed25519', 'bob')

  const groupMsg1 = MsgV2.create({
    group: null,
    groupTips: null,
    type: 'group',
    data: { add: keypair2.public },
    tangles: {
      [group]: tangle,
    },
    keypair: keypair1, // announcing keypair2 but signing with keypair1
  })
  const groupMsg1Hash = MsgV2.getMsgHash(groupMsg1)

  err = MsgV2.validate(groupMsg1, tangle, pubkeys, groupMsg1Hash, group)
  assert.ifError(err, 'valid group msg')
})

test('validate 2nd msg with existing root', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const group = MsgV2.getMsgHash(MsgV2.createGroup(keypair, 'alice'))
  const pubkeys = new Set([keypair.public])

  const rootMsg = MsgV2.createRoot(group, 'post', keypair)
  const rootHash = MsgV2.getMsgHash(rootMsg)
  const tangle = new MsgV2.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = MsgV2.create({
    group,
    groupTips: [group],
    type: 'post',
    data: { text: 'Hello world!' },
    tangles: {
      [rootHash]: tangle,
    },
    keypair,
  })
  const msgHash1 = MsgV2.getMsgHash(msg1)
  tangle.add(msgHash1, msg1)

  const err = MsgV2.validate(msg1, tangle, pubkeys, msgHash1, rootHash)
  assert.ifError(err, 'valid 2nd msg')
})

test('validate 2nd forked msg', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const group = MsgV2.getMsgHash(MsgV2.createGroup(keypair, 'alice'))
  const pubkeys = new Set([keypair.public])

  const rootMsg = MsgV2.createRoot(group, 'post', keypair)
  const rootHash = MsgV2.getMsgHash(rootMsg)
  const tangle = new MsgV2.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1A = MsgV2.create({
    group,
    groupTips: [group],
    type: 'post',
    data: { text: 'Hello world!' },
    tangles: {
      [rootHash]: tangle,
    },
    keypair,
  })
  const msgHash1A = MsgV2.getMsgHash(msg1A)

  const msg1B = MsgV2.create({
    group,
    groupTips: [group],
    type: 'post',
    data: { text: 'Hello world!' },
    tangles: {
      [rootHash]: tangle,
    },
    keypair,
  })
  const msgHash1B = MsgV2.getMsgHash(msg1B)

  tangle.add(msgHash1A, msg1A)
  tangle.add(msgHash1B, msg1B)
  const err = MsgV2.validate(msg1B, tangle, pubkeys, msgHash1B, rootHash)
  assert.ifError(err, 'valid 2nd forked msg')
})
