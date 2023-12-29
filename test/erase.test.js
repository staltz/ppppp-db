const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const Keypair = require('ppppp-keypair')
const Log = require('../lib/log')
const { createPeer } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-erase')
rimraf.sync(DIR)

test('erase()', async (t) => {
  const peer = createPeer({
    keypair: Keypair.generate('ed25519', 'alice'),
    path: DIR,
  })

  await peer.db.loaded()

  const id = await p(peer.db.account.create)({
    subdomain: 'person',
    _nonce: 'alice',
  })

  const msgIDs = []
  for (let i = 0; i < 5; i++) {
    const rec = await p(peer.db.feed.publish)({
      account: id,
      domain: 'post',
      data: { text: 'm' + i },
    })
    msgIDs.push(rec.id)
  }
  const SAVED_UPON_ERASE = '{"text":"m*"}'.length - 'null'.length

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

  const EXPECTED_TOTAL_BYTES = 4158
  const stats1 = await p(peer.db.log.stats)()
  assert.deepEqual(
    stats1,
    { totalBytes: EXPECTED_TOTAL_BYTES, deletedBytes: 0 },
    'stats before erase and compact'
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

  await p(peer.db.log.compact)()
  assert('compacted')

  await p(peer.close)(true)

  const log = Log(path.join(DIR, 'db', 'log'), {
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
    log.scan(
      function drainEach(offset, rec, size) {
        if (rec) {
          persistedMsgs.push(rec.msg)
        }
      },
      function drainEnd(err) {
        if (err) return reject(err)
        resolve(persistedMsgs)
      }
    )
  })

  const afterReopen = []
  for (const msg of persistedMsgs) {
    if (msg.data && msg.metadata.account?.length > 4) {
      afterReopen.push(msg.data.text)
    }
  }

  const stats2 = await p(log.stats)()
  assert.deepEqual(
    stats2,
    { totalBytes: EXPECTED_TOTAL_BYTES - SAVED_UPON_ERASE, deletedBytes: 0 },
    'stats after erase and compact'
  )

  assert.deepEqual(
    afterReopen,
    ['m0', 'm1', 'm3', 'm4'],
    '4 msgs after the erase'
  )
})
