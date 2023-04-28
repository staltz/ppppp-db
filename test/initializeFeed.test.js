const test = require('tape')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const p = require('util').promisify
const FeedV1 = require('../lib/feed-v1')
const { generateKeypair } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-initializeFeed')
rimraf.sync(DIR)

test('initializeFeed()', async (t) => {
  const keys = generateKeypair('alice')
  const peer = SecretStack({ appKey: caps.shs })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keys, path: DIR })

  await peer.db.loaded()

  t.notOk(peer.db.getFeedRoot(keys.id, 'profile'), 'no profile feed')
  const rootHash = await p(peer.db.initializeFeed)({ type: 'profile' })
  t.pass('initialized feed')

  const rootMsg = FeedV1.createRoot(keys, 'profile')
  t.equals(rootHash, FeedV1.getMsgHash(rootMsg), 'root hash is consistent')

  t.ok(peer.db.getFeedRoot(keys.id, 'profile'), 'has profile feed')

  const rootHash2 = await p(peer.db.initializeFeed)({ type: 'profile' })
  t.pass('initialized feed is idempotent')

  t.equals(rootHash2, FeedV1.getMsgHash(rootMsg), 'root hash is consistent')

  t.ok(peer.db.getFeedRoot(keys.id, 'profile'), 'still has profile feed')

  await p(peer.close)(true)
})
