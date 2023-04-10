const tape = require('tape')
const base58 = require('bs58')
const FeedV1 = require('../lib/feed-v1')
const { generateKeypair } = require('./util')

tape('validate root msg', (t) => {
  const keys = generateKeypair('alice')
  const existing = new Map()

  const rootMsg = FeedV1.createRoot(keys, 'post')
  const rootHash = FeedV1.getMsgHash(rootMsg)
  existing.set(rootHash, rootMsg)

  FeedV1.validate(rootMsg, existing, rootHash, rootHash, (err) => {
    if (err) console.log(err)
    t.error(err, 'valid root msg')
    t.end()
  })
})

tape('validate 2nd msg with existing root', (t) => {
  const keys = generateKeypair('alice')
  const existing = new Map()

  const rootMsg = FeedV1.createRoot(keys, 'post')
  const rootHash = FeedV1.getMsgHash(rootMsg)
  existing.set(rootHash, rootMsg)

  const msg1 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    tangles: {
      [rootHash]: existing,
    },
    when: 1652030001000,
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)
  existing.set(msgHash1, msg1)

  FeedV1.validate(msg1, existing, msgHash1, rootHash, (err) => {
    if (err) console.log(err)
    t.error(err, 'valid 2nd msg')
    t.end()
  })
})

tape('validate 2nd forked msg', (t) => {
  const keys = generateKeypair('alice')

  const existing = new Map()

  const rootMsg = FeedV1.createRoot(keys, 'post')
  const rootHash = FeedV1.getMsgHash(rootMsg)
  existing.set(rootHash, rootMsg)

  const msg1A = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    tangles: {
      [rootHash]: existing,
    },
    existing: new Map(),
    when: 1652030001000,
  })
  const msgHash1A = FeedV1.getMsgHash(msg1A)

  const msg1B = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    tangles: {
      [rootHash]: existing,
    },
    when: 1652030002000,
  })
  const msgHash1B = FeedV1.getMsgHash(msg1B)

  existing.set(msgHash1A, msg1A)
  existing.set(msgHash1B, msg1B)
  FeedV1.validate(msg1B, existing, msgHash1B, rootHash, (err) => {
    if (err) console.log(err)
    t.error(err, 'valid 2nd forked msg')
    t.end()
  })
})

tape('invalid msg with unknown previous', (t) => {
  const keys = generateKeypair('alice')

  const existing = new Map()

  const rootMsg = FeedV1.createRoot(keys, 'post')
  const rootHash = FeedV1.getMsgHash(rootMsg)
  existing.set(rootHash, rootMsg)

  const msg1 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    tangles: {
      [rootHash]: existing,
    },
    when: 1652030001000,
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)

  const fakeMsgHash = base58.encode(Buffer.alloc(16).fill(42))

  msg1.metadata.tangles[rootHash].prev = [fakeMsgHash]

  FeedV1.validate(msg1, existing, msgHash1, rootHash, (err) => {
    t.ok(err, 'invalid 2nd msg throws')
    t.match(
      err.message,
      /prev .+ is not locally known/,
      'invalid 2nd msg description'
    )
    t.end()
  })
})
