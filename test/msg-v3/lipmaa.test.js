const test = require('node:test')
const assert = require('node:assert')
const Keypair = require('ppppp-keypair')
const MsgV3 = require('../../lib/msg-v3')

test('MsgV3 lipmaa prevs', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const account = MsgV3.getMsgID(
    MsgV3.createAccount(keypair, 'person', 'MYNONCE')
  )
  const data = { text: 'Hello world!' }

  const moot = MsgV3.createMoot(account, 'post', keypair)
  const mootID = MsgV3.getMsgID(moot)
  const tangle = new MsgV3.Tangle(mootID)
  tangle.add(mootID, moot)

  const msg1 = MsgV3.create({
    account,
    accountTips: [account],
    domain: 'post',
    data,
    tangles: {
      [mootID]: tangle,
    },
    keypair,
  })
  const msgID1 = MsgV3.getMsgID(msg1)
  tangle.add(msgID1, msg1)
  assert.equal(msg1.metadata.tangles[mootID].depth, 1, 'msg1 depth')
  assert.deepEqual(
    msg1.metadata.tangles[mootID].prev,
    [mootID],
    'msg1 prev'
  )

  const msg2 = MsgV3.create({
    account,
    accountTips: [account],
    domain: 'post',
    data,
    tangles: {
      [mootID]: tangle,
    },
    keypair,
  })
  const msgID2 = MsgV3.getMsgID(msg2)
  tangle.add(msgID2, msg2)
  assert.equal(msg2.metadata.tangles[mootID].depth, 2, 'msg2 depth')
  assert.deepEqual(
    msg2.metadata.tangles[mootID].prev,
    [msgID1],
    'msg2 prev'
  )

  const msg3 = MsgV3.create({
    account,
    accountTips: [account],
    domain: 'post',
    data,
    tangles: {
      [mootID]: tangle,
    },
    keypair,
  })
  const msgID3 = MsgV3.getMsgID(msg3)
  tangle.add(msgID3, msg3)
  assert.equal(msg3.metadata.tangles[mootID].depth, 3, 'msg3 depth')
  assert.deepEqual(
    msg3.metadata.tangles[mootID].prev,
    [mootID, msgID2].sort(),
    'msg3 prev (has lipmaa!)'
  )

  const msg4 = MsgV3.create({
    account,
    accountTips: [account],
    domain: 'post',
    keypair,
    tangles: {
      [mootID]: tangle,
    },
    data,
  })
  const msgID4 = MsgV3.getMsgID(msg4)
  tangle.add(msgID4, msg4)
  assert.equal(msg4.metadata.tangles[mootID].depth, 4, 'msg4 depth')
  assert.deepEqual(
    msg4.metadata.tangles[mootID].prev,
    [msgID3],
    'msg4 prev'
  )

  const msg5 = MsgV3.create({
    account,
    accountTips: [account],
    domain: 'post',
    data,
    tangles: {
      [mootID]: tangle,
    },
    keypair,
  })
  const msgID5 = MsgV3.getMsgID(msg5)
  tangle.add(msgID5, msg5)
  assert.equal(msg5.metadata.tangles[mootID].depth, 5, 'msg5 depth')
  assert.deepEqual(
    msg5.metadata.tangles[mootID].prev,
    [msgID4],
    'msg5 prev'
  )

  const msg6 = MsgV3.create({
    account,
    accountTips: [account],
    domain: 'post',
    data,
    tangles: {
      [mootID]: tangle,
    },
    keypair,
  })
  const msgID6 = MsgV3.getMsgID(msg6)
  tangle.add(msgID6, msg6)
  assert.equal(msg6.metadata.tangles[mootID].depth, 6, 'msg6 depth')
  assert.deepEqual(
    msg6.metadata.tangles[mootID].prev,
    [msgID5],
    'msg6 prev'
  )

  const msg7 = MsgV3.create({
    account,
    accountTips: [account],
    domain: 'post',
    data,
    tangles: {
      [mootID]: tangle,
    },
    keypair,
  })
  const msgID7 = MsgV3.getMsgID(msg7)
  tangle.add(msgID7, msg7)
  assert.equal(msg7.metadata.tangles[mootID].depth, 7, 'msg7 depth')
  assert.deepEqual(
    msg7.metadata.tangles[mootID].prev,
    [msgID3, msgID6].sort(),
    'msg7 prev (has lipmaa!)'
  )
})
