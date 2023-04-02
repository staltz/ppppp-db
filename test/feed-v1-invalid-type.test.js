const tape = require('tape')
const FeedV1 = require('../lib/feed-v1')
const { generateKeypair } = require('./util')

tape('invalid type not a string', (t) => {
  const keys = generateKeypair('alice')

  t.throws(
    () => {
      FeedV1.create({
        keys,
        content: { text: 'Hello world!' },
        when: 1652037377204,
        type: 123,
        prev: [],
      })
    },
    /type is not a string/,
    'invalid type if contains /'
  )
  t.end()
})

tape('invalid type with "/" character', (t) => {
  const keys = generateKeypair('alice')

  t.throws(
    () => {
      FeedV1.create({
        keys,
        content: { text: 'Hello world!' },
        when: 1652037377204,
        type: 'group/init',
        prev: [],
      })
    },
    /invalid type/,
    'invalid type if contains /'
  )
  t.end()
})

tape('invalid type with "*" character', (t) => {
  const keys = generateKeypair('alice')

  t.throws(
    () => {
      FeedV1.create({
        keys,
        content: { text: 'Hello world!' },
        when: 1652037377204,
        type: 'star*',
        prev: [],
      })
    },
    /invalid type/,
    'invalid type if contains *'
  )
  t.end()
})

tape('invalid type too short', (t) => {
  const keys = generateKeypair('alice')

  t.throws(
    () => {
      FeedV1.create({
        keys,
        content: { text: 'Hello world!' },
        when: 1652037377204,
        type: 'xy',
        prev: [],
      })
    },
    /shorter than 3/,
    'invalid type if too short'
  )
  t.end()
})

tape('invalid type too long', (t) => {
  const keys = generateKeypair('alice')

  t.throws(
    () => {
      FeedV1.create({
        keys,
        content: { text: 'Hello world!' },
        when: 1652037377204,
        type: 'a'.repeat(120),
        prev: [],
      })
    },
    /100\+ characters long/,
    'invalid type if too long'
  )

  t.end()
})
