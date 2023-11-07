const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const Log = require('../lib/log')
const push = require('push-stream')
const caps = require('ppppp-caps')
const Keypair = require('ppppp-keypair')

const DIR = path.join(os.tmpdir(), 'ppppp-db-erase')
rimraf.sync(DIR)

test('erase', async (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const peer = SecretStack({ appKey: caps.shse })
    .use(require('../lib'))
    .call(null, { keypair, path: DIR })

  await peer.db.loaded()

  const id = await p(peer.db.account.create)({ domain: 'person' })

  const msgIDs = []
  for (let i = 0; i < 5; i++) {
    const rec = await p(peer.db.feed.publish)({
      account: id,
      domain: 'post',
      data: { text: 'm' + i },
    })
    msgIDs.push(rec.id)
  }

  const before = []
  for (const msg of peer.db.msgs()) {
    if (msg.data && msg.metadata.account?.length > 4) {
      before.push(msg.data.text)
    }
  }

  assert.deepEqual(
    before,
    ['m0', 'm1', 'm2', 'm3', 'm4'],
    '5 msgs before the erase'
  )

  await p(peer.db.erase)(msgIDs[2])

  const after = []
  for (const msg of peer.db.msgs()) {
    if (msg.data && msg.metadata.account?.length > 4) {
      after.push(msg.data.text)
    }
  }

  assert.deepEqual(after, ['m0', 'm1', 'm3', 'm4'], '4 msgs after the erase')

  const after2 = []
  for (const msg of peer.db.msgs()) {
    for (const tangleID in msg.metadata.tangles) {
      after2.push(msg.metadata.tangles[tangleID].depth)
    }
  }

  assert.deepEqual(after2, [1, 2, 3, 4, 5], '5 metadata exists after the erase')

  await p(peer.close)(true)

  // FIXME:
  // const log = AAOL(path.join(DIR, 'db.bin'), {
  //   cacheSize: 1,
  //   blockSize: 64 * 1024,
  //   codec: {
  //     encode(msg) {
  //       return Buffer.from(JSON.stringify(msg), 'utf8')
  //     },
  //     decode(buf) {
  //       return JSON.parse(buf.toString('utf8'))
  //     },
  //   },
  // })

  // const persistedMsgs = await new Promise((resolve, reject) => {
  //   let persistedMsgs = []
  //   log.stream({ offsets: true, values: true, sizes: true }).pipe(
  //     push.drain(
  //       function drainEach({ offset, value, size }) {
  //         if (value) {
  //           persistedMsgs.push(value.msg)
  //         }
  //       },
  //       function drainEnd(err) {
  //         if (err) return reject(err)
  //         resolve(persistedMsgs)
  //       }
  //     )
  //   )
  // })

  // t.deepEqual(
  //   persistedMsgs.filter((msg) => msg.content).map((msg) => msg.content.text),
  //   ['m0', 'm1', 'm3', 'm4'],
  //   'msgs in disk after the delete'
  // )
})
