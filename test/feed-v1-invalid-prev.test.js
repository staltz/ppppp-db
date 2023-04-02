const tape = require('tape')
const base58 = require('bs58')
const FeedV1 = require('../lib/feed-v1')
const { generateKeypair } = require('./util')

tape('invalid 1st msg with non-empty prev', (t) => {
  const keys = generateKeypair('alice')

  const msg = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    prev: [{ metadata: { depth: 10 }, sig: 'fake' }],
    when: 1652030001000,
  })

  FeedV1.validate(msg, new Map(), (err) => {
    t.ok(err, 'invalid 2nd msg throws')
    t.match(
      err.message,
      /prev .+ is not locally known/,
      'invalid 2nd msg description'
    )
    t.end()
  })
})

tape('invalid 1st msg with non-array prev', (t) => {
  const keys = generateKeypair('alice')

  const msg = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    prev: [],
    when: 1652030001000,
  })
  msg.metadata.prev = null

  FeedV1.validate(msg, new Map(), (err) => {
    t.ok(err, 'invalid 2nd msg throws')
    t.match(err.message, /prev must be an array/, 'invalid 2nd msg description')
    t.end()
  })
})

tape('invalid msg with non-array prev', (t) => {
  const keys = generateKeypair('alice')

  const msg1 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    prev: [],
    when: 1652030001000,
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)

  const msg2 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    prev: [{ metadata: { depth: 10 }, sig: 'fake' }],
    when: 1652030002000,
  })
  msg2.metadata.prev = null

  const existing = new Map()
  existing.set(msgHash1, msg1)
  FeedV1.validate(msg2, existing, (err) => {
    t.ok(err, 'invalid 2nd msg throws')
    t.match(
      err.message,
      /prev must be an iterator/,
      'invalid 2nd msg description'
    )
    t.end()
  })
})

tape('invalid msg with bad prev', (t) => {
  const keys = generateKeypair('alice')

  const msg1 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    prev: [],
    when: 1652030001000,
  })
const msgHash1 = FeedV1.getMsgHash(msg1)

  const msg2 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    prev: [{ metadata: { depth: 10 }, sig: 'fake' }],
    when: 1652030002000,
  })
  msg2.metadata.prev = [1234]

  const existing = new Map()
  existing.set(msgHash1, msg1)
  FeedV1.validate(msg2, existing, (err) => {
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

  const msg1 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    prev: [],
    when: 1652030001000,
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)

  const msg2 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    prev: [{ metadata: { depth: 10 }, sig: 'fake' }],
    when: 1652030002000,
  })
  const randBuf = Buffer.alloc(16).fill(16)
  const fakeMsgKey1 = `ppppp:message/v1/${base58.encode(randBuf)}`
  msg2.metadata.prev = [fakeMsgKey1]

  const existing = new Map()
  existing.set(msgHash1, msg1)
  FeedV1.validate(msg2, existing, (err) => {
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

  const msg1 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    prev: [],
    when: 1652030001000,
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)

  const unknownMsg = FeedV1.create({
    keys,
    content: { text: 'Alien' },
    type: 'post',
    prev: [],
    when: 1652030001000,
  })

  const msg2 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    prev: [unknownMsg],
    when: 1652030002000,
  })

  const existing = new Map()
  existing.set(msgHash1, msg1)
  FeedV1.validate(msg2, existing, (err) => {
    t.ok(err, 'invalid 2nd msg throws')
    t.match(
      err.message,
      /prev .+ is not locally known/,
      'invalid 2nd msg description'
    )
    t.end()
  })
})

tape('invalid msg with unknown prev in a Set', (t) => {
  const keys = generateKeypair('alice')

  const msg1 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    prev: [],
    when: 1652030001000,
  })

  const msg2 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    prev: [{ metadata: { depth: 10 }, sig: 'fake' }],
    when: 1652030002000,
  })
  const fakeMsgKey1 = base58.encode(Buffer.alloc(16).fill(42))
  msg2.metadata.prev = [fakeMsgKey1]

  const existing = new Set([msg1])

  FeedV1.validate(msg2, existing, (err) => {
    t.ok(err, 'invalid 2nd msg throws')
    t.match(
      err.message,
      /prev .+ is not locally known/,
      'invalid 2nd msg description'
    )
    t.end()
  })
})
