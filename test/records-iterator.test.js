const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ppppp-caps')
const Keypair = require('ppppp-keypair')

const DIR = path.join(os.tmpdir(), 'ppppp-db-records-iter')
rimraf.sync(DIR)

test('records() iterator', async (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const peer = SecretStack({ appKey: caps.shse })
    .use(require('../lib'))
    .call(null, { keypair, path: DIR })

  await peer.db.loaded()
  const account = (await p(peer.db.account.create)({ domain: 'person' }))

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
  for (const rec of peer.db.records()) {
    if (!rec.msg.data) continue
    if (rec.msg.metadata.account === 'self') continue
    assert.ok(rec.misc.size > rec.msg.metadata.dataSize, 'size > dataSize')
    count++
  }
  assert.equal(count, 6)

  await p(peer.close)(true)
})
