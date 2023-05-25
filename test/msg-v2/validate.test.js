const tape = require('tape')
const MsgV2 = require('../../lib/msg-v2')
const { generateKeypair } = require('../util')

tape('validate root msg', (t) => {
  const keys = generateKeypair('alice')
  const group = MsgV2.getMsgHash(MsgV2.createGroup(keys, 'alice'))
  const pubkeys = new Set([keys.id])

  const rootMsg = MsgV2.createRoot(group, 'post', keys)
  const rootHash = MsgV2.getMsgHash(rootMsg)
  const tangle = new MsgV2.Tangle(rootHash)

  const err = MsgV2.validate(rootMsg, tangle, pubkeys, rootHash, rootHash)
  if (err) console.log(err)
  t.error(err, 'valid root msg')
  t.end()
})

tape('validate group tangle', (t) => {
  const pubkeys = new Set()
  const keys1 = generateKeypair('alice')
  pubkeys.add(keys1.id)

  const groupMsg0 = MsgV2.createGroup(keys1, 'alice')
  const group = MsgV2.getMsgHash(groupMsg0)
  const groupMsg0Hash = group

  const tangle = new MsgV2.Tangle(group)

  let err = MsgV2.validate(groupMsg0, tangle, pubkeys, groupMsg0Hash, group)
  if (err) console.log(err)
  t.error(err, 'valid group root msg')

  tangle.add(group, groupMsg0)

  const keys2 = generateKeypair('bob')

  const groupMsg1 = MsgV2.create({
    group: null,
    groupTips: null,
    type: 'group',
    data: { add: keys2.id },
    tangles: {
      [group]: tangle,
    },
    keys: keys1, // announcing keys2 but signing with keys1
  })
  const groupMsg1Hash = MsgV2.getMsgHash(groupMsg1)

  err = MsgV2.validate(groupMsg1, tangle, pubkeys, groupMsg1Hash, group)
  if (err) console.log(err)
  t.error(err, 'valid group msg')
  t.end()
})

tape('validate 2nd msg with existing root', (t) => {
  const keys = generateKeypair('alice')
  const group = MsgV2.getMsgHash(MsgV2.createGroup(keys, 'alice'))
  const pubkeys = new Set([keys.id])

  const rootMsg = MsgV2.createRoot(group, 'post', keys)
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
    keys,
  })
  const msgHash1 = MsgV2.getMsgHash(msg1)
  tangle.add(msgHash1, msg1)

  const err = MsgV2.validate(msg1, tangle, pubkeys, msgHash1, rootHash)
  if (err) console.log(err)
  t.error(err, 'valid 2nd msg')
  t.end()
})

tape('validate 2nd forked msg', (t) => {
  const keys = generateKeypair('alice')
  const group = MsgV2.getMsgHash(MsgV2.createGroup(keys, 'alice'))
  const pubkeys = new Set([keys.id])

  const rootMsg = MsgV2.createRoot(group, 'post', keys)
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
    keys,
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
    keys,
  })
  const msgHash1B = MsgV2.getMsgHash(msg1B)

  tangle.add(msgHash1A, msg1A)
  tangle.add(msgHash1B, msg1B)
  const err = MsgV2.validate(msg1B, tangle, pubkeys, msgHash1B, rootHash)
  if (err) console.log(err)
  t.error(err, 'valid 2nd forked msg')
  t.end()
})