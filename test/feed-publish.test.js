const test = require('tape')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const p = require('util').promisify
const Keypair = require('ppppp-keypair')
const MsgV2 = require('../lib/msg-v2')

const DIR = path.join(os.tmpdir(), 'ppppp-db-feed-publish')
rimraf.sync(DIR)

const keypair = Keypair.generate('ed25519', 'alice')
const bobKeypair = Keypair.generate('ed25519', 'bob')
let peer
let group
let rootMsg
let rootHash
test('setup', async (t) => {
  peer = SecretStack({ appKey: caps.shs })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keypair, path: DIR })

  await peer.db.loaded()

  group = (await p(peer.db.group.create)(null)).hash
  rootMsg = MsgV2.createRoot(group, 'post', keypair)
  rootHash = MsgV2.getMsgHash(rootMsg)
})

let msgHash1
let rec1
let msgHash2
test('feed.publish()', async (t) => {
  rec1 = await p(peer.db.feed.publish)({
    group,
    type: 'post',
    data: { text: 'I am 1st post' },
  })
  t.equal(rec1.msg.data.text, 'I am 1st post', 'msg1 text correct')
  t.equal(
    rec1.msg.metadata.tangles[rootHash].depth,
    1,
    'msg1 tangle depth correct'
  )
  t.deepEquals(
    rec1.msg.metadata.tangles[rootHash].prev,
    [rootHash],
    'msg1 tangle prev correct'
  )

  msgHash1 = MsgV2.getMsgHash(rec1.msg)

  const rec2 = await p(peer.db.feed.publish)({
    group,
    type: 'post',
    data: { text: 'I am 2nd post' },
  })
  t.equal(rec2.msg.data.text, 'I am 2nd post', 'msg2 text correct')
  t.equal(
    rec2.msg.metadata.tangles[rootHash].depth,
    2,
    'msg2 tangle depth correct'
  )
  t.deepEquals(
    rec2.msg.metadata.tangles[rootHash].prev,
    [msgHash1],
    'msg2 tangle prev correct'
  )
  msgHash2 = MsgV2.getMsgHash(rec2.msg)
})

test('add() forked then feed.publish() merged', async (t) => {
  const tangle = new MsgV2.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)
  tangle.add(rec1.hash, rec1.msg)

  const msg3 = MsgV2.create({
    keypair,
    group,
    groupTips: [group],
    type: 'post',
    data: { text: '3rd post forked from 1st' },
    tangles: {
      [rootHash]: tangle,
    },
  })

  const rec3 = await p(peer.db.add)(msg3, rootHash)
  const msgHash3 = MsgV2.getMsgHash(rec3.msg)

  const rec4 = await p(peer.db.feed.publish)({
    group,
    type: 'post',
    data: { text: 'I am 4th post' },
  })
  t.ok(rec4, '4th post published')
  t.equals(
    rec4.msg.metadata.tangles[rootHash].prev.length,
    3,
    'msg4 prev has 3' // is root, msg2 and msg3'
  )
  t.true(
    rec4.msg.metadata.tangles[rootHash].prev.includes(rootHash),
    'msg4 prev has root'
  )
  t.true(
    rec4.msg.metadata.tangles[rootHash].prev.includes(msgHash2),
    'msg4 prev has msg2'
  )
  t.true(
    rec4.msg.metadata.tangles[rootHash].prev.includes(msgHash3),
    'msg4 prev has msg3'
  )
})

test('feed.publish() encrypted with box', async (t) => {
  const recEncrypted = await p(peer.db.feed.publish)({
    group,
    type: 'post',
    data: { text: 'I am chewing food', recps: [keypair.public] },
    encryptionFormat: 'box',
  })
  t.equal(typeof recEncrypted.msg.data, 'string')
  t.true(recEncrypted.msg.data.endsWith('.box'), '.box')

  const msgDecrypted = peer.db.get(recEncrypted.hash)
  t.equals(msgDecrypted.data.text, 'I am chewing food')
})

test('feed.publish() with tangles', async (t) => {
  const recA = await p(peer.db.feed.publish)({
    group,
    type: 'comment',
    data: { text: 'I am root' },
  })
  t.equal(recA.msg.data.text, 'I am root', 'root text correct')

  const recB = await p(peer.db.feed.publish)({
    group,
    type: 'comment',
    data: { text: 'I am comment 1' },
    tangles: [recA.hash],
    keypair: bobKeypair,
  })
  t.equal(recB.msg.metadata.tangles[recA.hash].depth, 1, 'tangle depth 1')
  t.deepEquals(
    recB.msg.metadata.tangles[recA.hash].prev,
    [recA.hash],
    'tangle prev'
  )
})

test('teardown', (t) => {
  peer.close(t.end)
})
