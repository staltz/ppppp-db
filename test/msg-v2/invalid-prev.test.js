const tape = require('tape')
const base58 = require('bs58')
const Keypair = require('ppppp-keypair')
const MsgV2 = require('../../lib/msg-v2')

const keypair = Keypair.generate('ed25519', 'alice')
const group = MsgV2.getMsgHash(MsgV2.createGroup(keypair, 'MYNONCE'))
const pubkeys = new Set([keypair.public])

tape('invalid msg with non-array prev', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const rootMsg = MsgV2.createRoot(group, 'post', keypair)
  const rootHash = MsgV2.getMsgHash(rootMsg)

  const tangle = new MsgV2.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg = MsgV2.create({
    keypair,
    data: { text: 'Hello world!' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  msg.metadata.tangles[rootHash].prev = null
  const msgHash = MsgV2.getMsgHash(msg)

  const err = MsgV2.validate(msg, tangle, pubkeys, msgHash, rootHash)
  t.ok(err, 'invalid 2nd msg throws')
  t.match(
    err,
    /prev ".*" should have been an array/,
    'invalid 2nd msg description'
  )
  t.end()
})

tape('invalid msg with bad prev', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const rootMsg = MsgV2.createRoot(group, 'post', keypair)
  const rootHash = MsgV2.getMsgHash(rootMsg)

  const tangle = new MsgV2.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = MsgV2.create({
    keypair,
    data: { text: 'Hello world!' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash1 = MsgV2.getMsgHash(msg1)
  tangle.add(msgHash1, msg1)

  const msg2 = MsgV2.create({
    keypair,
    data: { text: 'Hello world!' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  msg2.metadata.tangles[rootHash].depth = 1
  msg2.metadata.tangles[rootHash].prev = [1234]
  const msgHash2 = MsgV2.getMsgHash(msg2)

  const err = MsgV2.validate(msg2, tangle, pubkeys, msgHash2, rootHash)
  t.ok(err, 'invalid 2nd msg throws')
  t.match(
    err,
    /prev item ".*" should have been a string/,
    'invalid 2nd msg description'
  )
  t.end()
})

tape('invalid msg with URI in prev', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const rootMsg = MsgV2.createRoot(group, 'post', keypair)
  const rootHash = MsgV2.getMsgHash(rootMsg)

  const tangle = new MsgV2.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = MsgV2.create({
    keypair,
    data: { text: 'Hello world!' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash1 = MsgV2.getMsgHash(msg1)
  tangle.add(msgHash1, msg1)

  const msg2 = MsgV2.create({
    keypair,
    data: { text: 'Hello world!' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash2 = MsgV2.getMsgHash(msg2)
  const randBuf = Buffer.alloc(16).fill(16)
  const fakeMsgKey1 = `ppppp:message/v2/${base58.encode(randBuf)}`
  msg2.metadata.tangles[rootHash].depth = 1
  msg2.metadata.tangles[rootHash].prev = [fakeMsgKey1]

  const err = MsgV2.validate(msg2, tangle, pubkeys, msgHash2, rootHash)
  t.ok(err, 'invalid 2nd msg throws')
  t.match(err, /prev item ".*" is a URI/, 'invalid 2nd msg description')
  t.end()
})

tape('invalid msg with unknown prev', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const rootMsg = MsgV2.createRoot(group, 'post', keypair)
  const rootHash = MsgV2.getMsgHash(rootMsg)

  const tangle = new MsgV2.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = MsgV2.create({
    keypair,
    data: { text: 'Hello world!' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash1 = MsgV2.getMsgHash(msg1)
  tangle.add(msgHash1, msg1)

  const unknownMsg = MsgV2.create({
    keypair,
    data: { text: 'Alien' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const unknownMsgHash = MsgV2.getMsgHash(unknownMsg)

  const fakeRootHash = 'ABCDEabcde' + rootHash.substring(10)
  const tangle2 = new MsgV2.Tangle(fakeRootHash)
  tangle2.add(fakeRootHash, rootMsg)
  tangle2.add(unknownMsgHash, unknownMsg)

  const msg2 = MsgV2.create({
    keypair,
    data: { text: 'Hello world!' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle2,
    },
  })
  const msgHash2 = MsgV2.getMsgHash(msg2)

  const err = MsgV2.validate(msg2, tangle, pubkeys, msgHash2, rootHash)
  t.ok(err, 'invalid 2nd msg throws')
  t.match(err, /all prev are locally unknown/, 'invalid 2nd msg description')
  t.end()
})

tape('invalid feed msg with a different pubkey', (t) => {
  const keypairA = Keypair.generate('ed25519', 'alice')
  const keypairB = Keypair.generate('ed25519', 'bob')

  const groupB = MsgV2.getMsgHash(MsgV2.createGroup(keypairB, 'MYNONCE'))

  const rootMsg = MsgV2.createRoot(group, 'post', keypair)
  const rootHash = MsgV2.getMsgHash(rootMsg)
  const feedTangle = new MsgV2.Tangle(rootHash)
  feedTangle.add(rootHash, rootMsg)

  const msg = MsgV2.create({
    keypair: keypairB,
    data: { text: 'Hello world!' },
    group: groupB,
    groupTips: [groupB],
    type: 'post',
    tangles: {
      [rootHash]: feedTangle,
    },
  })
  const msgHash = MsgV2.getMsgHash(msg)

  const err = MsgV2.validate(msg, feedTangle, pubkeys, msgHash, rootHash)
  t.match(
    err,
    /pubkey ".*" should have been one of ".*" from the group ".*"/,
    'invalid msg'
  )
  t.end()
})

tape('invalid feed msg with a different type', (t) => {
  const keypairA = Keypair.generate('ed25519', 'alice')

  const rootMsg = MsgV2.createRoot(group, 'post', keypair)
  const rootHash = MsgV2.getMsgHash(rootMsg)
  const feedTangle = new MsgV2.Tangle(rootHash)
  feedTangle.add(rootHash, rootMsg)

  const msg = MsgV2.create({
    keypair: keypairA,
    data: { text: 'Hello world!' },
    group,
    groupTips: [group],
    type: 'comment',
    tangles: {
      [rootHash]: feedTangle,
    },
  })
  const msgHash = MsgV2.getMsgHash(msg)

  const err = MsgV2.validate(msg, feedTangle, pubkeys, msgHash, rootHash)
  t.match(
    err,
    /type "comment" should have been feed type "post"/,
    'invalid feed msg'
  )
  t.end()
})

tape('invalid feed msg with non-alphabetical prev', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const rootMsg = MsgV2.createRoot(group, 'post', keypair)
  const rootHash = MsgV2.getMsgHash(rootMsg)

  const tangle = new MsgV2.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = MsgV2.create({
    keypair,
    data: { text: '1' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash1 = MsgV2.getMsgHash(msg1)

  const msg2 = MsgV2.create({
    keypair,
    data: { text: '2' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash2 = MsgV2.getMsgHash(msg2)

  tangle.add(msgHash1, msg1)
  tangle.add(msgHash2, msg2)

  const msg3 = MsgV2.create({
    keypair,
    data: { text: '3' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash3 = MsgV2.getMsgHash(msg3)

  let prevHashes = msg3.metadata.tangles[rootHash].prev
  if (prevHashes[0] < prevHashes[1]) {
    prevHashes = [prevHashes[1], prevHashes[0]]
  } else {
    prevHashes = [prevHashes[0], prevHashes[1]]
  }
  msg3.metadata.tangles[rootHash].prev = prevHashes

  const err = MsgV2.validate(msg3, tangle, pubkeys, msgHash3, rootHash)
  t.ok(err, 'invalid 3rd msg throws')
  t.match(
    err,
    /prev ".*" should have been alphabetically sorted/,
    'invalid error message'
  )
  t.end()
})

tape('invalid feed msg with duplicate prev', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const rootMsg = MsgV2.createRoot(group, 'post', keypair)
  const rootHash = MsgV2.getMsgHash(rootMsg)

  const tangle = new MsgV2.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = MsgV2.create({
    keypair,
    data: { text: '1' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash1 = MsgV2.getMsgHash(msg1)

  const [prevHash] = msg1.metadata.tangles[rootHash].prev
  msg1.metadata.tangles[rootHash].prev = [prevHash, prevHash]

  const err = MsgV2.validate(msg1, tangle, pubkeys, msgHash1, rootHash)
  t.ok(err, 'invalid 1st msg throws')
  t.match(err, /prev ".*" contains duplicates/, 'invalid error message')
  t.end()
})
