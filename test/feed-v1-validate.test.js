const tape = require('tape')
const base58 = require('bs58')
const FeedV1 = require('../lib/feed-v1')
const { generateKeypair } = require('./util')

tape('validate 1st msg', (t) => {
  const keys = generateKeypair('alice')

  const msg = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    existing: new Map(),
    tips: new Map(),
    when: 1652030001000,
  })

  FeedV1.validate(msg, [], (err) => {
    if (err) console.log(err)
    t.error(err, 'valid 1st msg')
    t.end()
  })
})

tape('validate 2nd msg with existing nativeMsg', (t) => {
  const keys = generateKeypair('alice')

  const msg1 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    existing: new Map(),
    tips: new Map(),
    when: 1652030001000,
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)

  const msg2 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    existing: new Map([[msgHash1, msg1]]),
    tips: new Map([[msgHash1, msg1]]),
    when: 1652030002000,
  })

  const existing = new Map()
  existing.set(msgHash1, msg1)
  FeedV1.validate(msg2, existing, (err) => {
    if (err) console.log(err)
    t.error(err, 'valid 2nd msg')
    t.end()
  })
})

tape('validate 2nd msg with existing msgId', (t) => {
  const keys = generateKeypair('alice')

  const msg1 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    prev: [],
    existing: new Map(),
    tips: new Map(),
    when: 1652030001000,
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)

  const msg2 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    existing: new Map([[msgHash1, msg1]]),
    tips: new Map([[msgHash1, msg1]]),
    when: 1652030002000,
  })

  const existing = new Map()
  existing.set(msgHash1, msg1)
  FeedV1.validate(msg2, existing, (err) => {
    if (err) console.log(err)
    t.error(err, 'valid 2nd msg')
    t.end()
  })
})

tape('validate 2nd msg with existing KVT', (t) => {
  const keys = generateKeypair('alice')

  const msg1 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    existing: new Map(),
    tips: new Map(),
    when: 1652030001000,
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)

  const msg2 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    existing: new Map([[msgHash1, msg1]]),
    tips: new Map([[msgHash1, msg1]]),
    when: 1652030002000,
  })

  const existing = new Map()
  existing.set(msgHash1, msg1)
  FeedV1.validate(msg2, existing, (err) => {
    if (err) console.log(err)
    t.error(err, 'valid 2nd msg')
    t.end()
  })
})

tape('validate 2nd forked msg', (t) => {
  const keys = generateKeypair('alice')

  const msg1 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    existing: new Map(),
    tips: new Map(),
    when: 1652030001000,
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)

  const msg2A = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    existing: new Map([[msgHash1, msg1]]),
    tips: new Map([[msgHash1, msg1]]),
    when: 1652030002000,
  })
  const msgHash2A = FeedV1.getMsgHash(msg2A)

  const msg2B = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    existing: new Map([[msgHash1, msg1]]),
    tips: new Map([[msgHash1, msg1]]),
    when: 1652030003000,
  })

  const existing = new Map()
  existing.set(msgHash1, msg1)
  existing.set(msgHash2A, msg2A)
  FeedV1.validate(msg2B, existing, (err) => {
    if (err) console.log(err)
    t.error(err, 'valid 2nd forked msg')
    t.end()
  })
})

tape('invalid msg with unknown previous', (t) => {
  const keys = generateKeypair('alice')

  const msg1 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    existing: new Map(),
    tips: new Map(),
    when: 1652030001000,
  })
  const msgHash1 = FeedV1.getMsgHash(msg1)

  const fakeMsgKey1 = base58.encode(Buffer.alloc(16).fill(42))

  const msg2 = FeedV1.create({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    existing: new Map([[msgHash1, msg1]]),
    tips: new Map([[msgHash1, msg1]]),
    when: 1652030002000,
  })
  msg2.metadata.prev = [fakeMsgKey1]

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
