const tape = require('tape')
const FeedV1 = require('../lib/feed-v1')
const { generateKeypair } = require('./util')

tape('simple multi-author tangle', (t) => {
  const keysA = generateKeypair('alice')
  const keysB = generateKeypair('bob')

  const rootMsgA = FeedV1.createRoot(keysA, 'post')
  const rootHashA = FeedV1.getMsgHash(rootMsgA)
  const tangleA = new FeedV1.Tangle(rootHashA)
  tangleA.add(rootHashA, rootMsgA)

  const rootMsgB = FeedV1.createRoot(keysB, 'post')
  const rootHashB = FeedV1.getMsgHash(rootMsgB)
  const tangleB = new FeedV1.Tangle(rootHashB)
  tangleB.add(rootHashB, rootMsgB)

  const msg1 = FeedV1.create({
    keys: keysA,
    content: { text: 'Hello world!' },
    type: 'post',
    tangles: {
      [rootHashA]: tangleA,
    },
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)
  t.deepEquals(
    Object.keys(msg1.metadata.tangles),
    [rootHashA],
    'msg1 has only feed tangle'
  )

  const tangleX = new FeedV1.Tangle(msgHash1)
  tangleX.add(msgHash1, msg1)

  const msg2 = FeedV1.create({
    keys: keysB,
    content: { text: 'Hello world!' },
    type: 'post',
    tangles: {
      [rootHashB]: tangleB,
      [msgHash1]: tangleX,
    },
  })

  t.deepEquals(
    Object.keys(msg2.metadata.tangles),
    [rootHashB, msgHash1],
    'msg2 has feed tangle and misc tangle'
  )
  t.equal(msg2.metadata.tangles[rootHashB].depth, 1, 'msg2 feed tangle depth')
  t.deepEquals(
    msg2.metadata.tangles[rootHashB].prev,
    [rootHashB],
    'msg2 feed tangle prev'
  )

  t.equal(msg2.metadata.tangles[msgHash1].depth, 1, 'msg2 has tangle depth 1')
  t.deepEquals(
    msg2.metadata.tangles[msgHash1].prev,
    [msgHash1],
    'msg2 has tangle prev'
  )

  t.end()
})

tape('lipmaa in multi-author tangle', (t) => {
  const keysA = generateKeypair('alice')
  const keysB = generateKeypair('bob')

  const content = { text: 'Hello world!' }

  const rootMsgA = FeedV1.createRoot(keysA, 'post')
  const rootHashA = FeedV1.getMsgHash(rootMsgA)
  const tangleA = new FeedV1.Tangle(rootHashA)
  tangleA.add(rootHashA, rootMsgA)

  const rootMsgB = FeedV1.createRoot(keysB, 'post')
  const rootHashB = FeedV1.getMsgHash(rootMsgB)
  const tangleB = new FeedV1.Tangle(rootHashB)
  tangleB.add(rootHashB, rootMsgB)

  const msg1 = FeedV1.create({
    keys: keysA,
    content,
    type: 'post',
    tangles: {
      [rootHashA]: tangleA,
    },
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)
  tangleA.add(msgHash1, msg1)
  const tangleThread = new FeedV1.Tangle(msgHash1)
  tangleThread.add(msgHash1, msg1)

  t.deepEquals(
    Object.keys(msg1.metadata.tangles),
    [rootHashA],
    'A:msg1 has only feed tangle'
  )

  const msg2 = FeedV1.create({
    keys: keysB,
    content,
    type: 'post',
    tangles: {
      [rootHashB]: tangleB,
      [msgHash1]: tangleThread,
    },
  })
  const msgHash2 = FeedV1.getMsgHash(msg2)
  tangleB.add(msgHash2, msg2)
  tangleThread.add(msgHash2, msg2)

  t.deepEquals(
    msg2.metadata.tangles[msgHash1].prev,
    [msgHash1],
    'B:msg2 points to A:msg1'
  )

  const msg3 = FeedV1.create({
    keys: keysB,
    content,
    type: 'post',
    tangles: {
      [rootHashB]: tangleB,
      [msgHash1]: tangleThread,
    },
  })
  const msgHash3 = FeedV1.getMsgHash(msg3)
  tangleB.add(msgHash3, msg3)
  tangleThread.add(msgHash3, msg3)

  t.deepEquals(
    msg3.metadata.tangles[msgHash1].prev,
    [msgHash2],
    'B:msg3 points to B:msg2'
  )

  const msg4 = FeedV1.create({
    keys: keysA,
    content,
    type: 'post',
    tangles: {
      [rootHashA]: tangleA,
      [msgHash1]: tangleThread,
    },
  })
  const msgHash4 = FeedV1.getMsgHash(msg4)
  tangleB.add(msgHash4, msg4)
  tangleThread.add(msgHash4, msg4)

  t.deepEquals(
    msg4.metadata.tangles[msgHash1].prev,
    [msgHash1, msgHash3],
    'A:msg4 points to A:msg1,B:msg3'
  )

  t.end()
})
