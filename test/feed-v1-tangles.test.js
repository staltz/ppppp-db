const tape = require('tape')
const FeedV1 = require('../lib/feed-v1')
const { generateKeypair } = require('./util')

tape('simple multi-author tangle', (t) => {
  const keysA = generateKeypair('alice')
  const keysB = generateKeypair('bob')

  const msg1 = FeedV1.create({
    keys: keysA,
    content: { text: 'Hello world!' },
    type: 'post',
    existing: new Map(),
    when: 1652030001000,
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)
  t.notOk(msg1.metadata.tangles, 'msg1 has no extra tangles')

  const msg2 = FeedV1.create({
    keys: keysB,
    content: { text: 'Hello world!' },
    type: 'post',
    existing: new Map(),
    tangles: {
      [msgHash1]: new Map([[msgHash1, msg1]]),
    },
    when: 1652030002000,
  })
  t.ok(msg2.metadata.tangles, 'msg2 has extra tangles')
  t.ok(msg2.metadata.tangles[msgHash1], 'msg2 has tangle for msgHash1')
  t.equal(msg2.metadata.tangles[msgHash1].depth, 1, 'msg2 has tangle depth 1')
  t.deepEquals(
    msg2.metadata.tangles[msgHash1].prev,
    [msgHash1],
    'msg2 has tangle prev'
  )

  t.end()
})
