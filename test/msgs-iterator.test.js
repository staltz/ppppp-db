const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const Keypair = require('ppppp-keypair')
const { createPeer } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-msgs-iter')
rimraf.sync(DIR)

test('msgs() iterator', async (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const peer = createPeer({ keypair, path: DIR })

  await peer.db.loaded()

  const account = await p(peer.db.account.create)({ subdomain: 'person' })

  for (let i = 0; i < 6; i++) {
    await p(peer.db.feed.publish)({
      account,
      domain: i % 2 === 0 ? 'post' : 'about',
      data:
        i % 2 === 0
          ? { text: 'hello ' + i }
          : { about: keypair.public, name: 'Mr. #' + i },
    })
  }

  const posts = []
  const abouts = []
  for await (const msg of peer.db.msgs()) {
    if (!msg.data) continue
    if (msg.metadata.domain === 'post') posts.push(msg.data.text)
    else if (msg.metadata.domain === 'about') abouts.push(msg.data.name)
  }

  assert.deepEqual(posts, ['hello 0', 'hello 2', 'hello 4'], 'queried posts')
  assert.deepEqual(abouts, ['Mr. #1', 'Mr. #3', 'Mr. #5'], 'queried abouts')

  await p(peer.close)(true)
})
