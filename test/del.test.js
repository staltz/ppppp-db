const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const Log = require('../lib/log')
const Keypair = require('ppppp-keypair')
const { createPeer } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-del')
rimraf.sync(DIR)

test('del()', async (t) => {
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

  {
    const texts = []
    for (const msg of peer.db.msgs()) {
      if (msg.data && msg.metadata.account?.length > 4) {
        texts.push(msg.data.text)
      }
    }
    assert.deepEqual(
      texts,
      ['m0', 'm1', 'm2', 'm3', 'm4'],
      'msgs before the delete'
    )
  }

  const stats1 = await p(peer.db.log.stats)()
  assert.deepEqual(
    stats1,
    { totalBytes: 4158, deletedBytes: 0 },
    'stats before delete and compact'
  )

  await p(peer.db.del)(msgIDs[2])
  await p(peer.db.del)(msgIDs[3])

  {
    const texts = []
    for (const msg of peer.db.msgs()) {
      if (msg.data && msg.metadata.account?.length > 4) {
        texts.push(msg.data.text)
      }
    }
    assert.deepEqual(texts, ['m0', 'm1', 'm4'], 'msgs after the delete')
  }

  await p(peer.db.log.compact)()
  assert('compacted')

  // Delete 4 so we can test that its log offset was updated post-compaction
  await p(peer.db.del)(msgIDs[4])

  {
    const texts = []
    for (const msg of peer.db.msgs()) {
      if (msg.data && msg.metadata.account?.length > 4) {
        texts.push(msg.data.text)
      }
    }
    assert.deepEqual(texts, ['m0', 'm1'], 'msgs when deleted after compacted')
  }
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

  const stats2 = await p(log.stats)()
  assert.deepEqual(
    stats2,
    { totalBytes: 2880, deletedBytes: 615 },
    'stats after delete and compact'
  )

  assert.deepEqual(
    persistedMsgs
      .filter((msg) => msg.data && msg.metadata.account?.length > 4)
      .map((msg) => msg.data.text),
    ['m0', 'm1'],
    'msgs in disk after the delete'
  )
})
