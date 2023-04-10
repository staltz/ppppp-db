const tape = require('tape')
const FeedV1 = require('../lib/feed-v1')
const { generateKeypair } = require('./util')

tape('simple multi-author tangle', (t) => {
  const keysA = generateKeypair('alice')
  const keysB = generateKeypair('bob')
  const existingA = new Map()
  const existingB = new Map()

  const rootMsgA = FeedV1.createRoot(keysA, 'post')
  const rootHashA = FeedV1.getMsgHash(rootMsgA)
  existingA.set(rootHashA, rootMsgA)

  const rootMsgB = FeedV1.createRoot(keysB, 'post')
  const rootHashB = FeedV1.getMsgHash(rootMsgB)
  existingB.set(rootHashB, rootMsgB)

  const msg1 = FeedV1.create({
    keys: keysA,
    content: { text: 'Hello world!' },
    type: 'post',
    tangles: {
      [rootHashA]: existingA,
    },
    when: 1652030001000,
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)
  t.deepEquals(
    Object.keys(msg1.metadata.tangles),
    [rootHashA],
    'msg1 has only feed tangle'
  )

  const msg2 = FeedV1.create({
    keys: keysB,
    content: { text: 'Hello world!' },
    type: 'post',
    existing: new Map(),
    tangles: {
      [rootHashB]: existingB,
      [msgHash1]: new Map([[msgHash1, msg1]]),
    },
    when: 1652030002000,
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
  const when = 1652037377204
  const existingA = new Map()
  const existingB = new Map()
  const tangleExisting = new Map()

  const rootMsgA = FeedV1.createRoot(keysA, 'post')
  const rootHashA = FeedV1.getMsgHash(rootMsgA)
  existingA.set(rootHashA, rootMsgA)

  const rootMsgB = FeedV1.createRoot(keysB, 'post')
  const rootHashB = FeedV1.getMsgHash(rootMsgB)
  existingB.set(rootHashB, rootMsgB)


  const msg1 = FeedV1.create({
    keys: keysA,
    content,
    type: 'post',
    tangles: {
      [rootHashA]: existingA,
    },
    when: when + 1,
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)
  existingA.set(msgHash1, msg1)
  tangleExisting.set(msgHash1, msg1)

  t.deepEquals(Object.keys(msg1.metadata.tangles),[rootHashA], 'A:msg1 has only feed tangle')

  const msg2 = FeedV1.create({
    keys: keysB,
    content,
    type: 'post',
    existing: existingB,
    tangles: {
      [rootHashB]: existingB,
      [msgHash1]: tangleExisting,
    },
    when: when + 2,
  })
  const msgHash2 = FeedV1.getMsgHash(msg2)
  existingB.set(msgHash2, msg2)
  tangleExisting.set(msgHash2, msg2)

  t.deepEquals(
    msg2.metadata.tangles[msgHash1].prev,
    [msgHash1],
    'B:msg2 points to A:msg1'
  )

  const msg3 = FeedV1.create({
    keys: keysB,
    content,
    type: 'post',
    existing: existingB,
    tangles: {
      [rootHashB]: existingB,
      [msgHash1]: tangleExisting,
    },
    when: when + 3,
  })
  const msgHash3 = FeedV1.getMsgHash(msg3)
  existingB.set(msgHash3, msg3)
  tangleExisting.set(msgHash3, msg3)

  t.deepEquals(
    msg3.metadata.tangles[msgHash1].prev,
    [msgHash2],
    'B:msg3 points to B:msg2'
  )

  const msg4 = FeedV1.create({
    keys: keysA,
    content,
    type: 'post',
    existing: existingA,
    tangles: {
      [rootHashA]: existingA,
      [msgHash1]: tangleExisting,
    },
    when: when + 4,
  })
  const msgHash4 = FeedV1.getMsgHash(msg4)
  existingB.set(msgHash4, msg4)
  tangleExisting.set(msgHash4, msg4)

  t.deepEquals(
    msg4.metadata.tangles[msgHash1].prev,
    [msgHash1, msgHash3],
    'A:msg4 points to A:msg1,B:msg3'
  )

  t.end()
})
