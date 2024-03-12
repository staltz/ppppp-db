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
    // Moot can be added without validating its account & sigkey
    const moot = MsgV4.createMoot(id, 'post', keypair)
    const mootID = MsgV4.getMsgID(moot)
    const recMoot = await p(peer.db.add)(moot, mootID)
    assert.equal(recMoot.msg.metadata.dataSize, 0, 'moot added')

    await p(peer.db.add)(accountMsg0, id)

    const tangle = new MsgV4.Tangle(mootID)
    tangle.add(recMoot.id, recMoot.msg)

    const inputMsg = MsgV4.create({
      keypair,
      domain: 'post',
      data: { text: 'This is the first post!' },
      account: id,
      accountTips: [id],
      tangles: {
        [mootID]: tangle,
      },
    })

    const rec = await p(peer.db.add)(inputMsg, null) // tangleID implicit
    assert.equal(rec.msg.data.text, 'This is the first post!')

    const stats = await p(peer.db.log.stats)()
    assert.deepEqual(stats, { totalBytes: 1662, deletedBytes: 0 })
  })

  await t.test('concurrent add of the same msg appends just one', async () => {
    const moot = MsgV4.createMoot(id, 'whatever', keypair)
    const mootID = MsgV4.getMsgID(moot)
    await Promise.all([
      p(peer.db.add)(moot, mootID),
      p(peer.db.add)(moot, mootID),
    ])

    const stats = await p(peer.db.log.stats)()
    assert.deepEqual(stats, { totalBytes: 2072, deletedBytes: 0 })
  })

  await t.test('dataful msg replacing a dataless msg', async (t) => {
    const moot = MsgV4.createMoot(id, 'something', keypair)
    const mootID = MsgV4.getMsgID(moot)
    await p(peer.db.add)(moot, mootID)

    const tangle = new MsgV4.Tangle(mootID)
    tangle.add(mootID, moot)

    const msg1Dataful = MsgV4.create({
      keypair,
      account: id,
      accountTips: [id],
      domain: 'something',
      data: { text: 'first' },
      tangles: {
        [mootID]: tangle,
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
        [mootID]: tangle,
      },
    })
    const msg2ID = MsgV4.getMsgID(msg2)

    await p(peer.db.add)(msg1Dataless, mootID)
    await p(peer.db.add)(msg2, mootID)

    // We expect there to be 3 msgs: moot, dataless msg1, dataful msg2
    {
      const ids = []
      const texts = []
      for (const rec of peer.db.records()) {
        if (rec.msg.metadata.domain === 'something') {
          ids.push(rec.id)
          texts.push(rec.msg.data?.text)
        }
      }
      assert.deepEqual(ids, [mootID, msg1ID, msg2ID])
      assert.deepEqual(texts, [undefined, undefined, 'second'])
      const stats = await p(peer.db.log.stats)()
      assert.deepEqual(stats, { totalBytes: 3718, deletedBytes: 0 })
    }

    await p(peer.db.add)(msg1Dataful, mootID)

    // We expect there to be 3 msgs: moot, (deleted) dataless msg1, dataful msg2
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
      assert.deepEqual(ids, [mootID, msg2ID, msg1ID])
      assert.deepEqual(texts, [undefined, 'second', 'first'])
      const stats = await p(peer.db.log.stats)()
      assert.deepEqual(stats, { totalBytes: 4340, deletedBytes: 610 })
    }
  })

  await p(peer.close)(true)
})
