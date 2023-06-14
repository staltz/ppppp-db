const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const Keypair = require('ppppp-keypair')

const DIR = path.join(os.tmpdir(), 'ppppp-db-group-create')
rimraf.sync(DIR)

test('group.create() without args', async (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const peer = SecretStack({ appKey: caps.shs })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keypair, path: DIR })

  await peer.db.loaded()
  const groupRec0 = await p(peer.db.group.create)({})
  assert.ok(groupRec0, 'groupRec0 exists')
  const { hash, msg } = groupRec0
  assert.ok(hash, 'hash exists')
  assert.equal(msg.data.add, keypair.public, 'msg.data.add')
  assert.equal(msg.metadata.group, null, 'msg.metadata.group')
  assert.equal(msg.metadata.groupTips, null, 'msg.metadata.groupTips')
  assert.deepEqual(Object.keys(msg.metadata.tangles), [], 'msg.metadata.tangles')
  assert.equal(msg.pubkey, keypair.public, 'msg.pubkey')

  await p(peer.close)()
})

test('group.create() with "keypair" arg', async (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const peer = SecretStack({ appKey: caps.shs })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keypair, path: DIR })

  await peer.db.loaded()
  const groupRec0 = await p(peer.db.group.create)({ keypair })
  assert.ok(groupRec0, 'groupRec0 exists')
  const { hash, msg } = groupRec0
  assert.ok(hash, 'hash exists')
  assert.equal(msg.data.add, keypair.public, 'msg.data.add')
  assert.equal(msg.metadata.group, null, 'msg.metadata.group')
  assert.equal(msg.metadata.groupTips, null, 'msg.metadata.groupTips')
  assert.deepEqual(Object.keys(msg.metadata.tangles), [], 'msg.metadata.tangles')
  assert.equal(msg.pubkey, keypair.public, 'msg.pubkey')

  await p(peer.close)()
})
