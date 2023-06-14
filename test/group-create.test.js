const test = require('tape')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const p = require('util').promisify
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
  t.ok(groupRec0, 'groupRec0 exists')
  const { hash, msg } = groupRec0
  t.ok(hash, 'hash exists')
  t.equals(msg.data.add, keypair.public, 'msg.data.add')
  t.equals(msg.metadata.group, null, 'msg.metadata.group')
  t.equals(msg.metadata.groupTips, null, 'msg.metadata.groupTips')
  t.deepEquals(Object.keys(msg.metadata.tangles), [], 'msg.metadata.tangles')
  t.equals(msg.pubkey, keypair.public, 'msg.pubkey')

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
  t.ok(groupRec0, 'groupRec0 exists')
  const { hash, msg } = groupRec0
  t.ok(hash, 'hash exists')
  t.equals(msg.data.add, keypair.public, 'msg.data.add')
  t.equals(msg.metadata.group, null, 'msg.metadata.group')
  t.equals(msg.metadata.groupTips, null, 'msg.metadata.groupTips')
  t.deepEquals(Object.keys(msg.metadata.tangles), [], 'msg.metadata.tangles')
  t.equals(msg.pubkey, keypair.public, 'msg.pubkey')

  await p(peer.close)()
})
