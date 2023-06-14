const test = require('node:test')
const assert = require('node:assert')
const Keypair = require('ppppp-keypair')
const MsgV2 = require('../../lib/msg-v2')

let group
test('MsgV2.createGroup()', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const groupMsg0 = MsgV2.createGroup(keypair, 'MYNONCE')
  console.log(JSON.stringify(groupMsg0, null, 2))

  assert.equal(groupMsg0.data.add, keypair.public, 'data.add')
  assert.equal(groupMsg0.metadata.dataHash, 'THi3VkJeaf8aTkLSNJUdFD', 'hash')
  assert.equal(groupMsg0.metadata.dataSize, 72, 'size')
  assert.equal(groupMsg0.metadata.group, null, 'group')
  assert.equal(groupMsg0.metadata.groupTips, null, 'groupTips')
  assert.deepEqual(groupMsg0.metadata.tangles, {}, 'tangles')
  assert.equal(groupMsg0.metadata.type, 'group', 'type')
  assert.equal(groupMsg0.metadata.v, 2, 'v')
  assert.equal(groupMsg0.pubkey, keypair.public, 'pubkey')

  group = MsgV2.getMsgHash(groupMsg0)
  assert.equal(group, 'XKKmEBmqKGa5twQ2HNSk7t', 'group ID')
})

let rootMsg = null
let rootHash = null
test('MsgV2.createRoot()', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  rootMsg = MsgV2.createRoot(group, 'post', keypair)
  console.log(JSON.stringify(rootMsg, null, 2))

  assert.equal(rootMsg.data, null, 'data')
  assert.equal(rootMsg.metadata.dataHash, null, 'hash')
  assert.equal(rootMsg.metadata.dataSize, 0, 'size')
  assert.equal(rootMsg.metadata.group, group, 'group')
  assert.equal(rootMsg.metadata.groupTips, null, 'groupTips')
  assert.deepEqual(rootMsg.metadata.tangles, {}, 'tangles')
  assert.equal(rootMsg.metadata.type, 'post', 'type')
  assert.equal(rootMsg.metadata.v, 2, 'v')
  assert.equal(rootMsg.pubkey, keypair.public, 'pubkey')

  rootHash = MsgV2.getMsgHash(rootMsg)
  assert.equal(rootHash, 'PzuT1Dwbbgn6a8NeLuHuKw', 'root hash')
})

test('MsgV2.create()', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const data = { text: 'Hello world!' }

  const tangle1 = new MsgV2.Tangle(rootHash)
  tangle1.add(rootHash, rootMsg)

  const msg1 = MsgV2.create({
    keypair,
    data,
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle1,
    },
  })
  console.log(JSON.stringify(msg1, null, 2))

  assert.deepEqual(msg1.data, data, 'data')
  assert.deepEqual(
    Object.keys(msg1.metadata),
    ['dataHash', 'dataSize', 'group', 'groupTips', 'tangles', 'type', 'v'],
    'metadata shape'
  )
  assert.deepEqual(
    msg1.metadata.dataHash,
    '9R7XmBhHF5ooPg34j9TQcz',
    'metadata.dataHash'
  )
  assert.deepEqual(msg1.metadata.dataSize, 23, 'metadata.dataSize')
  assert.equal(msg1.metadata.group, group, 'metadata.group')
  assert.deepEqual(msg1.metadata.groupTips, [group], 'metadata.groupTips')
  assert.deepEqual(
    Object.keys(msg1.metadata.tangles),
    [rootHash],
    'metadata.tangles'
  )
  assert.equal(msg1.metadata.tangles[rootHash].depth, 1, 'tangle depth')
  assert.deepEqual(msg1.metadata.tangles[rootHash].prev, [rootHash], 'tangle prev')
  assert.equal(msg1.metadata.type, 'post', 'metadata.type')
  assert.deepEqual(msg1.metadata.v, 2, 'metadata.v')
  assert.equal(
    msg1.pubkey,
    '4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW',
    'pubkey'
  )
  assert.equal(
    msg1.sig,
    'CW8gWiiqtEgPQ2NjXWHJb5aeW4vkKMG9d1BqPJDjSJaw6xX6s5GUTvoobNSBtaLv8CKNXHHJXSr9Vbe7Cew9pkv',
    'sig'
  )

  const msgHash1 = '7miH6Zh63cyMJTT5bhDjZF'

  assert.equal(
    MsgV2.getMsgId(msg1),
    `ppppp:message/v2/${group}/post/${msgHash1}`,
    'getMsgId'
  )

  const tangle2 = new MsgV2.Tangle(rootHash)
  tangle2.add(rootHash, rootMsg)
  tangle2.add(msgHash1, msg1)

  const data2 = { text: 'Ola mundo!' }

  const msg2 = MsgV2.create({
    keypair,
    data: data2,
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle2,
    },
  })
  console.log(JSON.stringify(msg2, null, 2))

  assert.deepEqual(msg2.data, data2, 'data')
  assert.deepEqual(
    Object.keys(msg2.metadata),
    ['dataHash', 'dataSize', 'group', 'groupTips', 'tangles', 'type', 'v'],
    'metadata shape'
  )
  assert.deepEqual(
    msg2.metadata.dataHash,
    'XuZEzH1Dhy1yuRMcviBBcN',
    'metadata.dataHash'
  )
  assert.deepEqual(msg2.metadata.dataSize, 21, 'metadata.dataSize')
  assert.equal(msg2.metadata.group, group, 'metadata.group')
  assert.deepEqual(msg2.metadata.groupTips, [group], 'metadata.groupTips')
  assert.deepEqual(
    Object.keys(msg2.metadata.tangles),
    [rootHash],
    'metadata.tangles'
  )
  assert.equal(msg2.metadata.tangles[rootHash].depth, 2, 'tangle depth')
  assert.deepEqual(msg2.metadata.tangles[rootHash].prev, [msgHash1], 'tangle prev')
  assert.equal(msg2.metadata.type, 'post', 'metadata.type')
  assert.deepEqual(msg2.metadata.v, 2, 'metadata.v')
  assert.equal(
    msg2.pubkey,
    '4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW',
    'pubkey'
  )
  assert.equal(
    msg2.sig,
    '33PStdQ8kdvL1pSpd6x9LuxcpEvDmsRNhAq7t75v66cthSHHuiJVqp57b9J7QVXp7a1Jw5qaZLycYQspJRbKNWyW',
    'sig'
  )

  assert.deepEqual(
    MsgV2.getMsgId(msg2),
    `ppppp:message/v2/${group}/post/HTtEmjCBXGBRTMM3mgekWu`,
    'getMsgId'
  )
})

test('create() handles DAG tips correctly', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const tangle = new MsgV2.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = MsgV2.create({
    keypair,
    data: { text: '1' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash1 = MsgV2.getMsgHash(msg1)
  assert.deepEqual(
    msg1.metadata.tangles[rootHash].prev,
    [MsgV2.getFeedRootHash(group, 'post')],
    'msg1.prev is root'
  )

  tangle.add(msgHash1, msg1)

  const msg2A = MsgV2.create({
    keypair,
    data: { text: '2A' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  assert.deepEqual(
    msg2A.metadata.tangles[rootHash].prev,
    [msgHash1],
    'msg2A.prev is msg1'
  )

  const msg2B = MsgV2.create({
    keypair,
    data: { text: '2B' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash2B = MsgV2.getMsgHash(msg2B)
  assert.deepEqual(
    msg2B.metadata.tangles[rootHash].prev,
    [msgHash1],
    'msg2B.prev is msg1'
  )

  tangle.add(msgHash2B, msg2B)

  const msg3 = MsgV2.create({
    keypair,
    data: { text: '3' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash3 = MsgV2.getMsgHash(msg3)
  assert.deepEqual(
    msg3.metadata.tangles[rootHash].prev,
    [rootHash, msgHash2B].sort(),
    'msg3.prev is [root(lipmaa),msg2B(previous)], sorted'
  )
  tangle.add(msgHash3, msg3)

  const msgHash2A = MsgV2.getMsgHash(msg2A)
  tangle.add(msgHash2A, msg2A)
  // t.pass('msg2A comes into awareness')

  const msg4 = MsgV2.create({
    keypair,
    data: { text: '4' },
    group,
    groupTips: [group],
    type: 'post',
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
