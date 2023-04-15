const test = require('tape')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const AAOL = require('async-append-only-log')
const push = require('push-stream')
const caps = require('ssb-caps')
const p = require('util').promisify
const { generateKeypair } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-erase')
rimraf.sync(DIR)

test('erase', async (t) => {
  const keys = generateKeypair('alice')
  const peer = SecretStack({ appKey: caps.shs })
    .use(require('../'))
    .call(null, { keys, path: DIR })

  await peer.db.loaded()

  const rootHash = 'PpkBfa8C4sB8wHrqiNmHqe'
  const msgHashes = []
  for (let i = 0; i < 5; i++) {
    const rec = await p(peer.db.create)({
      type: 'post',
      content: { text: 'm' + i },
    })
    msgHashes.push(rec.hash)
  }

  const before = []
  for (const msg of peer.db.msgs()) {
    if (msg.content) before.push(msg.content.text)
  }

  t.deepEqual(before, ['m0', 'm1', 'm2', 'm3', 'm4'], '5 msgs before the erase')

  await p(peer.db.erase)(msgHashes[2])

  const after = []
  for (const msg of peer.db.msgs()) {
    if (msg.content) after.push(msg.content.text)
  }

  t.deepEqual(after, ['m0', 'm1', 'm3', 'm4'], '4 msgs after the erase')

  const after2 = []
  for (const msg of peer.db.msgs()) {
    if (msg.metadata.tangles[rootHash]) {
      after2.push(msg.metadata.tangles[rootHash].depth)
    }
  }

  t.deepEqual(after2, [1, 2, 3, 4, 5], '5 metadata exists after the erase')

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
