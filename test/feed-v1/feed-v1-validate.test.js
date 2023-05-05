const tape = require('tape')
const base58 = require('bs58')
const FeedV1 = require('../../lib/feed-v1')
const { generateKeypair } = require('../util')

tape('validate root msg', (t) => {
  const keys = generateKeypair('alice')

  const rootMsg = FeedV1.createRoot(keys, 'post')
  const rootHash = FeedV1.getMsgHash(rootMsg)
  const tangle = new FeedV1.Tangle(rootHash)

  const err = FeedV1.validate(rootMsg, tangle, rootHash, rootHash)
  if (err) console.log(err)
  t.error(err, 'valid root msg')
  t.end()
})

tape('validate 2nd msg with existing root', (t) => {
  const keys = generateKeypair('alice')

  const rootMsg = FeedV1.createRoot(keys, 'post')
  const rootHash = FeedV1.getMsgHash(rootMsg)
  const tangle = new FeedV1.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)
  tangle.add(msgHash1, msg1)

  const err = FeedV1.validate(msg1, tangle, msgHash1, rootHash)
  if (err) console.log(err)
  t.error(err, 'valid 2nd msg')
  t.end()
})

tape('validate 2nd forked msg', (t) => {
  const keys = generateKeypair('alice')

  const rootMsg = FeedV1.createRoot(keys, 'post')
  const rootHash = FeedV1.getMsgHash(rootMsg)
  const tangle = new FeedV1.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1A = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
    existing: new Map(),
  })
  const msgHash1A = FeedV1.getMsgHash(msg1A)

  const msg1B = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash1B = FeedV1.getMsgHash(msg1B)

  tangle.add(msgHash1A, msg1A)
  tangle.add(msgHash1B, msg1B)
  const err = FeedV1.validate(msg1B, tangle, msgHash1B, rootHash)
  if (err) console.log(err)
  t.error(err, 'valid 2nd forked msg')
  t.end()
})

tape('invalid msg with unknown previous', (t) => {
  const keys = generateKeypair('alice')

  const rootMsg = FeedV1.createRoot(keys, 'post')
  const rootHash = FeedV1.getMsgHash(rootMsg)
  const tangle = new FeedV1.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)

  const fakeMsgHash = base58.encode(Buffer.alloc(16).fill(42))

  msg1.metadata.tangles[rootHash].prev = [fakeMsgHash]

  const err = FeedV1.validate(msg1, tangle, msgHash1, rootHash)
  t.ok(err, 'invalid 2nd msg throws')
  t.match(
    err.message,
    /all prev are locally unknown/,
    'invalid 2nd msg description'
  )
  t.end()
})
