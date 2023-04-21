const test = require('tape')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const p = require('util').promisify
const { generateKeypair } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-msgs-iter')
rimraf.sync(DIR)

test('msgs() iterator', async (t) => {
  const keys = generateKeypair('alice')
  const peer = SecretStack({ appKey: caps.shs })
    .use(require('../lib'))
    .call(null, { keys, path: DIR })

  await peer.db.loaded()

  for (let i = 0; i < 6; i++) {
    await p(peer.db.create)({
      type: i % 2 === 0 ? 'post' : 'about',
      content:
        i % 2 === 0
          ? { text: 'hello ' + i }
          : { about: peer.id, name: 'Mr. #' + i },
    })
  }

  const posts = []
  const abouts = []
  for (const msg of peer.db.msgs()) {
    if (!msg.content) continue
    if (msg.metadata.type === 'post') posts.push(msg.content.text)
    else if (msg.metadata.type === 'about') abouts.push(msg.content.name)
  }

  t.deepEqual(posts, ['hello 0', 'hello 2', 'hello 4'], 'queried posts')
  t.deepEqual(abouts, ['Mr. #1', 'Mr. #3', 'Mr. #5'], 'queried abouts')

  await p(peer.close)(true)
})
