const tape = require('tape')
const FeedV1 = require('../lib/feed-v1')
const { generateKeypair } = require('./util')

tape('lipmaa prevs', (t) => {
  const keys = generateKeypair('alice')
  const content = { text: 'Hello world!' }
  const when = 1652037377204
  const existing = new Map()

  const msg1 = FeedV1.create({
    keys,
    content,
    type: 'post',
    existing: new Map(),
    when: when + 1,
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)
  existing.set(msgHash1, msg1)
  t.deepEquals(msg1.metadata.prev, [], 'msg1.prev is empty')

  const msg2 = FeedV1.create({
    keys,
    content,
    type: 'post',
    existing,
    when: when + 2,
  })
  const msgHash2 = FeedV1.getMsgHash(msg2)
  existing.set(msgHash2, msg2)
  t.deepEquals(msg2.metadata.prev, [msgHash1], 'msg2.prev is msg1')

  const msg3 = FeedV1.create({
    keys,
    content,
    type: 'post',
    existing,
    when: when + 3,
  })
  const msgHash3 = FeedV1.getMsgHash(msg3)
  existing.set(msgHash3, msg3)
  t.deepEquals(msg3.metadata.prev, [msgHash2], 'msg3.prev is msg2')

  const msg4 = FeedV1.create({
    keys,
    content,
    type: 'post',
    existing,
    when: when + 4,
  })
  const msgHash4 = FeedV1.getMsgHash(msg4)
  existing.set(msgHash4, msg4)
  t.deepEquals(
    msg4.metadata.prev,
    [msgHash1, msgHash3],
    'msg4.prev is msg1 and msg3'
  )

  const msg5 = FeedV1.create({
    keys,
    content,
    type: 'post',
    existing,
    when: when + 5,
  })
  const msgHash5 = FeedV1.getMsgHash(msg5)
  existing.set(msgHash5, msg5)
  t.deepEquals(msg5.metadata.prev, [msgHash4], 'msg5.prev is msg4')

  t.end()
})
