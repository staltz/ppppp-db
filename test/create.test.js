const test = require('tape')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const p = require('util').promisify
const FeedV1 = require('../lib/feed-v1')
const { generateKeypair } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-create')
rimraf.sync(DIR)

const keys = generateKeypair('alice')
const bobKeys = generateKeypair('bob')
let peer
test('setup', async (t) => {
  peer = SecretStack({ appKey: caps.shs })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keys, path: DIR })

  await peer.db.loaded()
})

const rootMsg = FeedV1.createRoot(keys, 'post')
const rootHash = FeedV1.getMsgHash(rootMsg)
let msgHash1
let rec1
let msgHash2
test('create()', async (t) => {
  rec1 = await p(peer.db.create)({
    type: 'post',
    content: { text: 'I am 1st post' },
  })
  t.equal(rec1.msg.content.text, 'I am 1st post', 'msg1 text correct')
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

  msgHash1 = FeedV1.getMsgHash(rec1.msg)

  const rec2 = await p(peer.db.create)({
    type: 'post',
    content: { text: 'I am 2nd post' },
  })
  t.equal(rec2.msg.content.text, 'I am 2nd post', 'msg2 text correct')
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
  msgHash2 = FeedV1.getMsgHash(rec2.msg)
})

test('add() forked then create() merged', async (t) => {
  const tangle = new FeedV1.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)
  tangle.add(rec1.hash, rec1.msg)

  const msg3 = FeedV1.create({
    keys,
    type: 'post',
    content: { text: '3rd post forked from 1st' },
    tangles: {
      [rootHash]: tangle,
    },
  })

  const rec3 = await p(peer.db.add)(msg3, rootHash)
  const msgHash3 = FeedV1.getMsgHash(rec3.msg)

  const rec4 = await p(peer.db.create)({
    type: 'post',
    content: { text: 'I am 4th post' },
  })
  t.ok(rec4, '4th post created')
  t.deepEquals(
    rec4.msg.metadata.tangles[rootHash].prev,
    [rootHash, msgHash2, msgHash3],
    'msg4 prev is root, msg2 and msg3'
  )
})

test('create() encrypted with box', async (t) => {
  const recEncrypted = await p(peer.db.create)({
    type: 'post',
    content: { text: 'I am chewing food', recps: [peer.id] },
    encryptionFormat: 'box',
  })
  t.equal(typeof recEncrypted.msg.content, 'string')
  t.true(recEncrypted.msg.content.endsWith('.box'), '.box')

  const msgDecrypted = peer.db.get(recEncrypted.hash)
  t.equals(msgDecrypted.content.text, 'I am chewing food')
})

test('create() with tangles', async (t) => {
  const recA = await p(peer.db.create)({
    type: 'comment',
    content: { text: 'I am root' },
  })
  t.equal(recA.msg.content.text, 'I am root', 'root text correct')

  const recB = await p(peer.db.create)({
    type: 'comment',
    content: { text: 'I am comment 1' },
    tangles: [recA.hash],
    keys: bobKeys,
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
