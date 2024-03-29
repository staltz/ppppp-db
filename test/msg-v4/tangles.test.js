const test = require('node:test')
const assert = require('node:assert')
const Keypair = require('ppppp-keypair')
const MsgV4 = require('../../lib/msg-v4')

test('MsgV4.Tangle simple multi-author tangle', (t) => {
  const keypairA = Keypair.generate('ed25519', 'alice')
  const keypairB = Keypair.generate('ed25519', 'bob')
  const accountA = MsgV4.getMsgID(
    MsgV4.createAccount(keypairA, 'person', 'alice')
  )
  const accountB = MsgV4.getMsgID(
    MsgV4.createAccount(keypairB, 'person', 'bob')
  )

  const mootA = MsgV4.createMoot(accountA, 'post', keypairA)
  const mootAID = MsgV4.getMsgID(mootA)
  const tangleA = new MsgV4.Tangle(mootAID)
  tangleA.add(mootAID, mootA)

  assert.equal(tangleA.id, mootAID, 'tangle.id')
  assert.equal(tangleA.root, mootA, 'tangle.root')

  const mootB = MsgV4.createMoot(accountB, 'post', keypairB)
  const mootBID = MsgV4.getMsgID(mootB)
  const tangleB = new MsgV4.Tangle(mootBID)
  tangleB.add(mootBID, mootB)

  const msg1 = MsgV4.create({
    account: accountA,
    accountTips: [accountA],
    domain: 'post',
    data: { text: 'Hello world!' },
    tangles: {
      [mootAID]: tangleA,
    },
    keypair: keypairA,
  })
  const msgID1 = MsgV4.getMsgID(msg1)
  assert.deepEqual(
    Object.keys(msg1.metadata.tangles),
    [mootAID],
    'msg1 has only feed tangle'
  )

  const tangleX = new MsgV4.Tangle(msgID1)
  tangleX.add(msgID1, msg1)

  const msg2 = MsgV4.create({
    account: accountB,
    accountTips: [accountB],
    domain: 'post',
    data: { text: 'Hello world!' },
    tangles: {
      [mootBID]: tangleB,
      [msgID1]: tangleX,
    },
    keypair: keypairB,
  })

  assert.deepEqual(
    Object.keys(msg2.metadata.tangles).sort(),
    [mootBID, msgID1].sort(),
    'msg2 has feed tangle and misc tangle'
  )
  assert.equal(
    msg2.metadata.tangles[mootBID].depth,
    1,
    'msg2 feed tangle depth'
  )
  assert.deepEqual(
    msg2.metadata.tangles[mootBID].prev,
    [mootBID],
    'msg2 feed tangle prev'
  )

  assert.equal(
    msg2.metadata.tangles[msgID1].depth,
    1,
    'msg2 has tangle depth 1'
  )
  assert.deepEqual(
    msg2.metadata.tangles[msgID1].prev,
    [msgID1],
    'msg2 has tangle prev'
  )
})

test('MsgV4.Tangle lipmaa in multi-author tangle', (t) => {
  const keypairA = Keypair.generate('ed25519', 'alice')
  const keypairB = Keypair.generate('ed25519', 'bob')
  const accountA = MsgV4.getMsgID(
    MsgV4.createAccount(keypairA, 'person', 'alice')
  )
  const accountB = MsgV4.getMsgID(
    MsgV4.createAccount(keypairB, 'person', 'bob')
  )

  const data = { text: 'Hello world!' }

  const mootA = MsgV4.createMoot(accountA, 'post', keypairA)
  const mootAID = MsgV4.getMsgID(mootA)
  const tangleA = new MsgV4.Tangle(mootAID)
  tangleA.add(mootAID, mootA)

  const mootB = MsgV4.createMoot(accountB, 'post', keypairB)
  const mootBID = MsgV4.getMsgID(mootB)
  const tangleB = new MsgV4.Tangle(mootBID)
  tangleB.add(mootBID, mootB)

  const msg1 = MsgV4.create({
    account: accountA,
    accountTips: [accountA],
    domain: 'post',
    data,
    tangles: {
      [mootAID]: tangleA,
    },
    keypair: keypairA,
  })
  const msgID1 = MsgV4.getMsgID(msg1)
  tangleA.add(msgID1, msg1)
  const tangleThread = new MsgV4.Tangle(msgID1)
  tangleThread.add(msgID1, msg1)

  assert.deepEqual(
    Object.keys(msg1.metadata.tangles),
    [mootAID],
    'A:msg1 has only feed tangle'
  )

  const msg2 = MsgV4.create({
    account: accountB,
    accountTips: [accountB],
    domain: 'post',
    data,
    tangles: {
      [mootBID]: tangleB,
      [msgID1]: tangleThread,
    },
    keypair: keypairB,
  })
  const msgID2 = MsgV4.getMsgID(msg2)
  tangleB.add(msgID2, msg2)
  tangleThread.add(msgID2, msg2)

  assert.deepEqual(
    msg2.metadata.tangles[msgID1].prev,
    [msgID1],
    'B:msg2 points to A:msg1'
  )

  const msg3 = MsgV4.create({
    account: accountB,
    accountTips: [accountB],
    domain: 'post',
    data,
    tangles: {
      [mootBID]: tangleB,
      [msgID1]: tangleThread,
    },
    keypair: keypairB,
  })
  const msgID3 = MsgV4.getMsgID(msg3)
  tangleB.add(msgID3, msg3)
  tangleThread.add(msgID3, msg3)

  assert.deepEqual(
    msg3.metadata.tangles[msgID1].prev,
    [msgID2],
    'B:msg3 points to B:msg2'
  )

  const msg4 = MsgV4.create({
    account: accountA,
    accountTips: [accountA],
    domain: 'post',
    data,
    tangles: {
      [mootAID]: tangleA,
      [msgID1]: tangleThread,
    },
    keypair: keypairA,
  })
  const msgID4 = MsgV4.getMsgID(msg4)
  tangleB.add(msgID4, msg4)
  tangleThread.add(msgID4, msg4)

  assert.deepEqual(
    msg4.metadata.tangles[msgID1].prev,
    [msgID1, msgID3].sort(),
    'A:msg4 points to A:msg1,B:msg3'
  )
})

test('MsgV4.Tangle can add msgs in random order', (t) => {
  const keypairA = Keypair.generate('ed25519', 'alice')
  const accountA = MsgV4.getMsgID(
    MsgV4.createAccount(keypairA, 'person', 'alice')
  )
  const mootA = MsgV4.createMoot(accountA, 'post', keypairA)
  const mootAID = MsgV4.getMsgID(mootA)

  const tangleBuilder = new MsgV4.Tangle(mootAID)
  tangleBuilder.add(mootAID, mootA)

  const msg1 = MsgV4.create({
    account: accountA,
    accountTips: [accountA],
    domain: 'post',
    data: { text: 'Hello world!' },
    tangles: {
      [mootAID]: tangleBuilder,
    },
    keypair: keypairA,
  })
  const msgID1 = MsgV4.getMsgID(msg1)
  tangleBuilder.add(msgID1, msg1)

  const msg2 = MsgV4.create({
    account: accountA,
    accountTips: [accountA],
    domain: 'post',
    data: { text: 'Hello world!' },
    tangles: {
      [mootAID]: tangleBuilder,
    },
    keypair: keypairA,
  })
  const msgID2 = MsgV4.getMsgID(msg2)
  tangleBuilder.add(msgID1, msg1)

  const tangle = new MsgV4.Tangle(mootAID)
  tangle.add(mootAID, mootA)
  tangle.add(msgID2, msg2)
  tangle.add(msgID1, msg1)

  assert.deepEqual(tangle.topoSort(), [mootAID, msgID1, msgID2])
  assert.deepEqual([...tangle.tips], [msgID2], 'tangle tips')
})
