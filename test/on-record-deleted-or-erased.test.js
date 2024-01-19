const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const Keypair = require('ppppp-keypair')
const { createPeer } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-on-record-deleted-or-erased')
rimraf.sync(DIR)

test('onRecordDeletedOrErased()', async (t) => {
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

  const listened1 = []
  const remove1 = peer.db.onRecordDeletedOrErased((msgID) => {
    listened1.push(msgID)
  })
  assert.deepEqual(listened1, [], '(nothing)')
  await p(peer.db.erase)(msgIDs[2])
  assert.deepEqual(listened1, [msgIDs[2]], 'erased')
  remove1()

  const listened2 = []
  const remove2 = peer.db.onRecordDeletedOrErased((msgID) => {
    listened2.push(msgID)
  })
  assert.deepEqual(listened2, [msgIDs[2]], 'erased')
  await p(peer.db.del)(msgIDs[1])
  assert.deepEqual(listened2, [msgIDs[2], msgIDs[1]], 'erased and deleted')
  remove2()

  assert.deepEqual(listened1, [msgIDs[2]], 'erased') // still the same
  await p(peer.close)(true)
})
