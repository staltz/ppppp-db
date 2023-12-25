const test = require('node:test')
const assert = require('node:assert')
const Keypair = require('ppppp-keypair')
const MsgV4 = require('../../lib/msg-v4')

test('MsgV4 validation', async (t) => {
  await t.test('Correct root msg', (t) => {
    const keypair = Keypair.generate('ed25519', 'alice')
    const account = MsgV4.getMsgID(
      MsgV4.createAccount(keypair, 'person', 'alice')
    )
    const sigkeys = new Set([keypair.public])

    const moot = MsgV4.createMoot(account, 'post', keypair)
    const mootID = MsgV4.getMsgID(moot)
    const tangle = new MsgV4.Tangle(mootID)
    tangle.add(mootID, moot)

    const err = MsgV4.validate(moot, tangle, sigkeys, mootID, mootID)
    assert.ifError(err, 'valid root msg')
  })

  await t.test('Correct account tangle', (t) => {
    const sigkeys = new Set()
    const keypair1 = Keypair.generate('ed25519', 'alice')
    sigkeys.add(keypair1.public)

    const accountMsg0 = MsgV4.createAccount(keypair1, 'person', 'alice')
    const account = MsgV4.getMsgID(accountMsg0)
    const accountMsg0ID = account

    const tangle = new MsgV4.Tangle(account)
    tangle.add(accountMsg0ID, accountMsg0)

    let err = MsgV4.validate(
      accountMsg0,
      tangle,
      sigkeys,
      accountMsg0ID,
      account
    )
    assert.ifError(err, 'valid account root msg')

    tangle.add(account, accountMsg0)

    const keypair2 = Keypair.generate('ed25519', 'bob')

    const accountMsg1 = MsgV4.create({
      account: 'self',
      accountTips: null,
      domain: 'account',
      data: { add: keypair2.public },
      tangles: {
        [account]: tangle,
      },
      keypair: keypair1, // announcing keypair2 but signing with keypair1
    })
    const accountMsg1ID = MsgV4.getMsgID(accountMsg1)

    err = MsgV4.validate(accountMsg1, tangle, sigkeys, accountMsg1ID, account)
    assert.ifError(err, 'valid account msg')
  })

  await t.test('2nd msg correct with existing root', (t) => {
    const keypair = Keypair.generate('ed25519', 'alice')
    const account = MsgV4.getMsgID(
      MsgV4.createAccount(keypair, 'person', 'alice')
    )
    const sigkeys = new Set([keypair.public])

    const moot = MsgV4.createMoot(account, 'post', keypair)
    const mootID = MsgV4.getMsgID(moot)
    const tangle = new MsgV4.Tangle(mootID)
    tangle.add(mootID, moot)

    const msg1 = MsgV4.create({
      account,
      accountTips: [account],
      domain: 'post',
      data: { text: 'Hello world!' },
      tangles: {
        [mootID]: tangle,
      },
      keypair,
    })
    const msgID1 = MsgV4.getMsgID(msg1)
    tangle.add(msgID1, msg1)

    const err = MsgV4.validate(msg1, tangle, sigkeys, msgID1, mootID)
    assert.ifError(err, 'valid 2nd msg')
  })

  await t.test('2nd forked msg correct', (t) => {
    const keypair = Keypair.generate('ed25519', 'alice')
    const account = MsgV4.getMsgID(
      MsgV4.createAccount(keypair, 'person', 'alice')
    )
    const sigkeys = new Set([keypair.public])

    const moot = MsgV4.createMoot(account, 'post', keypair)
    const mootID = MsgV4.getMsgID(moot)
    const tangle = new MsgV4.Tangle(mootID)
    tangle.add(mootID, moot)

    const msg1A = MsgV4.create({
      account,
      accountTips: [account],
      domain: 'post',
      data: { text: 'Hello world!' },
      tangles: {
        [mootID]: tangle,
      },
      keypair,
    })
    const msgID1A = MsgV4.getMsgID(msg1A)

    const msg1B = MsgV4.create({
      account,
      accountTips: [account],
      domain: 'post',
      data: { text: 'Hello world!' },
      tangles: {
        [mootID]: tangle,
      },
      keypair,
    })
    const msgID1B = MsgV4.getMsgID(msg1B)

    tangle.add(msgID1A, msg1A)
    tangle.add(msgID1B, msg1B)
    const err = MsgV4.validate(msg1B, tangle, sigkeys, msgID1B, mootID)
    assert.ifError(err, 'valid 2nd forked msg')
  })

  await t.test('Correct erased msg', (t) => {
    const keypair = Keypair.generate('ed25519', 'alice')
    const account = MsgV4.getMsgID(
      MsgV4.createAccount(keypair, 'person', 'alice')
    )
    const sigkeys = new Set([keypair.public])

    const moot = MsgV4.createMoot(account, 'post', keypair)
    const mootID = MsgV4.getMsgID(moot)
    const tangle = new MsgV4.Tangle(mootID)
    tangle.add(mootID, moot)

    const msg1 = MsgV4.create({
      account,
      accountTips: [account],
      domain: 'post',
      data: { text: 'Hello world!' },
      tangles: {
        [mootID]: tangle,
      },
      keypair,
    })
    msg1.data = null
    const msgID1 = MsgV4.getMsgID(msg1)

    const err = MsgV4.validate(msg1, tangle, sigkeys, msgID1, mootID)
    assert.ifError(err, 'valid erased msg')
  })
})
