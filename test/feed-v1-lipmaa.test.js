const tape = require('tape')
const FeedV1 = require('../lib/feed-v1')
const { generateKeypair } = require('./util')

tape('lipmaa prevs', (t) => {
  const keys = generateKeypair('alice')
  const content = { text: 'Hello world!' }

  const rootMsg = FeedV1.createRoot(keys, 'post')
  const rootHash = FeedV1.getMsgHash(rootMsg)
  const tangle = new FeedV1.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = FeedV1.create({
    keys,
    content,
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)
  tangle.add(msgHash1, msg1)
  t.equals(msg1.metadata.tangles[rootHash].depth, 1, 'msg1 depth')
  t.deepEquals(msg1.metadata.tangles[rootHash].prev, [rootHash], 'msg1 prev')

  const msg2 = FeedV1.create({
    keys,
    content,
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash2 = FeedV1.getMsgHash(msg2)
  tangle.add(msgHash2, msg2)
  t.equals(msg2.metadata.tangles[rootHash].depth, 2, 'msg2 depth')
  t.deepEquals(msg2.metadata.tangles[rootHash].prev, [msgHash1], 'msg2 prev')

  const msg3 = FeedV1.create({
    keys,
    content,
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash3 = FeedV1.getMsgHash(msg3)
  tangle.add(msgHash3, msg3)
  t.equals(msg3.metadata.tangles[rootHash].depth, 3, 'msg3 depth')
  t.deepEquals(
    msg3.metadata.tangles[rootHash].prev,
    [rootHash, msgHash2],
    'msg3 prev (has lipmaa!)'
  )

  const msg4 = FeedV1.create({
    keys,
    content,
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash4 = FeedV1.getMsgHash(msg4)
  tangle.add(msgHash4, msg4)
  t.equals(msg4.metadata.tangles[rootHash].depth, 4, 'msg4 depth')
  t.deepEquals(msg4.metadata.tangles[rootHash].prev, [msgHash3], 'msg4 prev')

  const msg5 = FeedV1.create({
    keys,
    content,
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash5 = FeedV1.getMsgHash(msg5)
  tangle.add(msgHash5, msg5)
  t.equals(msg5.metadata.tangles[rootHash].depth, 5, 'msg5 depth')
  t.deepEquals(msg5.metadata.tangles[rootHash].prev, [msgHash4], 'msg5 prev')

  const msg6 = FeedV1.create({
    keys,
    content,
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash6 = FeedV1.getMsgHash(msg6)
  tangle.add(msgHash6, msg6)
  t.equals(msg6.metadata.tangles[rootHash].depth, 6, 'msg6 depth')
  t.deepEquals(msg6.metadata.tangles[rootHash].prev, [msgHash5], 'msg6 prev')

  const msg7 = FeedV1.create({
    keys,
    content,
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash7 = FeedV1.getMsgHash(msg7)
  tangle.add(msgHash7, msg7)
  t.equals(msg7.metadata.tangles[rootHash].depth, 7, 'msg7 depth')
  t.deepEquals(
    msg7.metadata.tangles[rootHash].prev,
    [msgHash3, msgHash6],
    'msg7 prev (has lipmaa!)'
  )

  t.end()
})
