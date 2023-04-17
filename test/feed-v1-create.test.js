const tape = require('tape')
const FeedV1 = require('../lib/feed-v1')
const { generateKeypair } = require('./util')

let rootMsg = null
let rootHash = null
tape('FeedV1.createRoot()', (t) => {
  const keys = generateKeypair('alice')
  rootMsg = FeedV1.createRoot(keys, 'post')
  t.equals(rootMsg.content, null, 'content')
  t.equals(rootMsg.metadata.hash, null, 'hash')
  t.equals(rootMsg.metadata.size, 0, 'size')
  t.equals(rootMsg.metadata.type, 'post', 'type')
  t.equals(rootMsg.metadata.who, FeedV1.stripAuthor(keys.id), 'who')
  t.deepEquals(rootMsg.metadata.tangles, {}, 'tangles')

  rootHash = FeedV1.getMsgHash(rootMsg)
  t.equals(rootHash, 'Nf2kuXAYsLBHEgU9eonYdn', 'root hash')
  t.end()
})

tape('FeedV1.create()', (t) => {
  const keys = generateKeypair('alice')
  const content = { text: 'Hello world!' }

  const tangle1 = new FeedV1.Tangle(rootHash)
  tangle1.add(rootHash, rootMsg)

  const msg1 = FeedV1.create({
    keys,
    content,
    type: 'post',
    tangles: {
      [rootHash]: tangle1,
    },
  })
  t.deepEquals(
    Object.keys(msg1.metadata),
    ['hash', 'size', 'tangles', 'type', 'v', 'who'],
    'metadata fields'
  )
  t.equals(
    msg1.metadata.who,
    '4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW',
    'metadata.who'
  )
  t.equals(msg1.metadata.type, 'post', 'metadata.type')
  t.deepEquals(msg1.metadata.hash, '9R7XmBhHF5ooPg34j9TQcz', 'metadata.hash')
  t.deepEquals(Object.keys(msg1.metadata.tangles), [rootHash], 'tangles')
  t.equals(msg1.metadata.tangles[rootHash].depth, 1, 'tangle depth')
  t.deepEquals(msg1.metadata.tangles[rootHash].prev, [rootHash], 'tangle prev')
  t.deepEquals(msg1.metadata.size, 23, 'metadata.size')
  t.deepEqual(msg1.content, content, 'content is correct')

  console.log(msg1)

  const msgHash1 = 'SktCiaHrUxz2mXS1SRSDmj'

  t.equals(
    FeedV1.getMsgId(msg1),
    'ppppp:message/v1/4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW/post/' +
      msgHash1,
    'getMsgId'
  )

  const tangle2 = new FeedV1.Tangle(rootHash)
  tangle2.add(rootHash, rootMsg)
  tangle2.add(msgHash1, msg1)

  const content2 = { text: 'Ola mundo!' }

  const msg2 = FeedV1.create({
    keys,
    content: content2,
    type: 'post',
    tangles: {
      [rootHash]: tangle2,
    },
  })
  t.deepEquals(
    Object.keys(msg2.metadata),
    ['hash', 'size', 'tangles', 'type', 'v', 'who'],
    'metadata keys'
  )
  t.equals(
    msg2.metadata.who,
    '4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW',
    'metadata.who'
  )
  t.equals(msg2.metadata.type, 'post', 'metadata.type')
  t.deepEquals(Object.keys(msg1.metadata.tangles), [rootHash], 'tangles')
  t.equals(msg2.metadata.tangles[rootHash].depth, 2, 'tangle depth')
  t.deepEquals(msg2.metadata.tangles[rootHash].prev, [msgHash1], 'tangle prev')
  t.deepEquals(msg2.metadata.hash, 'XuZEzH1Dhy1yuRMcviBBcN', 'metadata.hash')
  t.deepEquals(msg2.metadata.size, 21, 'metadata.size')
  t.deepEqual(msg2.content, content2, 'content is correct')

  console.log(msg2)

  t.deepEqual(
    FeedV1.getMsgId(msg2),
    'ppppp:message/v1/4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW/post/Nej4ibHrxryTduWqDeCJE4',
    'getMsgId'
  )

  t.end()
})

tape('create() handles DAG tips correctly', (t) => {
  const keys = generateKeypair('alice')
  const tangle = new FeedV1.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = FeedV1.create({
    keys,
    content: { text: '1' },
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)
  t.deepEquals(
    msg1.metadata.tangles[rootHash].prev,
    ['Nf2kuXAYsLBHEgU9eonYdn'],
    'msg1.prev is root'
  )

  tangle.add(msgHash1, msg1)

  const msg2A = FeedV1.create({
    keys,
    content: { text: '2A' },
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

  const msg2B = FeedV1.create({
    keys,
    content: { text: '2B' },
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash2B = FeedV1.getMsgHash(msg2B)
  t.deepEquals(
    msg2B.metadata.tangles[rootHash].prev,
    [msgHash1],
    'msg2B.prev is msg1'
  )

  tangle.add(msgHash2B, msg2B)

  const msg3 = FeedV1.create({
    keys,
    content: { text: '3' },
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash3 = FeedV1.getMsgHash(msg3)
  t.deepEquals(
    msg3.metadata.tangles[rootHash].prev,
    [rootHash, msgHash2B],
    'msg3.prev is root(lipmaa),msg2B(previous)'
  )
  tangle.add(msgHash3, msg3)

  const msgHash2A = FeedV1.getMsgHash(msg2A)
  tangle.add(msgHash2A, msg2A)
  t.pass('msg2A comes into awareness')

  const msg4 = FeedV1.create({
    keys,
    content: { text: '4' },
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  t.deepEquals(
    msg4.metadata.tangles[rootHash].prev,
    [msgHash3, msgHash2A],
    'msg4.prev is [msg3(previous),msg2A(old fork as tip)]'
  )

  t.end()
})
