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

test('feed.getID()', async (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const peer = SecretStack({ appKey: caps.shse })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keypair, db: { path: DIR } })

  await peer.db.loaded()

  const id = await p(peer.db.account.create)({ subdomain: 'person' })
  const moot = MsgV3.createMoot(id, 'post', keypair)
  const mootID = MsgV3.getMsgID(moot)

  await p(peer.db.add)(moot, mootID)

  const feedID = peer.db.feed.getID(id, 'post')
  assert.equal(feedID, mootID, 'feed.getID() returns moot ID')

  await p(peer.close)(true)
})
