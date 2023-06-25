const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const p = require('node:util').promisify
const os = require('node:os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ppppp-caps')
const Keypair = require('ppppp-keypair')

const DIR = path.join(os.tmpdir(), 'ppppp-db-identity-add')
rimraf.sync(DIR)

test('identity.add()', async (t) => {
  const keypair1 = Keypair.generate('ed25519', 'alice')
  const keypair2 = Keypair.generate('ed25519', 'bob')

  const peer = SecretStack({ appKey: caps.shse })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keypair: keypair1, path: DIR })

  await peer.db.loaded()
  const identityRec0 = await p(peer.db.identity.create)({ keypair: keypair1 })
  const id = identityRec0.hash

  const identityRec1 = await p(peer.db.identity.add)({ identity: id, keypair: keypair2 })
  assert.ok(identityRec1, 'identityRec1 exists')
  const { hash, msg } = identityRec1
  assert.ok(hash, 'hash exists')
  assert.equal(msg.data.add, keypair2.public, 'msg.data.add NEW KEY')
  assert.equal(msg.metadata.identity, null, 'msg.metadata.identity')
  assert.equal(msg.metadata.identityTips, null, 'msg.metadata.identityTips')
  assert.deepEqual(
    msg.metadata.tangles,
    { [id]: { depth: 1, prev: [id] } },
    'msg.metadata.tangles'
  )
  assert.equal(msg.pubkey, keypair1.public, 'msg.pubkey OLD KEY')

  await p(peer.close)()
})

test('publish with a key in the identity', async (t) => {
  rimraf.sync(DIR)

  const keypair1 = Keypair.generate('ed25519', 'alice')
  const keypair2 = Keypair.generate('ed25519', 'bob')

  let peer = SecretStack({ appKey: caps.shse })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keypair: keypair1, path: DIR })

  await peer.db.loaded()

  const identityRec0 = await p(peer.db.identity.create)({ keypair: keypair1 })
  const identity = identityRec0.hash
  const identityRec1 = await p(peer.db.identity.add)({ identity, keypair: keypair2 })

  const postRec = await p(peer.db.feed.publish)({
    identity,
    domain: 'post',
    data: { text: 'hello' },
    keypair: keypair2,
  })
  assert.equal(postRec.msg.data.text, 'hello', 'post text correct')
  const postsId = peer.db.feed.getId(identity, 'post')
  assert.ok(postsId, 'postsId exists')

  const recs = [...peer.db.records()]
  assert.equal(recs.length, 4, '4 records')
  const [_identityRec0, _identityRec1, postsRoot, _post] = recs
  assert.deepEqual(_identityRec0.msg, identityRec0.msg, 'identityMsg0')
  assert.deepEqual(_identityRec1.msg, identityRec1.msg, 'identityMsg1')
  assert.deepEqual(postsRoot.msg.metadata, {
    dataHash: null,
    dataSize: 0,
    identity,
    identityTips: null,
    tangles: {},
    domain: 'post',
    v: 3,
  }, 'postsRoot')
  assert.deepEqual(_post.msg, postRec.msg, 'postMsg')

  await p(peer.close)()

  // Re-load as Carol, add the msgs to validate them
  rimraf.sync(DIR)
  const keypair3 = Keypair.generate('ed25519', 'carol')

  const carol = SecretStack({ appKey: caps.shse })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keypair: keypair3, path: DIR })

  await carol.db.loaded()

  await p(carol.db.add)(identityRec0.msg, identity)
  await p(carol.db.add)(identityRec1.msg, identity)
  await p(carol.db.add)(postsRoot.msg, postsId)
  await p(carol.db.add)(postRec.msg, postsId)
  // t.pass('carol added all messages successfully')

  await p(carol.close)()
})
