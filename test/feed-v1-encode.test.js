const tape = require('tape')
const FeedV1 = require('../lib/feed-v1')
const { generateKeypair } = require('./util')

tape('encode/decode works', (t) => {
  const keys = generateKeypair('alice')
  const content = { text: 'Hello world!' }
  const when = 1652037377204

  const msg1 = FeedV1.create({
    keys,
    content,
    type: 'post',
    existing: [],
    tips: [],
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
    tips: new Map([[msgHash1, msg1]]),
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
