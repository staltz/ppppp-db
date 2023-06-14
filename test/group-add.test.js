const test = require('tape')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const p = require('util').promisify
const Keypair = require('ppppp-keypair')

const DIR = path.join(os.tmpdir(), 'ppppp-db-group-add')
rimraf.sync(DIR)

test('group.add()', async (t) => {
  const keypair1 = Keypair.generate('ed25519', 'alice')
  const keypair2 = Keypair.generate('ed25519', 'bob')

  const peer = SecretStack({ appKey: caps.shs })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keypair: keypair1, path: DIR })

  await peer.db.loaded()
  const groupRec0 = await p(peer.db.group.create)({ keypair: keypair1 })
  const group = groupRec0.hash

  const groupRec1 = await p(peer.db.group.add)({ group, keypair: keypair2 })
  t.ok(groupRec1, 'groupRec1 exists')
  const { hash, msg } = groupRec1
  t.ok(hash, 'hash exists')
  t.equals(msg.data.add, keypair2.public, 'msg.data.add NEW KEY')
  t.equals(msg.metadata.group, null, 'msg.metadata.group')
  t.equals(msg.metadata.groupTips, null, 'msg.metadata.groupTips')
  t.deepEquals(
    msg.metadata.tangles,
    { [group]: { depth: 1, prev: [group] } },
    'msg.metadata.tangles'
  )
  t.equals(msg.pubkey, keypair1.public, 'msg.pubkey OLD KEY')

  await p(peer.close)()
})

test('publish with a key in the group', async (t) => {
  rimraf.sync(DIR)

  const keypair1 = Keypair.generate('ed25519', 'alice')
  const keypair2 = Keypair.generate('ed25519', 'bob')

  let peer = SecretStack({ appKey: caps.shs })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keypair: keypair1, path: DIR })

  await peer.db.loaded()

  const groupRec0 = await p(peer.db.group.create)({ keypair: keypair1 })
  const group = groupRec0.hash
  const groupRec1 = await p(peer.db.group.add)({ group, keypair: keypair2 })

  const postRec = await p(peer.db.feed.publish)({
    group,
    type: 'post',
    data: { text: 'hello' },
    keypair: keypair2,
  })
  t.equal(postRec.msg.data.text, 'hello', 'post text correct')
  const postsId = peer.db.feed.getId(group, 'post')
  t.ok(postsId, 'postsId exists')

  const recs = [...peer.db.records()]
  t.equals(recs.length, 4, '4 records')
  const [_groupRec0, _groupRec1, postsRoot, _post] = recs
  t.deepEquals(_groupRec0.msg, groupRec0.msg, 'groupMsg0')
  t.deepEquals(_groupRec1.msg, groupRec1.msg, 'groupMsg1')
  t.deepEquals(postsRoot.msg.metadata, {
    dataHash: null,
    dataSize: 0,
    group,
    groupTips: null,
    tangles: {},
    type: 'post',
    v: 2,
  }, 'postsRoot')
  t.deepEquals(_post.msg, postRec.msg, 'postMsg')

  await p(peer.close)()

  // Re-load as Carol, add the msgs to validate them
  rimraf.sync(DIR)
  const keypair3 = Keypair.generate('ed25519', 'carol')

  const carol = SecretStack({ appKey: caps.shs })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keypair: keypair3, path: DIR })

  await carol.db.loaded()

  await p(carol.db.add)(groupRec0.msg, group)
  await p(carol.db.add)(groupRec1.msg, group)
  await p(carol.db.add)(postsRoot.msg, postsId)
  await p(carol.db.add)(postRec.msg, postsId)
  t.pass('carol added all messages successfully')

  await p(carol.close)()
})
