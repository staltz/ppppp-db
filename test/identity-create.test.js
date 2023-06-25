const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ppppp-caps')
const Keypair = require('ppppp-keypair')

const DIR = path.join(os.tmpdir(), 'ppppp-db-identity-create')
rimraf.sync(DIR)

test('identity.create() without args', async (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const peer = SecretStack({ appKey: caps.shse })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keypair, path: DIR })

  await peer.db.loaded()
  const identityRec0 = await p(peer.db.identity.create)({})
  assert.ok(identityRec0, 'identityRec0 exists')
  const { hash, msg } = identityRec0
  assert.ok(hash, 'hash exists')
  assert.equal(msg.data.add, keypair.public, 'msg.data.add')
  assert.equal(msg.metadata.identity, null, 'msg.metadata.identity')
  assert.equal(msg.metadata.identityTips, null, 'msg.metadata.identityTips')
  assert.deepEqual(Object.keys(msg.metadata.tangles), [], 'msg.metadata.tangles')
  assert.equal(msg.pubkey, keypair.public, 'msg.pubkey')

  await p(peer.close)()
})

test('identity.create() with "keypair" arg', async (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const peer = SecretStack({ appKey: caps.shse })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keypair, path: DIR })

  await peer.db.loaded()
  const identityRec0 = await p(peer.db.identity.create)({ keypair })
  assert.ok(identityRec0, 'identityRec0 exists')
  const { hash, msg } = identityRec0
  assert.ok(hash, 'hash exists')
  assert.equal(msg.data.add, keypair.public, 'msg.data.add')
  assert.equal(msg.metadata.identity, null, 'msg.metadata.identity')
  assert.equal(msg.metadata.identityTips, null, 'msg.metadata.identityTips')
  assert.deepEqual(Object.keys(msg.metadata.tangles), [], 'msg.metadata.tangles')
  assert.equal(msg.pubkey, keypair.public, 'msg.pubkey')

  await p(peer.close)()
})
