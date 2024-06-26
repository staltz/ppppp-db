const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const Keypair = require('ppppp-keypair')
const { createPeer } = require('./util')
const MsgV4 = require('../lib/msg-v4')

const DIR = path.join(os.tmpdir(), 'ppppp-db-ghosts')
rimraf.sync(DIR)

const keypair = Keypair.generate('ed25519', 'alice')
test('ghosts.add, ghosts.get, ghosts.getMinDepth', async (t) => {
  const peer = createPeer({ keypair, path: DIR })

  await peer.db.loaded()

  const account = await p(peer.db.account.create)({ subdomain: 'person' })
  const SPAN = 5

  let msgIDs = []
  for (let i = 0; i < 10; i++) {
    const rec = await p(peer.db.feed.publish)({
      account,
      domain: 'post',
      data: { text: 'hello ' + i },
    })
    msgIDs.push(rec.id)
  }
  const tangleID = (await p(peer.db.feed.findMoot)(account, 'post'))?.id

  const ghosts0 = peer.db.ghosts.get(tangleID)
  assert.deepEqual(ghosts0, [], 'no ghosts so far')

  await p(peer.db.ghosts.add)({ msgID: msgIDs[0], tangleID, span: SPAN })
  await p(peer.db.ghosts.add)({ msgID: msgIDs[1], tangleID, span: SPAN })
  await p(peer.db.ghosts.add)({ msgID: msgIDs[2], tangleID, span: SPAN })
  await p(peer.db.ghosts.add)({ msgID: msgIDs[3], tangleID, span: SPAN })
  await p(peer.db.ghosts.add)({ msgID: msgIDs[4], tangleID, span: SPAN })

  const ghostsA = peer.db.ghosts.get(tangleID)
  assert.deepEqual(ghostsA, msgIDs.slice(0, 5), 'ghosts so far')
  const depthA = peer.db.ghosts.getMinDepth(tangleID)
  assert.equal(depthA, 1, 'min depth so far')

  await p(peer.db.ghosts.add)({ msgID: msgIDs[5], tangleID, span: SPAN })

  const ghostsB = peer.db.ghosts.get(tangleID)
  assert.deepEqual(ghostsB, msgIDs.slice(1, 6), 'ghosts so far')
  const depthB = peer.db.ghosts.getMinDepth(tangleID)
  assert.equal(depthB, 2, 'min depth so far')

  await p(peer.close)(true)
})

test('ghosts.add queues very-concurrent calls', async (t) => {
  const peer = createPeer({ keypair, path: DIR })

  await peer.db.loaded()

  const account = await p(peer.db.account.create)({ subdomain: 'person' })
  const SPAN = 5

  let msgIDs = []
  for (let i = 0; i < 10; i++) {
    const rec = await p(peer.db.feed.publish)({
      account,
      domain: 'post',
      data: { text: 'hello ' + i },
    })
    msgIDs.push(rec.id)
  }
  const moot = MsgV4.createMoot(account, 'post', keypair)
  const tangleID = MsgV4.getMsgID(moot)

  const ghosts0 = peer.db.ghosts.get(tangleID)
  assert.deepEqual(ghosts0, [], 'no ghosts so far')

  await Promise.all([
    p(peer.db.ghosts.add)({ msgID: msgIDs[0], tangleID, span: SPAN }),
    p(peer.db.ghosts.add)({ msgID: msgIDs[1], tangleID, span: SPAN }),
    p(peer.db.ghosts.add)({ msgID: msgIDs[2], tangleID, span: SPAN }),
    p(peer.db.ghosts.add)({ msgID: msgIDs[3], tangleID, span: SPAN }),
    p(peer.db.ghosts.add)({ msgID: msgIDs[4], tangleID, span: SPAN }),
  ])

  const ghostsA = peer.db.ghosts.get(tangleID)
  assert.deepEqual(ghostsA, msgIDs.slice(0, 5), 'ghosts so far')
  const depthA = peer.db.ghosts.getMinDepth(tangleID)
  assert.equal(depthA, 1, 'min depth so far')

  await p(peer.db.ghosts.add)({ msgID: msgIDs[5], tangleID, span: SPAN })

  const ghostsB = peer.db.ghosts.get(tangleID)
  assert.deepEqual(ghostsB, msgIDs.slice(1, 6), 'ghosts so far')
  const depthB = peer.db.ghosts.getMinDepth(tangleID)
  assert.equal(depthB, 2, 'min depth so far')

  await p(peer.close)(true)
})
