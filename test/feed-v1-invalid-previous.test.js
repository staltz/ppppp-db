const tape = require('tape')
const base58 = require('bs58')
const dagfeed = require('../lib/feed-v1')
const { generateKeypair } = require('./util')

tape('invalid 1st msg with non-empty previous', (t) => {
  const keys = generateKeypair('alice')
  const hmacKey = null

  const fakeMsgKey0 = base58.encode(Buffer.alloc(16).fill(42))

  const nmsg1 = dagfeed.newNativeMsg({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    previous: [fakeMsgKey0],
    timestamp: 1652030001000,
    hmacKey,
  })

  dagfeed.validate(nmsg1, [], null, (err) => {
    t.ok(err, 'invalid 2nd msg throws')
    t.match(
      err.message,
      /previous must be an empty array/,
      'invalid 2nd msg description'
    )
    t.end()
  })
})

tape('invalid 1st msg with non-array previous', (t) => {
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
  nmsg1.metadata.previous = null

  dagfeed.validate(nmsg1, [], null, (err) => {
    t.ok(err, 'invalid 2nd msg throws')
    t.match(
      err.message,
      /previous must be an array/,
      'invalid 2nd msg description'
    )
    t.end()
  })
})

tape('invalid msg with non-array previous', (t) => {
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

  const fakeMsgKey1 = `ssb:message/dag/${base58.encode(
    Buffer.alloc(16).fill(42)
  )}`

  const nmsg2 = dagfeed.newNativeMsg({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    previous: [fakeMsgKey1],
    timestamp: 1652030002000,
    hmacKey,
  })
  nmsg2.metadata.previous = null

  dagfeed.validate(nmsg2, [nmsg1], null, (err) => {
    t.ok(err, 'invalid 2nd msg throws')
    t.match(
      err.message,
      /previous must be an array/,
      'invalid 2nd msg description'
    )
    t.end()
  })
})

tape('invalid msg with bad previous', (t) => {
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

  const fakeMsgKey1 = `ssb:message/dag/${base58.encode(
    Buffer.alloc(16).fill(42)
  )}`

  const nmsg2 = dagfeed.newNativeMsg({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    previous: [fakeMsgKey1],
    timestamp: 1652030002000,
    hmacKey,
  })
  nmsg2.metadata.previous = [1234]

  dagfeed.validate(nmsg2, [nmsg1], null, (err) => {
    t.ok(err, 'invalid 2nd msg throws')
    t.match(
      err.message,
      /previous must contain strings/,
      'invalid 2nd msg description'
    )
    t.end()
  })
})

tape('invalid msg with SSB URI previous', (t) => {
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

  const fakeMsgKey1 = `ssb:message/dag/${base58.encode(
    Buffer.alloc(16).fill(42)
  )}`

  const nmsg2 = dagfeed.newNativeMsg({
    keys,
    content: { text: 'Hello world!' },
    type: 'post',
    previous: [fakeMsgKey1],
    timestamp: 1652030002000,
    hmacKey,
  })
  nmsg2.metadata.previous = [fakeMsgKey1]

  dagfeed.validate(nmsg2, [nmsg1], null, (err) => {
    t.ok(err, 'invalid 2nd msg throws')
    t.match(
      err.message,
      /previous must not contain SSB URIs/,
      'invalid 2nd msg description'
    )
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

tape('invalid msg with unknown previous in a Set', (t) => {
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

  const existing = new Set([nmsg1])

  dagfeed.validate(nmsg2, existing, null, (err) => {
    t.ok(err, 'invalid 2nd msg throws')
    t.match(
      err.message,
      /previous .+ is not a known message ID/,
      'invalid 2nd msg description'
    )
    t.end()
  })
})
