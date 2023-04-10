const tape = require('tape')
const base58 = require('bs58')
const FeedV1 = require('../lib/feed-v1')
const { generateKeypair } = require('./util')

tape('invalid msg with non-array prev', (t) => {
  const keys = generateKeypair('alice')

  const rootMsg = FeedV1.createRoot(keys, 'post')
  const rootHash = FeedV1.getMsgHash(rootMsg)

  const existing = new Map([[rootHash, rootMsg]])

  const msg = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    tangles: {
      [rootHash]: existing,
    },
    when: 1652030001000,
  })
  msg.metadata.tangles[rootHash].prev = null
  const msgHash = FeedV1.getMsgHash(msg)

  FeedV1.validate(msg, existing, msgHash, rootHash, (err) => {
    t.ok(err, 'invalid 2nd msg throws')
    t.match(err.message, /prev must be an array/, 'invalid 2nd msg description')
    t.end()
  })
})

tape('invalid msg with bad prev', (t) => {
  const keys = generateKeypair('alice')

  const rootMsg = FeedV1.createRoot(keys, 'post')
  const rootHash = FeedV1.getMsgHash(rootMsg)

  const existing = new Map([[rootHash, rootMsg]])

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

  const msg2 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    tangles: {
      [rootHash]: existing,
    },
    when: 1652030002000,
  })
  msg2.metadata.tangles[rootHash].depth = 1
  msg2.metadata.tangles[rootHash].prev = [1234]
  const msgHash2 = FeedV1.getMsgHash(msg2)

  FeedV1.validate(msg2, existing, msgHash2, rootHash, (err) => {
    t.ok(err, 'invalid 2nd msg throws')
    t.match(
      err.message,
      /prev must contain strings/,
      'invalid 2nd msg description'
    )
    t.end()
  })
})

tape('invalid msg with URI in prev', (t) => {
  const keys = generateKeypair('alice')

  const rootMsg = FeedV1.createRoot(keys, 'post')
  const rootHash = FeedV1.getMsgHash(rootMsg)

  const existing = new Map([[rootHash, rootMsg]])

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

  const msg2 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    tangles: {
      [rootHash]: existing,
    },
    when: 1652030002000,
  })
  const msgHash2 = FeedV1.getMsgHash(msg2)
  const randBuf = Buffer.alloc(16).fill(16)
  const fakeMsgKey1 = `ppppp:message/v1/${base58.encode(randBuf)}`
  msg2.metadata.tangles[rootHash].depth = 1
  msg2.metadata.tangles[rootHash].prev = [fakeMsgKey1]

  FeedV1.validate(msg2, existing, msgHash2, rootHash, (err) => {
    t.ok(err, 'invalid 2nd msg throws')
    t.match(
      err.message,
      /prev must not contain URIs/,
      'invalid 2nd msg description'
    )
    t.end()
  })
})

tape('invalid msg with unknown prev', (t) => {
  const keys = generateKeypair('alice')

  const rootMsg = FeedV1.createRoot(keys, 'post')
  const rootHash = FeedV1.getMsgHash(rootMsg)

  const existing = new Map([[rootHash, rootMsg]])

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

  const unknownMsg = FeedV1.create({
    keys,
    content: { text: 'Alien' },
    type: 'post',
    tangles: {
      [rootHash]: existing,
    },
    when: 1652030001000,
  })
  const unknownMsgHash = FeedV1.getMsgHash(unknownMsg)

  const msg2 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    tangles: {
      [rootHash]: new Map([[rootHash, rootMsg], [unknownMsgHash, unknownMsg]]),
    },
    when: 1652030002000,
  })
  const msgHash2 = FeedV1.getMsgHash(msg2)

  FeedV1.validate(msg2, existing, msgHash2, rootHash, (err) => {
    t.ok(err, 'invalid 2nd msg throws')
    t.match(
      err.message,
      /prev .+ is not locally known/,
      'invalid 2nd msg description'
    )
    t.end()
  })
})
