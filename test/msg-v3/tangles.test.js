const test = require('node:test')
const assert = require('node:assert')
const Keypair = require('ppppp-keypair')
const MsgV3 = require('../../lib/msg-v3')

test('simple multi-author tangle', (t) => {
  const keypairA = Keypair.generate('ed25519', 'alice')
  const keypairB = Keypair.generate('ed25519', 'bob')
  const identityA = MsgV3.getMsgHash(
    MsgV3.createIdentity(keypairA, 'person', 'alice')
  )
  const identityB = MsgV3.getMsgHash(
    MsgV3.createIdentity(keypairB, 'person', 'bob')
  )

  const rootMsgA = MsgV3.createRoot(identityA, 'post', keypairA)
  const rootHashA = MsgV3.getMsgHash(rootMsgA)
  const tangleA = new MsgV3.Tangle(rootHashA)
  tangleA.add(rootHashA, rootMsgA)

  const rootMsgB = MsgV3.createRoot(identityB, 'post', keypairB)
  const rootHashB = MsgV3.getMsgHash(rootMsgB)
  const tangleB = new MsgV3.Tangle(rootHashB)
  tangleB.add(rootHashB, rootMsgB)

  const msg1 = MsgV3.create({
    identity: identityA,
    identityTips: [identityA],
    domain: 'post',
    data: { text: 'Hello world!' },
    tangles: {
      [rootHashA]: tangleA,
    },
    keypair: keypairA,
  })
  const msgHash1 = MsgV3.getMsgHash(msg1)
  assert.deepEqual(
    Object.keys(msg1.metadata.tangles),
    [rootHashA],
    'msg1 has only feed tangle'
  )

  const tangleX = new MsgV3.Tangle(msgHash1)
  tangleX.add(msgHash1, msg1)

  const msg2 = MsgV3.create({
    identity: identityB,
    identityTips: [identityB],
    domain: 'post',
    data: { text: 'Hello world!' },
    tangles: {
      [rootHashB]: tangleB,
      [msgHash1]: tangleX,
    },
    keypair: keypairB,
  })

  assert.deepEqual(
    Object.keys(msg2.metadata.tangles).sort(),
    [rootHashB, msgHash1].sort(),
    'msg2 has feed tangle and misc tangle'
  )
  assert.equal(
    msg2.metadata.tangles[rootHashB].depth,
    1,
    'msg2 feed tangle depth'
  )
  assert.deepEqual(
    msg2.metadata.tangles[rootHashB].prev,
    [rootHashB],
    'msg2 feed tangle prev'
  )

  assert.equal(
    msg2.metadata.tangles[msgHash1].depth,
    1,
    'msg2 has tangle depth 1'
  )
  assert.deepEqual(
    msg2.metadata.tangles[msgHash1].prev,
    [msgHash1],
    'msg2 has tangle prev'
  )
})

test('lipmaa in multi-author tangle', (t) => {
  const keypairA = Keypair.generate('ed25519', 'alice')
  const keypairB = Keypair.generate('ed25519', 'bob')
  const identityA = MsgV3.getMsgHash(
    MsgV3.createIdentity(keypairA, 'person', 'alice')
  )
  const identityB = MsgV3.getMsgHash(
    MsgV3.createIdentity(keypairB, 'person', 'bob')
  )

  const data = { text: 'Hello world!' }

  const rootMsgA = MsgV3.createRoot(identityA, 'post', keypairA)
  const rootHashA = MsgV3.getMsgHash(rootMsgA)
  const tangleA = new MsgV3.Tangle(rootHashA)
  tangleA.add(rootHashA, rootMsgA)

  const rootMsgB = MsgV3.createRoot(identityB, 'post', keypairB)
  const rootHashB = MsgV3.getMsgHash(rootMsgB)
  const tangleB = new MsgV3.Tangle(rootHashB)
  tangleB.add(rootHashB, rootMsgB)

  const msg1 = MsgV3.create({
    identity: identityA,
    identityTips: [identityA],
    domain: 'post',
    data,
    tangles: {
      [rootHashA]: tangleA,
    },
    keypair: keypairA,
  })
  const msgHash1 = MsgV3.getMsgHash(msg1)
  tangleA.add(msgHash1, msg1)
  const tangleThread = new MsgV3.Tangle(msgHash1)
  tangleThread.add(msgHash1, msg1)

  assert.deepEqual(
    Object.keys(msg1.metadata.tangles),
    [rootHashA],
    'A:msg1 has only feed tangle'
  )

  const msg2 = MsgV3.create({
    identity: identityB,
    identityTips: [identityB],
    domain: 'post',
    data,
    tangles: {
      [rootHashB]: tangleB,
      [msgHash1]: tangleThread,
    },
    keypair: keypairB,
  })
  const msgHash2 = MsgV3.getMsgHash(msg2)
  tangleB.add(msgHash2, msg2)
  tangleThread.add(msgHash2, msg2)

  assert.deepEqual(
    msg2.metadata.tangles[msgHash1].prev,
    [msgHash1],
    'B:msg2 points to A:msg1'
  )

  const msg3 = MsgV3.create({
    identity: identityB,
    identityTips: [identityB],
    domain: 'post',
    data,
    tangles: {
      [rootHashB]: tangleB,
      [msgHash1]: tangleThread,
    },
    keypair: keypairB,
  })
  const msgHash3 = MsgV3.getMsgHash(msg3)
  tangleB.add(msgHash3, msg3)
  tangleThread.add(msgHash3, msg3)

  assert.deepEqual(
    msg3.metadata.tangles[msgHash1].prev,
    [msgHash2],
    'B:msg3 points to B:msg2'
  )

  const msg4 = MsgV3.create({
    identity: identityA,
    identityTips: [identityA],
    domain: 'post',
    data,
    tangles: {
      [rootHashA]: tangleA,
      [msgHash1]: tangleThread,
    },
    keypair: keypairA,
  })
  const msgHash4 = MsgV3.getMsgHash(msg4)
  tangleB.add(msgHash4, msg4)
  tangleThread.add(msgHash4, msg4)

  assert.deepEqual(
    msg4.metadata.tangles[msgHash1].prev,
    [msgHash1, msgHash3].sort(),
    'A:msg4 points to A:msg1,B:msg3'
  )
})
