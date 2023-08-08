const test = require('node:test')
const assert = require('node:assert')
const Keypair = require('ppppp-keypair')
const MsgV3 = require('../../lib/msg-v3')

let identity
test('MsgV3.createIdentity()', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const identityMsg0 = MsgV3.createIdentity(keypair, 'person', 'MYNONCE')
  console.log(JSON.stringify(identityMsg0, null, 2))

  assert.deepEqual(
    identityMsg0.data,
    {
      action: 'add',
      add: {
        key: {
          purpose: 'sig',
          algorithm: 'ed25519',
          bytes: keypair.public,
        },
        nonce: 'MYNONCE',
        powers: ['add', 'del', 'box'],
      },
    },
    'data'
  )
  assert.equal(identityMsg0.metadata.dataHash, 'R5az9nC1CB3Afd5Q57HYRQ', 'hash')
  assert.equal(identityMsg0.metadata.dataSize, 172, 'size')
  assert.equal(identityMsg0.metadata.identity, 'self', 'identity')
  assert.equal(identityMsg0.metadata.identityTips, null, 'identityTips')
  assert.deepEqual(identityMsg0.metadata.tangles, {}, 'tangles')
  assert.equal(identityMsg0.metadata.domain, 'person', 'domain')
  assert.equal(identityMsg0.metadata.v, 3, 'v')
  assert.equal(identityMsg0.pubkey, keypair.public, 'pubkey')

  identity = MsgV3.getMsgHash(identityMsg0)
  assert.equal(identity, 'GZJ1T864pFVHKJ2mRS2c5q', 'identity ID')
})

let rootMsg = null
let rootHash = null
test('MsgV3.createRoot()', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  rootMsg = MsgV3.createRoot(identity, 'post', keypair)
  console.log(JSON.stringify(rootMsg, null, 2))

  assert.equal(rootMsg.data, null, 'data')
  assert.equal(rootMsg.metadata.dataHash, null, 'hash')
  assert.equal(rootMsg.metadata.dataSize, 0, 'size')
  assert.equal(rootMsg.metadata.identity, identity, 'identity')
  assert.equal(rootMsg.metadata.identityTips, null, 'identityTips')
  assert.deepEqual(rootMsg.metadata.tangles, {}, 'tangles')
  assert.equal(rootMsg.metadata.domain, 'post', 'domain')
  assert.equal(rootMsg.metadata.v, 3, 'v')
  assert.equal(rootMsg.pubkey, keypair.public, 'pubkey')

  rootHash = MsgV3.getMsgHash(rootMsg)
  assert.equal(rootHash, '4VfVj9DQArX5Vk6PVz5s5J', 'root hash')
})

test('MsgV3.create()', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const data = { text: 'Hello world!' }

  const tangle1 = new MsgV3.Tangle(rootHash)
  tangle1.add(rootHash, rootMsg)

  const msg1 = MsgV3.create({
    keypair,
    data,
    identity,
    identityTips: [identity],
    domain: 'post',
    tangles: {
      [rootHash]: tangle1,
    },
  })
  console.log(JSON.stringify(msg1, null, 2))

  assert.deepEqual(msg1.data, data, 'data')
  assert.deepEqual(
    Object.keys(msg1.metadata),
    [
      'dataHash',
      'dataSize',
      'identity',
      'identityTips',
      'tangles',
      'domain',
      'v',
    ],
    'metadata shape'
  )
  assert.deepEqual(
    msg1.metadata.dataHash,
    '9R7XmBhHF5ooPg34j9TQcz',
    'metadata.dataHash'
  )
  assert.deepEqual(msg1.metadata.dataSize, 23, 'metadata.dataSize')
  assert.equal(msg1.metadata.identity, identity, 'metadata.identity')
  assert.deepEqual(
    msg1.metadata.identityTips,
    [identity],
    'metadata.identityTips'
  )
  assert.deepEqual(
    Object.keys(msg1.metadata.tangles),
    [rootHash],
    'metadata.tangles'
  )
  assert.equal(msg1.metadata.tangles[rootHash].depth, 1, 'tangle depth')
  assert.deepEqual(
    msg1.metadata.tangles[rootHash].prev,
    [rootHash],
    'tangle prev'
  )
  assert.equal(msg1.metadata.domain, 'post', 'metadata.domain')
  assert.deepEqual(msg1.metadata.v, 3, 'metadata.v')
  assert.equal(
    msg1.pubkey,
    '4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW',
    'pubkey'
  )
  assert.equal(
    msg1.sig,
    '23CPZzKBAeRa6gb2ijwUJAd4VrYmokLSbQTmWEFMCiSogjViwqvms6ShyPq1UCzNWKAggmmJP4qETnVrY4iEMQ5J',
    'sig'
  )

  const msgHash1 = 'kF6XHyi1LtJdttRDp54VM'

  assert.equal(
    MsgV3.getMsgId(msg1),
    `ppppp:message/v3/${identity}/post/${msgHash1}`,
    'getMsgId'
  )

  const tangle2 = new MsgV3.Tangle(rootHash)
  tangle2.add(rootHash, rootMsg)
  tangle2.add(msgHash1, msg1)

  const data2 = { text: 'Ola mundo!' }

  const msg2 = MsgV3.create({
    keypair,
    data: data2,
    identity,
    identityTips: [identity],
    domain: 'post',
    tangles: {
      [rootHash]: tangle2,
    },
  })
  console.log(JSON.stringify(msg2, null, 2))

  assert.deepEqual(msg2.data, data2, 'data')
  assert.deepEqual(
    Object.keys(msg2.metadata),
    [
      'dataHash',
      'dataSize',
      'identity',
      'identityTips',
      'tangles',
      'domain',
      'v',
    ],
    'metadata shape'
  )
  assert.deepEqual(
    msg2.metadata.dataHash,
    'XuZEzH1Dhy1yuRMcviBBcN',
    'metadata.dataHash'
  )
  assert.deepEqual(msg2.metadata.dataSize, 21, 'metadata.dataSize')
  assert.equal(msg2.metadata.identity, identity, 'metadata.identity')
  assert.deepEqual(
    msg2.metadata.identityTips,
    [identity],
    'metadata.identityTips'
  )
  assert.deepEqual(
    Object.keys(msg2.metadata.tangles),
    [rootHash],
    'metadata.tangles'
  )
  assert.equal(msg2.metadata.tangles[rootHash].depth, 2, 'tangle depth')
  assert.deepEqual(
    msg2.metadata.tangles[rootHash].prev,
    [msgHash1],
    'tangle prev'
  )
  assert.equal(msg2.metadata.domain, 'post', 'metadata.domain')
  assert.deepEqual(msg2.metadata.v, 3, 'metadata.v')
  assert.equal(
    msg2.pubkey,
    '4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW',
    'pubkey'
  )
  assert.equal(
    msg2.sig,
    'tpMaMqV7t4hhYtLPZu7nFmUZej3pXVAYWf3pwXChThsQ8qT9Zxxym2TDDTUrT9VF7CNXRnLNoLMgYuZKAQrZ5bR',
    'sig'
  )

  assert.deepEqual(
    MsgV3.getMsgId(msg2),
    `ppppp:message/v3/${identity}/post/7W2nJCdpMeco7D8BYvRq7A`,
    'getMsgId'
  )
})

test('create() handles DAG tips correctly', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const tangle = new MsgV3.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = MsgV3.create({
    keypair,
    data: { text: '1' },
    identity,
    identityTips: [identity],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash1 = MsgV3.getMsgHash(msg1)
  assert.deepEqual(
    msg1.metadata.tangles[rootHash].prev,
    [MsgV3.getFeedRootHash(identity, 'post')],
    'msg1.prev is root'
  )

  tangle.add(msgHash1, msg1)

  const msg2A = MsgV3.create({
    keypair,
    data: { text: '2A' },
    identity,
    identityTips: [identity],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  assert.deepEqual(
    msg2A.metadata.tangles[rootHash].prev,
    [msgHash1],
    'msg2A.prev is msg1'
  )

  const msg2B = MsgV3.create({
    keypair,
    data: { text: '2B' },
    identity,
    identityTips: [identity],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash2B = MsgV3.getMsgHash(msg2B)
  assert.deepEqual(
    msg2B.metadata.tangles[rootHash].prev,
    [msgHash1],
    'msg2B.prev is msg1'
  )

  tangle.add(msgHash2B, msg2B)

  const msg3 = MsgV3.create({
    keypair,
    data: { text: '3' },
    identity,
    identityTips: [identity],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash3 = MsgV3.getMsgHash(msg3)
  assert.deepEqual(
    msg3.metadata.tangles[rootHash].prev,
    [rootHash, msgHash2B].sort(),
    'msg3.prev is [root(lipmaa),msg2B(previous)], sorted'
  )
  tangle.add(msgHash3, msg3)

  const msgHash2A = MsgV3.getMsgHash(msg2A)
  tangle.add(msgHash2A, msg2A)
  // t.pass('msg2A comes into awareness')

  const msg4 = MsgV3.create({
    keypair,
    data: { text: '4' },
    identity,
    identityTips: [identity],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  assert.deepEqual(
    msg4.metadata.tangles[rootHash].prev,
    [msgHash3, msgHash2A].sort(),
    'msg4.prev is [msg3(previous),msg2A(old fork as tip)], sorted'
  )
})
