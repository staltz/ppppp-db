const test = require('node:test')
const assert = require('node:assert')
const Keypair = require('ppppp-keypair')
const MsgV3 = require('../../lib/msg-v3')

test('lipmaa prevs', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const identity = MsgV3.getMsgHash(
    MsgV3.createIdentity(keypair, 'person', 'MYNONCE')
  )
  const data = { text: 'Hello world!' }

  const rootMsg = MsgV3.createRoot(identity, 'post', keypair)
  const rootHash = MsgV3.getMsgHash(rootMsg)
  const tangle = new MsgV3.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = MsgV3.create({
    identity,
    identityTips: [identity],
    domain: 'post',
    data,
    tangles: {
      [rootHash]: tangle,
    },
    keypair,
  })
  const msgHash1 = MsgV3.getMsgHash(msg1)
  tangle.add(msgHash1, msg1)
  assert.equal(msg1.metadata.tangles[rootHash].depth, 1, 'msg1 depth')
  assert.deepEqual(
    msg1.metadata.tangles[rootHash].prev,
    [rootHash],
    'msg1 prev'
  )

  const msg2 = MsgV3.create({
    identity,
    identityTips: [identity],
    domain: 'post',
    data,
    tangles: {
      [rootHash]: tangle,
    },
    keypair,
  })
  const msgHash2 = MsgV3.getMsgHash(msg2)
  tangle.add(msgHash2, msg2)
  assert.equal(msg2.metadata.tangles[rootHash].depth, 2, 'msg2 depth')
  assert.deepEqual(
    msg2.metadata.tangles[rootHash].prev,
    [msgHash1],
    'msg2 prev'
  )

  const msg3 = MsgV3.create({
    identity,
    identityTips: [identity],
    domain: 'post',
    data,
    tangles: {
      [rootHash]: tangle,
    },
    keypair,
  })
  const msgHash3 = MsgV3.getMsgHash(msg3)
  tangle.add(msgHash3, msg3)
  assert.equal(msg3.metadata.tangles[rootHash].depth, 3, 'msg3 depth')
  assert.deepEqual(
    msg3.metadata.tangles[rootHash].prev,
    [rootHash, msgHash2].sort(),
    'msg3 prev (has lipmaa!)'
  )

  const msg4 = MsgV3.create({
    identity,
    identityTips: [identity],
    domain: 'post',
    keypair,
    tangles: {
      [rootHash]: tangle,
    },
    data,
  })
  const msgHash4 = MsgV3.getMsgHash(msg4)
  tangle.add(msgHash4, msg4)
  assert.equal(msg4.metadata.tangles[rootHash].depth, 4, 'msg4 depth')
  assert.deepEqual(
    msg4.metadata.tangles[rootHash].prev,
    [msgHash3],
    'msg4 prev'
  )

  const msg5 = MsgV3.create({
    identity,
    identityTips: [identity],
    domain: 'post',
    data,
    tangles: {
      [rootHash]: tangle,
    },
    keypair,
  })
  const msgHash5 = MsgV3.getMsgHash(msg5)
  tangle.add(msgHash5, msg5)
  assert.equal(msg5.metadata.tangles[rootHash].depth, 5, 'msg5 depth')
  assert.deepEqual(
    msg5.metadata.tangles[rootHash].prev,
    [msgHash4],
    'msg5 prev'
  )

  const msg6 = MsgV3.create({
    identity,
    identityTips: [identity],
    domain: 'post',
    data,
    tangles: {
      [rootHash]: tangle,
    },
    keypair,
  })
  const msgHash6 = MsgV3.getMsgHash(msg6)
  tangle.add(msgHash6, msg6)
  assert.equal(msg6.metadata.tangles[rootHash].depth, 6, 'msg6 depth')
  assert.deepEqual(
    msg6.metadata.tangles[rootHash].prev,
    [msgHash5],
    'msg6 prev'
  )

  const msg7 = MsgV3.create({
    identity,
    identityTips: [identity],
    domain: 'post',
    data,
    tangles: {
      [rootHash]: tangle,
    },
    keypair,
  })
  const msgHash7 = MsgV3.getMsgHash(msg7)
  tangle.add(msgHash7, msg7)
  assert.equal(msg7.metadata.tangles[rootHash].depth, 7, 'msg7 depth')
  assert.deepEqual(
    msg7.metadata.tangles[rootHash].prev,
    [msgHash3, msgHash6].sort(),
    'msg7 prev (has lipmaa!)'
  )
})
