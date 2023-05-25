const tape = require('tape')
const MsgV2 = require('../../lib/msg-v2')
const { generateKeypair } = require('../util')

let group
tape('MsgV2.createGroup()', (t) => {
  const keys = generateKeypair('alice')

  const groupMsg0 = MsgV2.createGroup(keys, 'MYNONCE')
  console.log(JSON.stringify(groupMsg0, null, 2))

  t.equals(groupMsg0.data.add, keys.id, 'data.add')
  t.equals(groupMsg0.metadata.dataHash, 'THi3VkJeaf8aTkLSNJUdFD', 'hash')
  t.equals(groupMsg0.metadata.dataSize, 72, 'size')
  t.equals(groupMsg0.metadata.group, null, 'group')
  t.equals(groupMsg0.metadata.groupTips, null, 'groupTips')
  t.deepEquals(groupMsg0.metadata.tangles, {}, 'tangles')
  t.equals(groupMsg0.metadata.type, 'group', 'type')
  t.equals(groupMsg0.metadata.v, 2, 'v')
  t.equals(groupMsg0.pubkey, keys.id, 'pubkey')

  group = MsgV2.getMsgHash(groupMsg0)
  t.equals(group, 'XKKmEBmqKGa5twQ2HNSk7t', 'group ID')

  t.end()
})

let rootMsg = null
let rootHash = null
tape('MsgV2.createRoot()', (t) => {
  const keys = generateKeypair('alice')

  rootMsg = MsgV2.createRoot(group, 'post', keys)
  console.log(JSON.stringify(rootMsg, null, 2))

  t.equals(rootMsg.data, null, 'data')
  t.equals(rootMsg.metadata.dataHash, null, 'hash')
  t.equals(rootMsg.metadata.dataSize, 0, 'size')
  t.equals(rootMsg.metadata.group, group, 'group')
  t.equals(rootMsg.metadata.groupTips, null, 'groupTips')
  t.deepEquals(rootMsg.metadata.tangles, {}, 'tangles')
  t.equals(rootMsg.metadata.type, 'post', 'type')
  t.equals(rootMsg.metadata.v, 2, 'v')
  t.equals(rootMsg.pubkey, keys.id, 'pubkey')

  rootHash = MsgV2.getMsgHash(rootMsg)
  t.equals(rootHash, 'PzuT1Dwbbgn6a8NeLuHuKw', 'root hash')
  t.end()
})

tape('MsgV2.create()', (t) => {
  const keys = generateKeypair('alice')
  const data = { text: 'Hello world!' }

  const tangle1 = new MsgV2.Tangle(rootHash)
  tangle1.add(rootHash, rootMsg)

  const msg1 = MsgV2.create({
    keys,
    data,
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle1,
    },
  })
  console.log(JSON.stringify(msg1, null, 2))

  t.deepEqual(msg1.data, data, 'data')
  t.deepEquals(
    Object.keys(msg1.metadata),
    ['dataHash', 'dataSize', 'group', 'groupTips', 'tangles', 'type', 'v'],
    'metadata shape'
  )
  t.deepEquals(
    msg1.metadata.dataHash,
    '9R7XmBhHF5ooPg34j9TQcz',
    'metadata.dataHash'
  )
  t.deepEquals(msg1.metadata.dataSize, 23, 'metadata.dataSize')
  t.equals(msg1.metadata.group, group, 'metadata.group')
  t.deepEquals(msg1.metadata.groupTips, [group], 'metadata.groupTips')
  t.deepEquals(
    Object.keys(msg1.metadata.tangles),
    [rootHash],
    'metadata.tangles'
  )
  t.equals(msg1.metadata.tangles[rootHash].depth, 1, 'tangle depth')
  t.deepEquals(msg1.metadata.tangles[rootHash].prev, [rootHash], 'tangle prev')
  t.equals(msg1.metadata.type, 'post', 'metadata.type')
  t.deepEquals(msg1.metadata.v, 2, 'metadata.v')
  t.equals(
    msg1.pubkey,
    '4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW',
    'pubkey'
  )
  t.equals(
    msg1.sig,
    'CW8gWiiqtEgPQ2NjXWHJb5aeW4vkKMG9d1BqPJDjSJaw6xX6s5GUTvoobNSBtaLv8CKNXHHJXSr9Vbe7Cew9pkv',
    'sig'
  )

  const msgHash1 = '7miH6Zh63cyMJTT5bhDjZF'

  t.equals(
    MsgV2.getMsgId(msg1),
    `ppppp:message/v2/${group}/post/${msgHash1}`,
    'getMsgId'
  )

  const tangle2 = new MsgV2.Tangle(rootHash)
  tangle2.add(rootHash, rootMsg)
  tangle2.add(msgHash1, msg1)

  const data2 = { text: 'Ola mundo!' }

  const msg2 = MsgV2.create({
    keys,
    data: data2,
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle2,
    },
  })
  console.log(JSON.stringify(msg2, null, 2))

  t.deepEqual(msg2.data, data2, 'data')
  t.deepEquals(
    Object.keys(msg2.metadata),
    ['dataHash', 'dataSize', 'group', 'groupTips', 'tangles', 'type', 'v'],
    'metadata shape'
  )
  t.deepEquals(
    msg2.metadata.dataHash,
    'XuZEzH1Dhy1yuRMcviBBcN',
    'metadata.dataHash'
  )
  t.deepEquals(msg2.metadata.dataSize, 21, 'metadata.dataSize')
  t.equals(msg2.metadata.group, group, 'metadata.group')
  t.deepEquals(msg2.metadata.groupTips, [group], 'metadata.groupTips')
  t.deepEquals(
    Object.keys(msg2.metadata.tangles),
    [rootHash],
    'metadata.tangles'
  )
  t.equals(msg2.metadata.tangles[rootHash].depth, 2, 'tangle depth')
  t.deepEquals(msg2.metadata.tangles[rootHash].prev, [msgHash1], 'tangle prev')
  t.equals(msg2.metadata.type, 'post', 'metadata.type')
  t.deepEquals(msg2.metadata.v, 2, 'metadata.v')
  t.equals(
    msg2.pubkey,
    '4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW',
    'pubkey'
  )
  t.equals(
    msg2.sig,
    '33PStdQ8kdvL1pSpd6x9LuxcpEvDmsRNhAq7t75v66cthSHHuiJVqp57b9J7QVXp7a1Jw5qaZLycYQspJRbKNWyW',
    'sig'
  )

  t.deepEqual(
    MsgV2.getMsgId(msg2),
    `ppppp:message/v2/${group}/post/HTtEmjCBXGBRTMM3mgekWu`,
    'getMsgId'
  )

  t.end()
})

tape('create() handles DAG tips correctly', (t) => {
  const keys = generateKeypair('alice')
  const tangle = new MsgV2.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = MsgV2.create({
    keys,
    data: { text: '1' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash1 = MsgV2.getMsgHash(msg1)
  t.deepEquals(
    msg1.metadata.tangles[rootHash].prev,
    [MsgV2.getFeedRootHash(group, 'post')],
    'msg1.prev is root'
  )

  tangle.add(msgHash1, msg1)

  const msg2A = MsgV2.create({
    keys,
    data: { text: '2A' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  t.deepEquals(
    msg2A.metadata.tangles[rootHash].prev,
    [msgHash1],
    'msg2A.prev is msg1'
  )

  const msg2B = MsgV2.create({
    keys,
    data: { text: '2B' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash2B = MsgV2.getMsgHash(msg2B)
  t.deepEquals(
    msg2B.metadata.tangles[rootHash].prev,
    [msgHash1],
    'msg2B.prev is msg1'
  )

  tangle.add(msgHash2B, msg2B)

  const msg3 = MsgV2.create({
    keys,
    data: { text: '3' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash3 = MsgV2.getMsgHash(msg3)
  t.deepEquals(
    msg3.metadata.tangles[rootHash].prev,
    [rootHash, msgHash2B].sort(),
    'msg3.prev is [root(lipmaa),msg2B(previous)], sorted'
  )
  tangle.add(msgHash3, msg3)

  const msgHash2A = MsgV2.getMsgHash(msg2A)
  tangle.add(msgHash2A, msg2A)
  t.pass('msg2A comes into awareness')

  const msg4 = MsgV2.create({
    keys,
    data: { text: '4' },
    group,
    groupTips: [group],
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  t.deepEquals(
    msg4.metadata.tangles[rootHash].prev,
    [msgHash3, msgHash2A].sort(),
    'msg4.prev is [msg3(previous),msg2A(old fork as tip)], sorted'
  )

  t.end()
})
