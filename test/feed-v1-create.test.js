const tape = require('tape')
const FeedV1 = require('../lib/feed-v1')
const { generateKeypair } = require('./util')

tape('FeedV1.create()', (t) => {
  const keys = generateKeypair('alice')
  const content = { text: 'Hello world!' }
  const when = 1652037377204

  const msg1 = FeedV1.create({
    keys,
    content,
    type: 'post',
    existing: [],
    when,
  })
  t.deepEquals(
    Object.keys(msg1.metadata),
    ['depth', 'prev', 'proof', 'size', 'type', 'who', 'when'],
    'metadata fields'
  )
  t.equals(
    msg1.metadata.who,
    '4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW',
    'metadata.who'
  )
  t.equals(msg1.metadata.type, 'post', 'metadata.type')
  t.equals(msg1.metadata.depth, 0, 'metadata.depth')
  t.deepEquals(msg1.metadata.prev, [], 'metadata.prev')
  t.deepEquals(msg1.metadata.proof, '9R7XmBhHF5ooPg34j9TQcz', 'metadata.proof')
  t.deepEquals(msg1.metadata.size, 23, 'metadata.size')
  t.equals(typeof msg1.metadata.when, 'number', 'metadata.when')
  t.deepEqual(msg1.content, content, 'content is correct')

  console.log(msg1)

  const msgHash1 = '9cYegpVpddoMSdvSf53dTH'

  t.equals(
    FeedV1.getMsgId(msg1),
    'ppppp:message/v1/4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW/post/' +
      msgHash1,
    'getMsgId'
  )

  const content2 = { text: 'Ola mundo!' }

  const msg2 = FeedV1.create({
    keys,
    content: content2,
    type: 'post',
    existing: new Map([[msgHash1, msg1]]),
    when: when + 1,
  })
  t.deepEquals(
    Object.keys(msg2.metadata),
    ['depth', 'prev', 'proof', 'size', 'type', 'who', 'when'],
    'metadata keys'
  )
  t.equals(
    msg2.metadata.who,
    '4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW',
    'metadata.who'
  )
  t.equals(msg2.metadata.type, 'post', 'metadata.type')
  t.equals(msg2.metadata.depth, 1, 'metadata.depth')
  t.deepEquals(msg2.metadata.prev, [msgHash1], 'metadata.prev')
  t.deepEquals(msg2.metadata.proof, 'XuZEzH1Dhy1yuRMcviBBcN', 'metadata.proof')
  t.deepEquals(msg2.metadata.size, 21, 'metadata.size')
  t.equals(typeof msg2.metadata.when, 'number', 'metadata.when')
  t.deepEqual(msg2.content, content2, 'content is correct')

  console.log(msg2)

  t.deepEqual(
    FeedV1.getMsgId(msg2),
    'ppppp:message/v1/4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW/post/LEH1JVENvJgSpBBrVUwJx6',
    'getMsgId'
  )

  t.end()
})

tape('create() handles DAG tips correctly', (t) => {
  const keys = generateKeypair('alice')
  const when = 1652037377204
  const existing = new Map()

  const msg1 = FeedV1.create({
    keys,
    content: { text: '1' },
    type: 'post',
    existing: new Map(),
    when: when + 1,
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)
  t.deepEquals(msg1.metadata.prev, [], 'msg1.prev is empty')

  existing.set(msgHash1, msg1)

  const msg2A = FeedV1.create({
    keys,
    content: { text: '2A' },
    type: 'post',
    existing,
    when: when + 2,
  })
  t.deepEquals(msg2A.metadata.prev, [msgHash1], 'msg2A.prev is msg1')

  const msg2B = FeedV1.create({
    keys,
    content: { text: '2B' },
    type: 'post',
    existing,
    when: when + 2,
  })
  const msgHash2B = FeedV1.getMsgHash(msg2B)
  t.deepEquals(msg2B.metadata.prev, [msgHash1], 'msg2B.prev is msg1')

  existing.set(msgHash2B, msg2B)

  const msg3 = FeedV1.create({
    keys,
    content: { text: '3' },
    type: 'post',
    existing,
    when: when + 3,
  })
  const msgHash3 = FeedV1.getMsgHash(msg3)
  t.deepEquals(msg3.metadata.prev, [msgHash2B], 'msg3.prev is msg2B')
  existing.set(msgHash3, msg3)

  const msgHash2A = FeedV1.getMsgHash(msg2A)
  existing.set(msgHash2A, msg2A)
  t.pass('msg2A comes into awareness')

  const msg4 = FeedV1.create({
    keys,
    content: { text: '4' },
    type: 'post',
    existing,
    when: when + 4,
  })
  t.deepEquals(
    msg4.metadata.prev,
    [msgHash1, msgHash3, msgHash2A],
    'msg4.prev is [msg1(lipmaa),msg3(previous),msg2A(old fork as tip)]'
  )

  t.end()
})
