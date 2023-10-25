const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ppppp-caps')
const Keypair = require('ppppp-keypair')

const DIR = path.join(os.tmpdir(), 'ppppp-db-ghosts')
rimraf.sync(DIR)

const keypair = Keypair.generate('ed25519', 'alice')
test('ghosts.add, ghosts.get, ghosts.getMinDepth', async (t) => {
  const peer = SecretStack({ appKey: caps.shse })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keypair, path: DIR })

  await peer.db.loaded()

  const account = await p(peer.db.account.create)({ domain: 'person' })
  const MAX = 5

  let msgIDs = []
  for (let i = 0; i < 10; i++) {
    const rec = await p(peer.db.feed.publish)({
      account,
      domain: 'post',
      data: { text: 'hello ' + i },
    })
    msgIDs.push(rec.id)
  }
  const feedID = peer.db.feed.getID(account, 'post')

  const ghosts0 = peer.db.ghosts.get(feedID)
  assert.deepEqual(ghosts0, [], 'no ghosts so far')

  await p(peer.db.ghosts.add)({ msg: msgIDs[0], tangle: feedID, max: MAX })
  await p(peer.db.ghosts.add)({ msg: msgIDs[1], tangle: feedID, max: MAX })
  await p(peer.db.ghosts.add)({ msg: msgIDs[2], tangle: feedID, max: MAX })
  await p(peer.db.ghosts.add)({ msg: msgIDs[3], tangle: feedID, max: MAX })
  await p(peer.db.ghosts.add)({ msg: msgIDs[4], tangle: feedID, max: MAX })

  const ghostsA = peer.db.ghosts.get(feedID)
  assert.deepEqual(ghostsA, msgIDs.slice(0, 5), 'ghosts so far')
  const depthA = peer.db.ghosts.getMinDepth(feedID)
  assert.equal(depthA, 1, 'min depth so far')

  await p(peer.db.ghosts.add)({ msg: msgIDs[5], tangle: feedID, max: MAX })

  const ghostsB = peer.db.ghosts.get(feedID)
  assert.deepEqual(ghostsB, msgIDs.slice(1, 6), 'ghosts so far')
  const depthB = peer.db.ghosts.getMinDepth(feedID)
  assert.equal(depthB, 2, 'min depth so far')

  await p(peer.close)(true)
})
