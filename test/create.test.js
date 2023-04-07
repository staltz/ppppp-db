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
let peer
test('setup', async (t) => {
  peer = SecretStack({ appKey: caps.shs })
    .use(require('../'))
    .use(require('ssb-box'))
    .call(null, { keys, path: DIR })

  await peer.db.loaded()
})

let msgHash1
let rec1
let msgHash2
test('create()', async (t) => {
  rec1 = await p(peer.db.create)({
    type: 'post',
    content: { text: 'I am 1st post' },
  })
  t.equal(rec1.msg.content.text, 'I am 1st post', 'msg1 text correct')
  msgHash1 = FeedV1.getMsgHash(rec1.msg)

  const rec2 = await p(peer.db.create)({
    type: 'post',
    content: { text: 'I am 2nd post' },
  })
  t.equal(rec2.msg.content.text, 'I am 2nd post', 'msg2 text correct')
  t.deepEquals(rec2.msg.metadata.prev, [msgHash1], 'msg2 prev correct')
  msgHash2 = FeedV1.getMsgHash(rec2.msg)
})

test('add() forked then create() merged', async (t) => {
  const msg3 = FeedV1.create({
    keys,
    when: Date.now(),
    type: 'post',
    content: { text: '3rd post forked from 1st' },
    existing: [rec1.msg],
  })

  const rec3 = await p(peer.db.add)(msg3)
  const msgHash3 = FeedV1.getMsgHash(rec3.msg)

  const rec4 = await p(peer.db.create)({
    type: 'post',
    content: { text: 'I am 4th post' },
  })
  t.ok(rec4, '4th post created')
  t.deepEquals(
    rec4.msg.metadata.prev,
    [msgHash2, msgHash3],
    'msg4 prev is msg2 and msg3'
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

  const msgDecrypted = peer.db.get(recEncrypted.id)
  t.equals(msgDecrypted.content.text, 'I am chewing food')
})

test('teardown', (t) => {
  peer.close(t.end)
})
