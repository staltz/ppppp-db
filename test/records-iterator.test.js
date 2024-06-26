const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const Keypair = require('ppppp-keypair')
const { createPeer } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-records-iter')
rimraf.sync(DIR)

test('records() iterator', async (t) => {
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

  let count = 0
  for await (const rec of peer.db.records()) {
    if (!rec.msg.data) continue
    if (rec.msg.metadata.account === 'self') continue
    assert.ok(rec.received, 'received')
    count++
  }
  assert.equal(count, 6)

  await p(peer.close)(true)
})
