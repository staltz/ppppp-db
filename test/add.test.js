const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const Keypair = require('ppppp-keypair')
const MsgV4 = require('../lib/msg-v4')
const { createPeer } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-add')
rimraf.sync(DIR)

test('add()', async (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const peer = createPeer({ keypair, path: DIR })

  await peer.db.loaded()
  const accountMsg0 = MsgV4.createAccount(keypair, 'person', 'aliceNonce')
  const id = MsgV4.getMsgID(accountMsg0)

  await t.test('basic use case', async () => {
    await p(peer.db.add)(accountMsg0, id)

    const rootMsg = MsgV4.createMoot(id, 'post', keypair)
    const rootID = MsgV4.getMsgID(rootMsg)

    const recRoot = await p(peer.db.add)(rootMsg, rootID)
    assert.equal(recRoot.msg.metadata.dataSize, 0, 'root msg added')
    const tangle = new MsgV4.Tangle(rootID)
    tangle.add(recRoot.id, recRoot.msg)

    const inputMsg = MsgV4.create({
      keypair,
      domain: 'post',
      data: { text: 'This is the first post!' },
      account: id,
      accountTips: [id],
      tangles: {
        [rootID]: tangle,
      },
    })

    const rec = await p(peer.db.add)(inputMsg, null) // tangleID implicit
    assert.equal(rec.msg.data.text, 'This is the first post!')

    const stats = await p(peer.db.log.stats)()
    assert.deepEqual(stats, { totalBytes: 1662, deletedBytes: 0 })
  })

  await t.test('concurrent add of the same msg appends just one', async () => {
    const rootMsg = MsgV4.createMoot(id, 'whatever', keypair)
    const rootID = MsgV4.getMsgID(rootMsg)
    await Promise.all([
      p(peer.db.add)(rootMsg, rootID),
      p(peer.db.add)(rootMsg, rootID),
    ])

    const stats = await p(peer.db.log.stats)()
    assert.deepEqual(stats, { totalBytes: 2072, deletedBytes: 0 })
  })

  await t.test('dataful msg replacing a dataless msg', async (t) => {
    const rootMsg = MsgV4.createMoot(id, 'something', keypair)
    const rootID = MsgV4.getMsgID(rootMsg)
    await p(peer.db.add)(rootMsg, rootID)

    const tangle = new MsgV4.Tangle(rootID)
    tangle.add(rootID, rootMsg)

    const msg1Dataful = MsgV4.create({
      keypair,
      account: id,
      accountTips: [id],
      domain: 'something',
      data: { text: 'first' },
      tangles: {
        [rootID]: tangle,
      },
    })
    const msg1Dataless = { ...msg1Dataful, data: null }
    const msg1ID = MsgV4.getMsgID(msg1Dataful)

    tangle.add(msg1ID, msg1Dataful)

    const msg2 = MsgV4.create({
      keypair,
      account: id,
      accountTips: [id],
      domain: 'something',
      data: { text: 'second' },
      tangles: {
        [rootID]: tangle,
      },
    })
    const msg2ID = MsgV4.getMsgID(msg2)

    await p(peer.db.add)(msg1Dataless, rootID)
    await p(peer.db.add)(msg2, rootID)

    // We expect there to be 3 msgs: root, dataless msg1, dataful msg2
    {
      const ids = []
      const texts = []
      for (const rec of peer.db.records()) {
        if (rec.msg.metadata.domain === 'something') {
          ids.push(rec.id)
          texts.push(rec.msg.data?.text)
        }
      }
      assert.deepEqual(ids, [rootID, msg1ID, msg2ID])
      assert.deepEqual(texts, [undefined, undefined, 'second'])
      const stats = await p(peer.db.log.stats)()
      assert.deepEqual(stats, { totalBytes: 3718, deletedBytes: 0 })
    }

    await p(peer.db.add)(msg1Dataful, rootID)

    // We expect there to be 3 msgs: root, (deleted) dataless msg1, dataful msg2
    // and dataful msg1 appended at the end
    {
      const ids = []
      const texts = []
      for (const rec of peer.db.records()) {
        if (rec.msg.metadata.domain === 'something') {
          ids.push(rec.id)
          texts.push(rec.msg.data?.text)
        }
      }
      assert.deepEqual(ids, [rootID, msg2ID, msg1ID])
      assert.deepEqual(texts, [undefined, 'second', 'first'])
      const stats = await p(peer.db.log.stats)()
      assert.deepEqual(stats, { totalBytes: 4340, deletedBytes: 610 })
    }
  })

  await p(peer.close)(true)
})
