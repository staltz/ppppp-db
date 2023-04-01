const test = require('tape')
const ssbKeys = require('ssb-keys')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const AAOL = require('async-append-only-log')
const push = require('push-stream')
const caps = require('ssb-caps')
const p = require('util').promisify

const DIR = path.join(os.tmpdir(), 'ssb-memdb-del')
rimraf.sync(DIR)

test('del', async (t) => {
  const ssb = SecretStack({ appKey: caps.shs })
    .use(require('../'))
    .use(require('ssb-classic'))
    .call(null, {
      keys: ssbKeys.generate('ed25519', 'alice'),
      path: DIR,
    })

  await ssb.db.loaded()

  const msgIDs = []
  for (let i = 0; i < 5; i++) {
    const msg = await p(ssb.db.create)({
      feedFormat: 'classic',
      content: { type: 'post', text: 'm' + i },
    })
    msgIDs.push(msg.key)
  }

  const before = ssb.db
    .filterAsArray(() => true)
    .map((msg) => msg.value.content.text)

  t.deepEqual(before, ['m0', 'm1', 'm2', 'm3', 'm4'], 'msgs before the delete')

  await p(ssb.db.del)(msgIDs[2])

  const after = ssb.db
    .filterAsArray(() => true)
    .map((msg) => msg?.value.content.text ?? null)

  t.deepEqual(after, ['m0', 'm1', null, 'm3', 'm4'], 'msgs after the delete')

  await p(ssb.close)(true)

  const log = AAOL(path.join(DIR, 'memdb-log.bin'), {
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
          if (!value) {
            persistedMsgs.push(null)
          } else {
            persistedMsgs.push(value)
          }
        },
        function drainEnd(err) {
          if (err) return reject(err)
          resolve(persistedMsgs)
        }
      )
    )
  })

  t.deepEqual(
    persistedMsgs.map((msg) => msg?.value.content.text ?? null),
    ['m0', 'm1', null, 'm3', 'm4'],
    'msgs in disk after the delete'
  )
})
