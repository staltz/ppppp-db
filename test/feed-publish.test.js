const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const Keypair = require('ppppp-keypair')
const MsgV4 = require('../lib/msg-v4')
const { createPeer } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-feed-publish')
rimraf.sync(DIR)

test('feed.publish()', async (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const bobKeypair = Keypair.generate('ed25519', 'bob')
  let peer
  let id
  let moot
  let mootID

  // Setup
  {
    peer = createPeer({ keypair, path: DIR })

    await peer.db.loaded()

    id = await p(peer.db.account.create)({ subdomain: 'person' })
    moot = MsgV4.createMoot(id, 'post', keypair)
    mootID = MsgV4.getMsgID(moot)
  }

  let msgID1
  let rec1
  let msgID2

  await t.test('can add new msgs to the db', async (t) => {
    rec1 = await p(peer.db.feed.publish)({
      account: id,
      domain: 'post',
      data: { text: 'I am 1st post' },
    })
    assert.equal(rec1.msg.data.text, 'I am 1st post', 'msg1 text correct')
    assert.equal(
      rec1.msg.metadata.tangles[mootID].depth,
      1,
      'msg1 tangle depth correct'
    )
    assert.deepEqual(
      rec1.msg.metadata.tangles[mootID].prev,
      [mootID],
      'msg1 tangle prev correct'
    )

    msgID1 = MsgV4.getMsgID(rec1.msg)

    const rec2 = await p(peer.db.feed.publish)({
      account: id,
      domain: 'post',
      data: { text: 'I am 2nd post' },
    })
    assert.equal(rec2.msg.data.text, 'I am 2nd post', 'msg2 text correct')
    assert.equal(
      rec2.msg.metadata.tangles[mootID].depth,
      2,
      'msg2 tangle depth correct'
    )
    assert.deepEqual(
      rec2.msg.metadata.tangles[mootID].prev,
      [msgID1],
      'msg2 tangle prev correct'
    )
    msgID2 = MsgV4.getMsgID(rec2.msg)
  })

  await t.test('merges tangle after a forked add()', async (t) => {
    const tangle = new MsgV4.Tangle(mootID)
    tangle.add(mootID, moot)
    tangle.add(rec1.id, rec1.msg)

    const msg3 = MsgV4.create({
      keypair,
      account: id,
      accountTips: [id],
      domain: 'post',
      data: { text: '3rd post forked from 1st' },
      tangles: {
        [mootID]: tangle,
      },
    })

    const rec3 = await p(peer.db.add)(msg3, mootID)
    const msgID3 = MsgV4.getMsgID(rec3.msg)

    const rec4 = await p(peer.db.feed.publish)({
      account: id,
      domain: 'post',
      data: { text: 'I am 4th post' },
    })
    assert.ok(rec4, '4th post published')
    assert.equal(
      rec4.msg.metadata.tangles[mootID].prev.length,
      3,
      'msg4 prev has 3' // is root, msg2 and msg3'
    )
    assert.ok(
      rec4.msg.metadata.tangles[mootID].prev.includes(mootID),
      'msg4 prev has root'
    )
    assert.ok(
      rec4.msg.metadata.tangles[mootID].prev.includes(msgID2),
      'msg4 prev has msg2'
    )
    assert.ok(
      rec4.msg.metadata.tangles[mootID].prev.includes(msgID3),
      'msg4 prev has msg3'
    )
  })

  await t.test('publish encrypted with box', async (t) => {
    const recEncrypted = await p(peer.db.feed.publish)({
      account: id,
      domain: 'post',
      data: { text: 'I am chewing food', recps: [keypair.public] },
      encryptionFormat: 'box',
    })
    assert.equal(typeof recEncrypted.msg.data, 'string')
    assert.ok(recEncrypted.msg.data.endsWith('.box'), '.box')

    const msgDecrypted = peer.db.get(recEncrypted.id)
    assert.equal(msgDecrypted.data.text, 'I am chewing food')
  })

  await t.test('publish with tangles', async (t) => {
    const recA = await p(peer.db.feed.publish)({
      account: id,
      domain: 'comment',
      data: { text: 'I am root' },
    })
    assert.equal(recA.msg.data.text, 'I am root', 'root text correct')

    const recB = await p(peer.db.feed.publish)({
      account: id,
      domain: 'comment',
      data: { text: 'I am comment 1' },
      tangles: [recA.id],
      keypair: bobKeypair,
    })
    assert.equal(recB.msg.metadata.tangles[recA.id].depth, 1, 'tangle depth 1')
    assert.deepEqual(
      recB.msg.metadata.tangles[recA.id].prev,
      [recA.id],
      'tangle prev'
    )
  })

  await p(peer.close)(true)
})
