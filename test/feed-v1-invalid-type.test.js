const tape = require('tape')
const dagfeed = require('../lib/feed-v1')
const { generateKeypair } = require('./util')

tape('invalid type not a string', function (t) {
  const keys = generateKeypair('alice')
  const hmacKey = null

  t.throws(
    () => {
      dagfeed.newNativeMsg({
        keys,
        content: { text: 'Hello world!' },
        timestamp: 1652037377204,
        type: 123,
        previous: [],
        hmacKey,
      })
    },
    /type is not a string/,
    'invalid type if contains /'
  )
  t.end()
})

tape('invalid type with "/" character', function (t) {
  const keys = generateKeypair('alice')
  const hmacKey = null

  t.throws(
    () => {
      dagfeed.newNativeMsg({
        keys,
        content: { text: 'Hello world!' },
        timestamp: 1652037377204,
        type: 'group/init',
        previous: [],
        hmacKey,
      })
    },
    /invalid type/,
    'invalid type if contains /'
  )
  t.end()
})

tape('invalid type with "*" character', function (t) {
  const keys = generateKeypair('alice')
  const hmacKey = null

  t.throws(
    () => {
      dagfeed.newNativeMsg({
        keys,
        content: { text: 'Hello world!' },
        timestamp: 1652037377204,
        type: 'star*',
        previous: [],
        hmacKey,
      })
    },
    /invalid type/,
    'invalid type if contains *'
  )
  t.end()
})

tape('invalid type too short', function (t) {
  const keys = generateKeypair('alice')
  const hmacKey = null

  t.throws(
    () => {
      dagfeed.newNativeMsg({
        keys,
        content: { text: 'Hello world!' },
        timestamp: 1652037377204,
        type: 'xy',
        previous: [],
        hmacKey,
      })
    },
    /shorter than 3/,
    'invalid type if too short'
  )
  t.end()
})

tape('invalid type too long', function (t) {
  const keys = generateKeypair('alice')
  const hmacKey = null

  t.throws(
    () => {
      dagfeed.newNativeMsg({
        keys,
        content: { text: 'Hello world!' },
        timestamp: 1652037377204,
        type: 'a'.repeat(120),
        previous: [],
        hmacKey,
      })
    },
    /100\+ characters long/,
    'invalid type if too long'
  )

  t.end()
})
