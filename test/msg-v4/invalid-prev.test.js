const test = require('node:test')
const assert = require('node:assert')
const base58 = require('bs58')
const Keypair = require('ppppp-keypair')
const MsgV4 = require('../../lib/msg-v4')

const keypair = Keypair.generate('ed25519', 'alice')
const account = MsgV4.getMsgID(
  MsgV4.createAccount(keypair, 'person', 'MYNONCE')
)
const sigkeys = new Set([keypair.public])

test('MsgV4 tangles prev validation', async (t) => {
  await t.test('Non-array is a bad prev', (t) => {
    const keypair = Keypair.generate('ed25519', 'alice')

    const moot = MsgV4.createMoot(account, 'post', keypair)
    const mootID = MsgV4.getMsgID(moot)

    const tangle = new MsgV4.Tangle(mootID)
    tangle.add(mootID, moot)

    const msg = MsgV4.create({
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
    const msgID = MsgV4.getMsgID(msg)

    const err = MsgV4.validate(msg, tangle, sigkeys, msgID, mootID)
    assert.ok(err, 'invalid 2nd msg throws')
    assert.match(
      err,
      /prev ".*" should have been an array/,
      'invalid 2nd msg description'
    )
  })

  await t.test('Number not allowed in prev', (t) => {
    const keypair = Keypair.generate('ed25519', 'alice')

    const moot = MsgV4.createMoot(account, 'post', keypair)
    const mootID = MsgV4.getMsgID(moot)

    const tangle = new MsgV4.Tangle(mootID)
    tangle.add(mootID, moot)

    const msg1 = MsgV4.create({
      keypair,
      data: { text: 'Hello world!' },
      account,
      accountTips: [account],
      domain: 'post',
      tangles: {
        [mootID]: tangle,
      },
    })
    const msgID1 = MsgV4.getMsgID(msg1)
    tangle.add(msgID1, msg1)

    const msg2 = MsgV4.create({
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
    const msgID2 = MsgV4.getMsgID(msg2)

    const err = MsgV4.validate(msg2, tangle, sigkeys, msgID2, mootID)
    assert.ok(err, 'invalid 2nd msg throws')
    assert.match(
      err,
      /prev item ".*" should have been a string/,
      'invalid 2nd msg description'
    )
  })

  await t.test('URI not allowed in prev', (t) => {
    const keypair = Keypair.generate('ed25519', 'alice')

    const moot = MsgV4.createMoot(account, 'post', keypair)
    const mootID = MsgV4.getMsgID(moot)

    const tangle = new MsgV4.Tangle(mootID)
    tangle.add(mootID, moot)

    const msg1 = MsgV4.create({
      keypair,
      data: { text: 'Hello world!' },
      account,
      accountTips: [account],
      domain: 'post',
      tangles: {
        [mootID]: tangle,
      },
    })
    const msgID1 = MsgV4.getMsgID(msg1)
    tangle.add(msgID1, msg1)

    const msg2 = MsgV4.create({
      keypair,
      data: { text: 'Hello world!' },
      account,
      accountTips: [account],
      domain: 'post',
      tangles: {
        [mootID]: tangle,
      },
    })
    const msgID2 = MsgV4.getMsgID(msg2)
    const randBuf = Buffer.alloc(16).fill(16)
    const fakeMsgKey1 = `ppppp:message/v4/${base58.encode(randBuf)}`
    msg2.metadata.tangles[mootID].depth = 1
    msg2.metadata.tangles[mootID].prev = [fakeMsgKey1]

    const err = MsgV4.validate(msg2, tangle, sigkeys, msgID2, mootID)
    assert.ok(err, 'invalid 2nd msg throws')
    assert.match(err, /prev item ".*" is a URI/, 'invalid 2nd msg description')
  })

  await t.test('Locally unknown prev msgID', (t) => {
    const keypair = Keypair.generate('ed25519', 'alice')

    const moot = MsgV4.createMoot(account, 'post', keypair)
    const mootID = MsgV4.getMsgID(moot)

    const tangle = new MsgV4.Tangle(mootID)
    tangle.add(mootID, moot)

    const msg1 = MsgV4.create({
      keypair,
      data: { text: 'Hello world!' },
      account,
      accountTips: [account],
      domain: 'post',
      tangles: {
        [mootID]: tangle,
      },
    })
    const msgID1 = MsgV4.getMsgID(msg1)
    tangle.add(msgID1, msg1)

    const unknownMsg = MsgV4.create({
      keypair,
      data: { text: 'Alien' },
      account,
      accountTips: [account],
      domain: 'post',
      tangles: {
        [mootID]: tangle,
      },
    })
    const unknownMsgID = MsgV4.getMsgID(unknownMsg)

    const fakeMootID = 'ABCDEabcde' + mootID.substring(10)
    const tangle2 = new MsgV4.Tangle(fakeMootID)
    tangle2.add(fakeMootID, moot)
    tangle2.add(unknownMsgID, unknownMsg)

    const msg2 = MsgV4.create({
      keypair,
      data: { text: 'Hello world!' },
      account,
      accountTips: [account],
      domain: 'post',
      tangles: {
        [mootID]: tangle2,
      },
    })
    const msgID2 = MsgV4.getMsgID(msg2)

    const err = MsgV4.validate(msg2, tangle, sigkeys, msgID2, mootID)
    assert.ok(err, 'invalid 2nd msg throws')
    assert.match(
      err,
      /all prev are locally unknown/,
      'invalid 2nd msg description'
    )
  })

  await t.test('Feed msg with the wrong sigkey', (t) => {
    const keypairA = Keypair.generate('ed25519', 'alice')
    const keypairB = Keypair.generate('ed25519', 'bob')

    const accountB = MsgV4.getMsgID(
      MsgV4.createAccount(keypairB, 'person', 'MYNONCE')
    )

    const moot = MsgV4.createMoot(account, 'post', keypair)
    const mootID = MsgV4.getMsgID(moot)
    const feedTangle = new MsgV4.Tangle(mootID)
    feedTangle.add(mootID, moot)

    const msg = MsgV4.create({
      keypair: keypairB,
      data: { text: 'Hello world!' },
      account: accountB,
      accountTips: [accountB],
      domain: 'post',
      tangles: {
        [mootID]: feedTangle,
      },
    })
    const msgID = MsgV4.getMsgID(msg)

    const err = MsgV4.validate(msg, feedTangle, sigkeys, msgID, mootID)
    assert.ok(err, 'invalid msg throws')
    assert.match(
      err,
      /sigkey ".*" should have been one of ".*" from the account ".*"/,
      'invalid msg'
    )
  })

  await t.test('Feed msg with the wrong domain', (t) => {
    const keypairA = Keypair.generate('ed25519', 'alice')

    const moot = MsgV4.createMoot(account, 'post', keypair)
    const mootID = MsgV4.getMsgID(moot)
    const feedTangle = new MsgV4.Tangle(mootID)
    feedTangle.add(mootID, moot)

    const msg = MsgV4.create({
      keypair: keypairA,
      data: { text: 'Hello world!' },
      account,
      accountTips: [account],
      domain: 'comment',
      tangles: {
        [mootID]: feedTangle,
      },
    })
    const msgID = MsgV4.getMsgID(msg)

    const err = MsgV4.validate(msg, feedTangle, sigkeys, msgID, mootID)
    assert.ok(err, 'invalid msg throws')
    assert.match(
      err,
      /domain "comment" should have been feed domain "post"/,
      'invalid feed msg'
    )
  })

  await t.test('Feed msg with non-alphabetically sorted prev', (t) => {
    const keypair = Keypair.generate('ed25519', 'alice')

    const moot = MsgV4.createMoot(account, 'post', keypair)
    const mootID = MsgV4.getMsgID(moot)

    const tangle = new MsgV4.Tangle(mootID)
    tangle.add(mootID, moot)

    const msg1 = MsgV4.create({
      keypair,
      data: { text: '1' },
      account,
      accountTips: [account],
      domain: 'post',
      tangles: {
        [mootID]: tangle,
      },
    })
    const msgID1 = MsgV4.getMsgID(msg1)

    const msg2 = MsgV4.create({
      keypair,
      data: { text: '2' },
      account,
      accountTips: [account],
      domain: 'post',
      tangles: {
        [mootID]: tangle,
      },
    })
    const msgID2 = MsgV4.getMsgID(msg2)

    tangle.add(msgID1, msg1)
    tangle.add(msgID2, msg2)

    const msg3 = MsgV4.create({
      keypair,
      data: { text: '3' },
      account,
      accountTips: [account],
      domain: 'post',
      tangles: {
        [mootID]: tangle,
      },
    })
    const msgID3 = MsgV4.getMsgID(msg3)

    let prevMsgIDs = msg3.metadata.tangles[mootID].prev
    if (prevMsgIDs[0] < prevMsgIDs[1]) {
      prevMsgIDs = [prevMsgIDs[1], prevMsgIDs[0]]
    } else {
      prevMsgIDs = [prevMsgIDs[0], prevMsgIDs[1]]
    }
    msg3.metadata.tangles[mootID].prev = prevMsgIDs

    const err = MsgV4.validate(msg3, tangle, sigkeys, msgID3, mootID)
    assert.ok(err, 'invalid 3rd msg throws')
    assert.match(
      err,
      /prev ".*" should have been alphabetically sorted/,
      'invalid error message'
    )
  })

  await t.test('Feed msg with duplicate prev', (t) => {
    const keypair = Keypair.generate('ed25519', 'alice')

    const moot = MsgV4.createMoot(account, 'post', keypair)
    const mootID = MsgV4.getMsgID(moot)

    const tangle = new MsgV4.Tangle(mootID)
    tangle.add(mootID, moot)

    const msg1 = MsgV4.create({
      keypair,
      data: { text: '1' },
      account,
      accountTips: [account],
      domain: 'post',
      tangles: {
        [mootID]: tangle,
      },
    })
    const msgID1 = MsgV4.getMsgID(msg1)

    const [prevID] = msg1.metadata.tangles[mootID].prev
    msg1.metadata.tangles[mootID].prev = [prevID, prevID]

    const err = MsgV4.validate(msg1, tangle, sigkeys, msgID1, mootID)
    assert.ok(err, 'invalid 1st msg throws')
    assert.match(err, /prev ".*" contains duplicates/, 'invalid error message')
  })
})
