const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const Keypair = require('ppppp-keypair')

const DIR = path.join(os.tmpdir(), 'ppppp-db-re-open')
rimraf.sync(DIR)

test('publish some msgs, close, re-open', async (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const peer = SecretStack({ appKey: caps.shs })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keypair, path: DIR })

  await peer.db.loaded()
  const identity = (await p(peer.db.identity.create)(null)).hash
  // t.pass('opened db')

  const msgHashes = []
  for (let i = 0; i < 6; i++) {
    const rec = await p(peer.db.feed.publish)({
      identity,
      domain: 'post',
      data: { text: 'hello ' + i },
    })
    msgHashes.push(rec.hash)
  }
  // t.pass('created some msgs')

  await p(peer.db.del)(msgHashes[2])
  // t.pass('deleted the 3rd msg')

  await p(peer.close)(true)
  // t.pass('closed')

  const peer2 = SecretStack({ appKey: caps.shs })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keypair, path: DIR })
  // t.pass('re-opened')

  await peer2.db.loaded()

  const texts = []
  for (const msg of peer2.db.msgs()) {
    if (!msg.data || !msg.metadata.identity) continue
    texts.push(msg.data.text)
  }

  assert.deepEqual(
    texts,
    ['hello 0', 'hello 1', 'hello 3', 'hello 4', 'hello 5'],
    'queried posts'
  )

  await p(peer2.close)(true)
})
