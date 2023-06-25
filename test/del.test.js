const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const AAOL = require('async-append-only-log')
const push = require('push-stream')
const caps = require('ppppp-caps')
const Keypair = require('ppppp-keypair')

const DIR = path.join(os.tmpdir(), 'ppppp-db-del')
rimraf.sync(DIR)

test('del', async (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const peer = SecretStack({ appKey: caps.shse })
    .use(require('../lib'))
    .call(null, { keypair, path: DIR })

  await peer.db.loaded()

  const id = (await p(peer.db.identity.create)(null)).hash

  const msgHashes = []
  for (let i = 0; i < 5; i++) {
    const rec = await p(peer.db.feed.publish)({
      identity: id,
      domain: 'post',
      data: { text: 'm' + i },
    })
    msgHashes.push(rec.hash)
  }

  const before = []
  for (const msg of peer.db.msgs()) {
    if (msg.data && msg.metadata.identity) before.push(msg.data.text)
  }

  assert.deepEqual(before, ['m0', 'm1', 'm2', 'm3', 'm4'], 'msgs before the delete')

  await p(peer.db.del)(msgHashes[2])

  const after = []
  for (const msg of peer.db.msgs()) {
    if (msg.data && msg.metadata.identity) after.push(msg.data.text)
  }

  assert.deepEqual(after, ['m0', 'm1', 'm3', 'm4'], 'msgs after the delete')

  await p(peer.close)(true)

  const log = AAOL(path.join(DIR, 'db.bin'), {
    cacheSize: 1,
    blockSize: 64 * 1024,
    codec: {
      encode(msg) {
        return Buffer.from(JSON.stringify(msg), 'utf8')
      },
      decode(buf) {
        return JSON.parse(buf.toString('utf8'))
      },
    },
  })

  const persistedMsgs = await new Promise((resolve, reject) => {
    let persistedMsgs = []
    log.stream({ offsets: true, values: true, sizes: true }).pipe(
      push.drain(
        function drainEach({ offset, value, size }) {
          if (value) {
            persistedMsgs.push(value.msg)
          }
        },
        function drainEnd(err) {
          if (err) return reject(err)
          resolve(persistedMsgs)
        }
      )
    )
  })

  assert.deepEqual(
    persistedMsgs
      .filter((msg) => msg.data && msg.metadata.identity)
      .map((msg) => msg.data.text),
    ['m0', 'm1', 'm3', 'm4'],
    'msgs in disk after the delete'
  )
})
