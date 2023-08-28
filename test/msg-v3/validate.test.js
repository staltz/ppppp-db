const test = require('node:test')
const assert = require('node:assert')
const Keypair = require('ppppp-keypair')
const MsgV3 = require('../../lib/msg-v3')

test('validate root msg', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const account = MsgV3.getMsgID(
    MsgV3.createAccount(keypair, 'person', 'alice')
  )
  const pubkeys = new Set([keypair.public])

  const moot = MsgV3.createMoot(account, 'post', keypair)
  const mootID = MsgV3.getMsgID(moot)
  const tangle = new MsgV3.Tangle(mootID)
  tangle.add(mootID, moot)

  const err = MsgV3.validate(moot, tangle, pubkeys, mootID, mootID)
  assert.ifError(err, 'valid root msg')
})

test('validate account tangle', (t) => {
  const pubkeys = new Set()
  const keypair1 = Keypair.generate('ed25519', 'alice')
  pubkeys.add(keypair1.public)

  const accountMsg0 = MsgV3.createAccount(keypair1, 'person', 'alice')
  const account = MsgV3.getMsgID(accountMsg0)
  const accountMsg0ID = account

  const tangle = new MsgV3.Tangle(account)
  tangle.add(accountMsg0ID, accountMsg0)

  let err = MsgV3.validate(
    accountMsg0,
    tangle,
    pubkeys,
    accountMsg0ID,
    account
  )
  assert.ifError(err, 'valid account root msg')

  tangle.add(account, accountMsg0)

  const keypair2 = Keypair.generate('ed25519', 'bob')

  const accountMsg1 = MsgV3.create({
    account: 'self',
    accountTips: null,
    domain: 'account',
    data: { add: keypair2.public },
    tangles: {
      [account]: tangle,
    },
    keypair: keypair1, // announcing keypair2 but signing with keypair1
  })
  const accountMsg1ID = MsgV3.getMsgID(accountMsg1)

  err = MsgV3.validate(
    accountMsg1,
    tangle,
    pubkeys,
    accountMsg1ID,
    account
  )
  assert.ifError(err, 'valid account msg')
})

test('validate 2nd msg with existing root', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const account = MsgV3.getMsgID(
    MsgV3.createAccount(keypair, 'person', 'alice')
  )
  const pubkeys = new Set([keypair.public])

  const moot = MsgV3.createMoot(account, 'post', keypair)
  const mootID = MsgV3.getMsgID(moot)
  const tangle = new MsgV3.Tangle(mootID)
  tangle.add(mootID, moot)

  const msg1 = MsgV3.create({
    account,
    accountTips: [account],
    domain: 'post',
    data: { text: 'Hello world!' },
    tangles: {
      [mootID]: tangle,
    },
    keypair,
  })
  const msgID1 = MsgV3.getMsgID(msg1)
  tangle.add(msgID1, msg1)

  const err = MsgV3.validate(msg1, tangle, pubkeys, msgID1, mootID)
  assert.ifError(err, 'valid 2nd msg')
})

test('validate 2nd forked msg', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const account = MsgV3.getMsgID(
    MsgV3.createAccount(keypair, 'person', 'alice')
  )
  const pubkeys = new Set([keypair.public])

  const moot = MsgV3.createMoot(account, 'post', keypair)
  const mootID = MsgV3.getMsgID(moot)
  const tangle = new MsgV3.Tangle(mootID)
  tangle.add(mootID, moot)

  const msg1A = MsgV3.create({
    account,
    accountTips: [account],
    domain: 'post',
    data: { text: 'Hello world!' },
    tangles: {
      [mootID]: tangle,
    },
    keypair,
  })
  const msgID1A = MsgV3.getMsgID(msg1A)

  const msg1B = MsgV3.create({
    account,
    accountTips: [account],
    domain: 'post',
    data: { text: 'Hello world!' },
    tangles: {
      [mootID]: tangle,
    },
    keypair,
  })
  const msgID1B = MsgV3.getMsgID(msg1B)

  tangle.add(msgID1A, msg1A)
  tangle.add(msgID1B, msg1B)
  const err = MsgV3.validate(msg1B, tangle, pubkeys, msgID1B, mootID)
  assert.ifError(err, 'valid 2nd forked msg')
})
