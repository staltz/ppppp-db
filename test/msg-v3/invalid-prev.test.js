const test = require('node:test')
const assert = require('node:assert')
const base58 = require('bs58')
const Keypair = require('ppppp-keypair')
const MsgV3 = require('../../lib/msg-v3')

const keypair = Keypair.generate('ed25519', 'alice')
const account = MsgV3.getMsgHash(
  MsgV3.createAccount(keypair, 'person', 'MYNONCE')
)
const pubkeys = new Set([keypair.public])

test('invalid msg with non-array prev', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const rootMsg = MsgV3.createRoot(account, 'post', keypair)
  const rootHash = MsgV3.getMsgHash(rootMsg)

  const tangle = new MsgV3.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg = MsgV3.create({
    keypair,
    data: { text: 'Hello world!' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  msg.metadata.tangles[rootHash].prev = null
  const msgHash = MsgV3.getMsgHash(msg)

  const err = MsgV3.validate(msg, tangle, pubkeys, msgHash, rootHash)
  assert.ok(err, 'invalid 2nd msg throws')
  assert.match(
    err,
    /prev ".*" should have been an array/,
    'invalid 2nd msg description'
  )
})

test('invalid msg with bad prev', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const rootMsg = MsgV3.createRoot(account, 'post', keypair)
  const rootHash = MsgV3.getMsgHash(rootMsg)

  const tangle = new MsgV3.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = MsgV3.create({
    keypair,
    data: { text: 'Hello world!' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash1 = MsgV3.getMsgHash(msg1)
  tangle.add(msgHash1, msg1)

  const msg2 = MsgV3.create({
    keypair,
    data: { text: 'Hello world!' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  msg2.metadata.tangles[rootHash].depth = 1
  msg2.metadata.tangles[rootHash].prev = [1234]
  const msgHash2 = MsgV3.getMsgHash(msg2)

  const err = MsgV3.validate(msg2, tangle, pubkeys, msgHash2, rootHash)
  assert.ok(err, 'invalid 2nd msg throws')
  assert.match(
    err,
    /prev item ".*" should have been a string/,
    'invalid 2nd msg description'
  )
})

test('invalid msg with URI in prev', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const rootMsg = MsgV3.createRoot(account, 'post', keypair)
  const rootHash = MsgV3.getMsgHash(rootMsg)

  const tangle = new MsgV3.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = MsgV3.create({
    keypair,
    data: { text: 'Hello world!' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash1 = MsgV3.getMsgHash(msg1)
  tangle.add(msgHash1, msg1)

  const msg2 = MsgV3.create({
    keypair,
    data: { text: 'Hello world!' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash2 = MsgV3.getMsgHash(msg2)
  const randBuf = Buffer.alloc(16).fill(16)
  const fakeMsgKey1 = `ppppp:message/v3/${base58.encode(randBuf)}`
  msg2.metadata.tangles[rootHash].depth = 1
  msg2.metadata.tangles[rootHash].prev = [fakeMsgKey1]

  const err = MsgV3.validate(msg2, tangle, pubkeys, msgHash2, rootHash)
  assert.ok(err, 'invalid 2nd msg throws')
  assert.match(err, /prev item ".*" is a URI/, 'invalid 2nd msg description')
})

test('invalid msg with unknown prev', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const rootMsg = MsgV3.createRoot(account, 'post', keypair)
  const rootHash = MsgV3.getMsgHash(rootMsg)

  const tangle = new MsgV3.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = MsgV3.create({
    keypair,
    data: { text: 'Hello world!' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash1 = MsgV3.getMsgHash(msg1)
  tangle.add(msgHash1, msg1)

  const unknownMsg = MsgV3.create({
    keypair,
    data: { text: 'Alien' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const unknownMsgHash = MsgV3.getMsgHash(unknownMsg)

  const fakeRootHash = 'ABCDEabcde' + rootHash.substring(10)
  const tangle2 = new MsgV3.Tangle(fakeRootHash)
  tangle2.add(fakeRootHash, rootMsg)
  tangle2.add(unknownMsgHash, unknownMsg)

  const msg2 = MsgV3.create({
    keypair,
    data: { text: 'Hello world!' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [rootHash]: tangle2,
    },
  })
  const msgHash2 = MsgV3.getMsgHash(msg2)

  const err = MsgV3.validate(msg2, tangle, pubkeys, msgHash2, rootHash)
  assert.ok(err, 'invalid 2nd msg throws')
  assert.match(
    err,
    /all prev are locally unknown/,
    'invalid 2nd msg description'
  )
})

test('invalid feed msg with a different pubkey', (t) => {
  const keypairA = Keypair.generate('ed25519', 'alice')
  const keypairB = Keypair.generate('ed25519', 'bob')

  const accountB = MsgV3.getMsgHash(
    MsgV3.createAccount(keypairB, 'person', 'MYNONCE')
  )

  const rootMsg = MsgV3.createRoot(account, 'post', keypair)
  const rootHash = MsgV3.getMsgHash(rootMsg)
  const feedTangle = new MsgV3.Tangle(rootHash)
  feedTangle.add(rootHash, rootMsg)

  const msg = MsgV3.create({
    keypair: keypairB,
    data: { text: 'Hello world!' },
    account: accountB,
    accountTips: [accountB],
    domain: 'post',
    tangles: {
      [rootHash]: feedTangle,
    },
  })
  const msgHash = MsgV3.getMsgHash(msg)

  const err = MsgV3.validate(msg, feedTangle, pubkeys, msgHash, rootHash)
  assert.ok(err, 'invalid msg throws')
  assert.match(
    err,
    /pubkey ".*" should have been one of ".*" from the account ".*"/,
    'invalid msg'
  )
})

test('invalid feed msg with a different domain', (t) => {
  const keypairA = Keypair.generate('ed25519', 'alice')

  const rootMsg = MsgV3.createRoot(account, 'post', keypair)
  const rootHash = MsgV3.getMsgHash(rootMsg)
  const feedTangle = new MsgV3.Tangle(rootHash)
  feedTangle.add(rootHash, rootMsg)

  const msg = MsgV3.create({
    keypair: keypairA,
    data: { text: 'Hello world!' },
    account,
    accountTips: [account],
    domain: 'comment',
    tangles: {
      [rootHash]: feedTangle,
    },
  })
  const msgHash = MsgV3.getMsgHash(msg)

  const err = MsgV3.validate(msg, feedTangle, pubkeys, msgHash, rootHash)
  assert.ok(err, 'invalid msg throws')
  assert.match(
    err,
    /domain "comment" should have been feed domain "post"/,
    'invalid feed msg'
  )
})

test('invalid feed msg with non-alphabetical prev', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const rootMsg = MsgV3.createRoot(account, 'post', keypair)
  const rootHash = MsgV3.getMsgHash(rootMsg)

  const tangle = new MsgV3.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = MsgV3.create({
    keypair,
    data: { text: '1' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash1 = MsgV3.getMsgHash(msg1)

  const msg2 = MsgV3.create({
    keypair,
    data: { text: '2' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash2 = MsgV3.getMsgHash(msg2)

  tangle.add(msgHash1, msg1)
  tangle.add(msgHash2, msg2)

  const msg3 = MsgV3.create({
    keypair,
    data: { text: '3' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash3 = MsgV3.getMsgHash(msg3)

  let prevHashes = msg3.metadata.tangles[rootHash].prev
  if (prevHashes[0] < prevHashes[1]) {
    prevHashes = [prevHashes[1], prevHashes[0]]
  } else {
    prevHashes = [prevHashes[0], prevHashes[1]]
  }
  msg3.metadata.tangles[rootHash].prev = prevHashes

  const err = MsgV3.validate(msg3, tangle, pubkeys, msgHash3, rootHash)
  assert.ok(err, 'invalid 3rd msg throws')
  assert.match(
    err,
    /prev ".*" should have been alphabetically sorted/,
    'invalid error message'
  )
})

test('invalid feed msg with duplicate prev', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const rootMsg = MsgV3.createRoot(account, 'post', keypair)
  const rootHash = MsgV3.getMsgHash(rootMsg)

  const tangle = new MsgV3.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = MsgV3.create({
    keypair,
    data: { text: '1' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash1 = MsgV3.getMsgHash(msg1)

  const [prevHash] = msg1.metadata.tangles[rootHash].prev
  msg1.metadata.tangles[rootHash].prev = [prevHash, prevHash]

  const err = MsgV3.validate(msg1, tangle, pubkeys, msgHash1, rootHash)
  assert.ok(err, 'invalid 1st msg throws')
  assert.match(err, /prev ".*" contains duplicates/, 'invalid error message')
})
