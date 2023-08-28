const test = require('node:test')
const assert = require('node:assert')
const base58 = require('bs58')
const Keypair = require('ppppp-keypair')
const MsgV3 = require('../../lib/msg-v3')

const keypair = Keypair.generate('ed25519', 'alice')
const account = MsgV3.getMsgID(
  MsgV3.createAccount(keypair, 'person', 'MYNONCE')
)
const pubkeys = new Set([keypair.public])

test('invalid msg with non-array prev', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const moot = MsgV3.createMoot(account, 'post', keypair)
  const mootID = MsgV3.getMsgID(moot)

  const tangle = new MsgV3.Tangle(mootID)
  tangle.add(mootID, moot)

  const msg = MsgV3.create({
    keypair,
    data: { text: 'Hello world!' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [mootID]: tangle,
    },
  })
  msg.metadata.tangles[mootID].prev = null
  const msgID = MsgV3.getMsgID(msg)

  const err = MsgV3.validate(msg, tangle, pubkeys, msgID, mootID)
  assert.ok(err, 'invalid 2nd msg throws')
  assert.match(
    err,
    /prev ".*" should have been an array/,
    'invalid 2nd msg description'
  )
})

test('invalid msg with bad prev', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const moot = MsgV3.createMoot(account, 'post', keypair)
  const mootID = MsgV3.getMsgID(moot)

  const tangle = new MsgV3.Tangle(mootID)
  tangle.add(mootID, moot)

  const msg1 = MsgV3.create({
    keypair,
    data: { text: 'Hello world!' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [mootID]: tangle,
    },
  })
  const msgID1 = MsgV3.getMsgID(msg1)
  tangle.add(msgID1, msg1)

  const msg2 = MsgV3.create({
    keypair,
    data: { text: 'Hello world!' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [mootID]: tangle,
    },
  })
  msg2.metadata.tangles[mootID].depth = 1
  msg2.metadata.tangles[mootID].prev = [1234]
  const msgID2 = MsgV3.getMsgID(msg2)

  const err = MsgV3.validate(msg2, tangle, pubkeys, msgID2, mootID)
  assert.ok(err, 'invalid 2nd msg throws')
  assert.match(
    err,
    /prev item ".*" should have been a string/,
    'invalid 2nd msg description'
  )
})

test('invalid msg with URI in prev', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const moot = MsgV3.createMoot(account, 'post', keypair)
  const mootID = MsgV3.getMsgID(moot)

  const tangle = new MsgV3.Tangle(mootID)
  tangle.add(mootID, moot)

  const msg1 = MsgV3.create({
    keypair,
    data: { text: 'Hello world!' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [mootID]: tangle,
    },
  })
  const msgID1 = MsgV3.getMsgID(msg1)
  tangle.add(msgID1, msg1)

  const msg2 = MsgV3.create({
    keypair,
    data: { text: 'Hello world!' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [mootID]: tangle,
    },
  })
  const msgID2 = MsgV3.getMsgID(msg2)
  const randBuf = Buffer.alloc(16).fill(16)
  const fakeMsgKey1 = `ppppp:message/v3/${base58.encode(randBuf)}`
  msg2.metadata.tangles[mootID].depth = 1
  msg2.metadata.tangles[mootID].prev = [fakeMsgKey1]

  const err = MsgV3.validate(msg2, tangle, pubkeys, msgID2, mootID)
  assert.ok(err, 'invalid 2nd msg throws')
  assert.match(err, /prev item ".*" is a URI/, 'invalid 2nd msg description')
})

test('invalid msg with unknown prev', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const moot = MsgV3.createMoot(account, 'post', keypair)
  const mootID = MsgV3.getMsgID(moot)

  const tangle = new MsgV3.Tangle(mootID)
  tangle.add(mootID, moot)

  const msg1 = MsgV3.create({
    keypair,
    data: { text: 'Hello world!' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [mootID]: tangle,
    },
  })
  const msgID1 = MsgV3.getMsgID(msg1)
  tangle.add(msgID1, msg1)

  const unknownMsg = MsgV3.create({
    keypair,
    data: { text: 'Alien' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [mootID]: tangle,
    },
  })
  const unknownMsgID = MsgV3.getMsgID(unknownMsg)

  const fakeMootID = 'ABCDEabcde' + mootID.substring(10)
  const tangle2 = new MsgV3.Tangle(fakeMootID)
  tangle2.add(fakeMootID, moot)
  tangle2.add(unknownMsgID, unknownMsg)

  const msg2 = MsgV3.create({
    keypair,
    data: { text: 'Hello world!' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [mootID]: tangle2,
    },
  })
  const msgID2 = MsgV3.getMsgID(msg2)

  const err = MsgV3.validate(msg2, tangle, pubkeys, msgID2, mootID)
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

  const accountB = MsgV3.getMsgID(
    MsgV3.createAccount(keypairB, 'person', 'MYNONCE')
  )

  const moot = MsgV3.createMoot(account, 'post', keypair)
  const mootID = MsgV3.getMsgID(moot)
  const feedTangle = new MsgV3.Tangle(mootID)
  feedTangle.add(mootID, moot)

  const msg = MsgV3.create({
    keypair: keypairB,
    data: { text: 'Hello world!' },
    account: accountB,
    accountTips: [accountB],
    domain: 'post',
    tangles: {
      [mootID]: feedTangle,
    },
  })
  const msgID = MsgV3.getMsgID(msg)

  const err = MsgV3.validate(msg, feedTangle, pubkeys, msgID, mootID)
  assert.ok(err, 'invalid msg throws')
  assert.match(
    err,
    /pubkey ".*" should have been one of ".*" from the account ".*"/,
    'invalid msg'
  )
})

test('invalid feed msg with a different domain', (t) => {
  const keypairA = Keypair.generate('ed25519', 'alice')

  const moot = MsgV3.createMoot(account, 'post', keypair)
  const mootID = MsgV3.getMsgID(moot)
  const feedTangle = new MsgV3.Tangle(mootID)
  feedTangle.add(mootID, moot)

  const msg = MsgV3.create({
    keypair: keypairA,
    data: { text: 'Hello world!' },
    account,
    accountTips: [account],
    domain: 'comment',
    tangles: {
      [mootID]: feedTangle,
    },
  })
  const msgID = MsgV3.getMsgID(msg)

  const err = MsgV3.validate(msg, feedTangle, pubkeys, msgID, mootID)
  assert.ok(err, 'invalid msg throws')
  assert.match(
    err,
    /domain "comment" should have been feed domain "post"/,
    'invalid feed msg'
  )
})

test('invalid feed msg with non-alphabetical prev', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const moot = MsgV3.createMoot(account, 'post', keypair)
  const mootID = MsgV3.getMsgID(moot)

  const tangle = new MsgV3.Tangle(mootID)
  tangle.add(mootID, moot)

  const msg1 = MsgV3.create({
    keypair,
    data: { text: '1' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [mootID]: tangle,
    },
  })
  const msgID1 = MsgV3.getMsgID(msg1)

  const msg2 = MsgV3.create({
    keypair,
    data: { text: '2' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [mootID]: tangle,
    },
  })
  const msgID2 = MsgV3.getMsgID(msg2)

  tangle.add(msgID1, msg1)
  tangle.add(msgID2, msg2)

  const msg3 = MsgV3.create({
    keypair,
    data: { text: '3' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [mootID]: tangle,
    },
  })
  const msgID3 = MsgV3.getMsgID(msg3)

  let prevMsgIDs = msg3.metadata.tangles[mootID].prev
  if (prevMsgIDs[0] < prevMsgIDs[1]) {
    prevMsgIDs = [prevMsgIDs[1], prevMsgIDs[0]]
  } else {
    prevMsgIDs = [prevMsgIDs[0], prevMsgIDs[1]]
  }
  msg3.metadata.tangles[mootID].prev = prevMsgIDs

  const err = MsgV3.validate(msg3, tangle, pubkeys, msgID3, mootID)
  assert.ok(err, 'invalid 3rd msg throws')
  assert.match(
    err,
    /prev ".*" should have been alphabetically sorted/,
    'invalid error message'
  )
})

test('invalid feed msg with duplicate prev', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const moot = MsgV3.createMoot(account, 'post', keypair)
  const mootID = MsgV3.getMsgID(moot)

  const tangle = new MsgV3.Tangle(mootID)
  tangle.add(mootID, moot)

  const msg1 = MsgV3.create({
    keypair,
    data: { text: '1' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [mootID]: tangle,
    },
  })
  const msgID1 = MsgV3.getMsgID(msg1)

  const [prevID] = msg1.metadata.tangles[mootID].prev
  msg1.metadata.tangles[mootID].prev = [prevID, prevID]

  const err = MsgV3.validate(msg1, tangle, pubkeys, msgID1, mootID)
  assert.ok(err, 'invalid 1st msg throws')
  assert.match(err, /prev ".*" contains duplicates/, 'invalid error message')
})
