const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ppppp-caps')
const Keypair = require('ppppp-keypair')
const MsgV3 = require('../lib/msg-v3')

const DIR = path.join(os.tmpdir(), 'ppppp-db-feed-publish')
rimraf.sync(DIR)

const keypair = Keypair.generate('ed25519', 'alice')
let peer
let id
let rootMsg
let rootHash
test('setup', async (t) => {
  peer = SecretStack({ appKey: caps.shse })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keypair, path: DIR })

  await peer.db.loaded()

  id = (await p(peer.db.identity.create)(null)).hash
  rootMsg = MsgV3.createRoot(id, 'post', keypair)
  rootHash = MsgV3.getMsgHash(rootMsg)

  await p(peer.db.add)(rootMsg, rootHash)
})

test('feed.getId()', async (t) => {
  const feedId = peer.db.feed.getId(id, 'post')
  assert.equal(feedId, rootHash, 'feed.getId() returns root hash')
})

test('teardown', (t) => {
  peer.close(t.end)
})
