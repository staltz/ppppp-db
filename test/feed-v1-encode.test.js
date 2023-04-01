const tape = require('tape')
const dagfeed = require('../lib/feed-v1')
const { generateKeypair } = require('./util')

tape('encode/decode works', (t) => {
  const keys = generateKeypair('alice')
  const hmacKey = null
  const content = { text: 'Hello world!' }
  const timestamp = 1652037377204

  const nmsg1 = dagfeed.newNativeMsg({
    keys,
    content,
    type: 'post',
    previous: [],
    timestamp,
    hmacKey,
  })
  t.equals(
    nmsg1.metadata.author,
    '4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW',
    'metadata.author is correct'
  )
  t.equals(nmsg1.metadata.type, 'post', 'metadata.type is correct')
  t.deepEquals(nmsg1.metadata.previous, [], 'metadata.previous is correct')
  console.log(nmsg1)

  const jsonMsg = {
    key: dagfeed.getMsgId(nmsg1),
    value: dagfeed.fromNativeMsg(nmsg1),
    timestamp: Date.now(),
  }

  const msgHash1 = 'HEzse89DSDWUXVPyav35GC'
  const msgKey1 =
    'ssb:message/dag/4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW/post/' +
    msgHash1

  t.deepEqual(jsonMsg.key, msgKey1, 'key is correct')
  t.deepEqual(
    jsonMsg.value.author,
    'ssb:feed/dag/4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW/post',
    'author is correct'
  )
  t.deepEqual(jsonMsg.value.type, 'post', 'correct type')
  t.equals(typeof jsonMsg.value.timestamp, 'number', 'has timestamp')
  t.deepEqual(jsonMsg.value.previous, [], 'correct previous')
  t.deepEqual(jsonMsg.value.content, content, 'content is the same')

  const reconstructedNMsg1 = dagfeed.toNativeMsg(jsonMsg.value)
  t.deepEqual(reconstructedNMsg1, nmsg1, 'can reconstruct')

  const content2 = { text: 'Hello butty world!' }

  const nmsg2 = dagfeed.newNativeMsg({
    keys,
    content: content2,
    type: 'post',
    previous: [msgHash1],
    timestamp: timestamp + 1,
    hmacKey,
  })
  console.log(nmsg2)

  const jsonMsg2 = {
    key: dagfeed.getMsgId(nmsg2),
    value: dagfeed.fromNativeMsg(nmsg2),
    timestamp: Date.now(),
  }

  t.deepEqual(
    jsonMsg2.key,
    'ssb:message/dag/4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW/post/U5n4v1m7gFzrtrdK84gGsV',
    'key is correct'
  )
  t.deepEqual(
    jsonMsg2.value.author,
    'ssb:feed/dag/4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW/post',
    'author is correct'
  )
  t.deepEqual(jsonMsg2.value.type, 'post', 'correct type')
  t.equals(typeof jsonMsg2.value.timestamp, 'number', 'has timestamp')
  t.deepEqual(jsonMsg2.value.previous, [msgKey1], 'correct previous')
  t.deepEqual(jsonMsg2.value.content, content2, 'content is the same')

  // test slow version as well
  const reconstructedNMsg2 = dagfeed.toNativeMsg(jsonMsg2.value)
  t.deepEqual(reconstructedNMsg2, nmsg2, 'can reconstruct')

  t.end()
})
