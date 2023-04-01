const tape = require('tape')
const base58 = require('bs58')
const dagfeed = require('../lib/feed-v1')
const { generateKeypair } = require('./util')

tape('validate 1st msg', (t) => {
  const keys = generateKeypair('alice')
  const hmacKey = null

  const nmsg1 = dagfeed.newNativeMsg({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    previous: [],
    timestamp: 1652030001000,
    hmacKey,
  })

  dagfeed.validate(nmsg1, null, null, (err) => {
    if (err) console.log(err)
    t.error(err, 'valid 1st msg')
    t.end()
  })
})

tape('validate 2nd msg with existing nativeMsg', (t) => {
  const keys = generateKeypair('alice')
  const hmacKey = null

  const nmsg1 = dagfeed.newNativeMsg({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    previous: [],
    timestamp: 1652030001000,
    hmacKey,
  })
  const msgKey1 = dagfeed.getMsgId(nmsg1)

  const nmsg2 = dagfeed.newNativeMsg({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    previous: [msgKey1],
    timestamp: 1652030002000,
    hmacKey,
  })

  dagfeed.validate(nmsg2, [nmsg1], null, (err) => {
    if (err) console.log(err)
    t.error(err, 'valid 2nd msg')
    t.end()
  })
})

tape('validate 2nd msg with existing msgId', (t) => {
  const keys = generateKeypair('alice')
  const hmacKey = null

  const nmsg1 = dagfeed.newNativeMsg({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    previous: [],
    timestamp: 1652030001000,
    hmacKey,
  })
  const msgKey1 = dagfeed.getMsgId(nmsg1)

  const nmsg2 = dagfeed.newNativeMsg({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    previous: [msgKey1],
    timestamp: 1652030002000,
    hmacKey,
  })

  dagfeed.validate(nmsg2, [msgKey1], null, (err) => {
    if (err) console.log(err)
    t.error(err, 'valid 2nd msg')
    t.end()
  })
})

tape('validate 2nd msg with existing msgId in a Set', (t) => {
  const keys = generateKeypair('alice')
  const hmacKey = null

  const nmsg1 = dagfeed.newNativeMsg({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    previous: [],
    timestamp: 1652030001000,
    hmacKey,
  })
  const msgId1 = dagfeed.getMsgHash(nmsg1)

  const nmsg2 = dagfeed.newNativeMsg({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    previous: [msgId1],
    timestamp: 1652030002000,
    hmacKey,
  })

  const existing = new Set([msgId1])

  dagfeed.validate(nmsg2, existing, null, (err) => {
    if (err) console.log(err)
    t.error(err, 'valid 2nd msg')
    t.end()
  })
})

tape('validate 2nd msg with existing KVT', (t) => {
  const keys = generateKeypair('alice')
  const hmacKey = null

  const nmsg1 = dagfeed.newNativeMsg({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    previous: [],
    timestamp: 1652030001000,
    hmacKey,
  })
  const kvt1 = {
    key: dagfeed.getMsgId(nmsg1),
    value: dagfeed.fromNativeMsg(nmsg1),
    timestamp: Date.now(),
  }

  const nmsg2 = dagfeed.newNativeMsg({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    previous: [kvt1.key],
    timestamp: 1652030002000,
    hmacKey,
  })

  dagfeed.validate(nmsg2, [kvt1], null, (err) => {
    if (err) console.log(err)
    t.error(err, 'valid 2nd msg')
    t.end()
  })
})

tape('validate 2nd forked msg', (t) => {
  const keys = generateKeypair('alice')
  const hmacKey = null

  const nmsg1 = dagfeed.newNativeMsg({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    previous: [],
    timestamp: 1652030001000,
    hmacKey,
  })
  const msgKey1 = dagfeed.getMsgId(nmsg1)

  const nmsg2A = dagfeed.newNativeMsg({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    previous: [msgKey1],
    timestamp: 1652030002000,
    hmacKey,
  })

  const nmsg2B = dagfeed.newNativeMsg({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    previous: [msgKey1],
    timestamp: 1652030003000,
    hmacKey,
  })

  dagfeed.validate(nmsg2B, [nmsg1, nmsg2A], null, (err) => {
    if (err) console.log(err)
    t.error(err, 'valid 2nd forked msg')
    t.end()
  })
})

tape('invalid msg with unknown previous', (t) => {
  const keys = generateKeypair('alice')
  const hmacKey = null

  const nmsg1 = dagfeed.newNativeMsg({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    previous: [],
    timestamp: 1652030001000,
    hmacKey,
  })

  const fakeMsgKey1 = base58.encode(Buffer.alloc(16).fill(42))

  const nmsg2 = dagfeed.newNativeMsg({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    previous: [fakeMsgKey1],
    timestamp: 1652030002000,
    hmacKey,
  })

  dagfeed.validate(nmsg2, [nmsg1], null, (err) => {
    t.ok(err, 'invalid 2nd msg throws')
    t.match(
      err.message,
      /previous .+ is not a known message ID/,
      'invalid 2nd msg description'
    )
    t.end()
  })
})
