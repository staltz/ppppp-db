const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ppppp-caps')
const Keypair = require('ppppp-keypair')

const DIR = path.join(os.tmpdir(), 'ppppp-db-tangle')
rimraf.sync(DIR)

test('getTangle()', async (t) => {
  let peer
  let rootPost, reply1Lo, reply1Hi, reply2, reply3Lo, reply3Hi
  let tangle

  // Setup
  {
    const keypairA = Keypair.generate('ed25519', 'alice')
    const keypairB = Keypair.generate('ed25519', 'bob')
    const keypairC = Keypair.generate('ed25519', 'carol')

    peer = SecretStack({ appKey: caps.shse })
      .use(require('../lib'))
      .use(require('ssb-box'))
      .call(null, { keypair: keypairA, path: DIR })

    await peer.db.loaded()

    const id = await p(peer.db.account.create)({ subdomain: 'person' })

    // Slow down append so that we can trigger msg creation in parallel
    const originalAppend = peer.db._getLog().append
    peer.db._getLog().append = function (...args) {
      setTimeout(originalAppend, 20, ...args)
    }

    rootPost = (
      await p(peer.db.feed.publish)({
        account: id,
        keypair: keypairA,
        domain: 'comment',
        data: { text: 'root' },
      })
    ).id

    const [{ id: reply1B }, { id: reply1C }] = await Promise.all([
      p(peer.db.feed.publish)({
        account: id,
        keypair: keypairB,
        domain: 'comment',
        data: { text: 'reply 1B' },
        tangles: [rootPost],
      }),
      p(peer.db.feed.publish)({
        account: id,
        keypair: keypairC,
        domain: 'comment',
        data: { text: 'reply 1C' },
        tangles: [rootPost],
      }),
    ])
    reply1Lo = reply1B.localeCompare(reply1C) < 0 ? reply1B : reply1C
    reply1Hi = reply1B.localeCompare(reply1C) < 0 ? reply1C : reply1B

    reply2 = (
      await p(peer.db.feed.publish)({
        account: id,
        keypair: keypairA,
        domain: 'comment',
        data: { text: 'reply 2' },
        tangles: [rootPost],
      })
    ).id

    const [{ id: reply3B }, { id: reply3C }] = await Promise.all([
      p(peer.db.feed.publish)({
        account: id,
        keypair: keypairB,
        domain: 'comment',
        data: { text: 'reply 3B' },
        tangles: [rootPost],
      }),
      p(peer.db.feed.publish)({
        account: id,
        keypair: keypairC,
        domain: 'comment',
        data: { text: 'reply 3C' },
        tangles: [rootPost],
      }),
    ])
    reply3Lo = reply3B.localeCompare(reply3C) < 0 ? reply3B : reply3C
    reply3Hi = reply3B.localeCompare(reply3C) < 0 ? reply3C : reply3B

    tangle = peer.db.getTangle(rootPost)
  }

  await t.test('Tangle.has', (t) => {
    assert.equal(tangle.has(rootPost), true, 'has rootPost')
    assert.equal(tangle.has(reply1Lo), true, 'has reply1Lo')
    assert.equal(tangle.has(reply1Hi), true, 'has reply1Hi')
    assert.equal(tangle.has(reply2), true, 'has reply2A')
    assert.equal(tangle.has(reply3Lo), true, 'has reply3Lo')
    assert.equal(tangle.has(reply3Hi), true, 'has reply3Hi')
    assert.equal(tangle.has('nonsense'), false, 'does not have nonsense')
  })

  await t.test('Tangle.getDepth', (t) => {
    assert.equal(tangle.getDepth(rootPost), 0, 'depth of rootPost is 0')
    assert.equal(tangle.getDepth(reply1Lo), 1, 'depth of reply1Lo is 1')
    assert.equal(tangle.getDepth(reply1Hi), 1, 'depth of reply1Hi is 1')
    assert.equal(tangle.getDepth(reply2), 2, 'depth of reply2A is 2')
    assert.equal(tangle.getDepth(reply3Lo), 3, 'depth of reply3Lo is 3')
    assert.equal(tangle.getDepth(reply3Hi), 3, 'depth of reply3Hi is 3')
  })

  await t.test('Tangle.maxDepth', (t) => {
    assert.equal(tangle.maxDepth, 3, 'max depth is 3')
  })

  await t.test('Tangle.topoSort', (t) => {
    const sorted = tangle.topoSort()

    assert.deepEqual(sorted, [
      rootPost,
      reply1Lo,
      reply1Hi,
      reply2,
      reply3Lo,
      reply3Hi,
    ])
  })

  await t.test('Tangle.precedes', (t) => {
    assert.equal(
      tangle.precedes(rootPost, reply1Lo),
      true,
      'rootPost precedes reply1Lo'
    )
    assert.equal(
      tangle.precedes(rootPost, reply1Hi),
      true,
      'rootPost precedes reply1Hi'
    )
    assert.equal(
      tangle.precedes(reply1Hi, rootPost),
      false,
      'reply1Hi doesnt precede rootPost'
    )
    assert.equal(
      tangle.precedes(reply1Lo, reply1Hi),
      false,
      'reply1Lo doesnt precede reply1Hi'
    )
    assert.equal(
      tangle.precedes(reply1Lo, reply1Lo),
      false,
      'reply1Lo doesnt precede itself'
    )
    assert.equal(
      tangle.precedes(reply1Lo, reply3Hi),
      true,
      'reply1Lo precedes reply3Hi'
    )
    assert.equal(
      tangle.precedes(reply1Hi, reply2),
      true,
      'reply1Hi precedes reply2A'
    )
    assert.equal(
      tangle.precedes(reply3Lo, reply1Hi),
      false,
      'reply3Lo doesnt precede reply1Hi'
    )
  })

  await t.test('Tangle.tips', (t) => {
    const tips = tangle.tips

    assert.equal(tips.size, 2, 'there are 2 tips')
    assert.equal(tips.has(reply3Lo), true, 'tips contains reply3Lo')
    assert.equal(tips.has(reply3Hi), true, 'tips contains reply3Hi')
  })

  await t.test('Tangle.getLipmaaSet', (t) => {
    assert.equal(tangle.getLipmaaSet(0).size, 0, 'lipmaa 0 (empty)')

    assert.equal(tangle.getLipmaaSet(1).size, 1, 'lipmaa 1 (-1)')
    assert.equal(tangle.getLipmaaSet(1).has(rootPost), true, 'lipmaa 1 (-1)')

    assert.equal(tangle.getLipmaaSet(2).size, 2, 'lipmaa 2 (-1)')
    assert.equal(tangle.getLipmaaSet(2).has(reply1Lo), true, 'lipmaa 2 (-1)')
    assert.equal(tangle.getLipmaaSet(2).has(reply1Hi), true, 'lipmaa 2 (-1)')

    assert.equal(tangle.getLipmaaSet(3).size, 1, 'lipmaa 3 (leap!)')
    assert.equal(tangle.getLipmaaSet(3).has(rootPost), true, 'lipmaa 3 (leap!)')

    assert.equal(tangle.getLipmaaSet(4).size, 2, 'lipmaa 4 (-1)')
    assert.equal(tangle.getLipmaaSet(4).has(reply3Lo), true, 'lipmaa 4 (-1)')
    assert.equal(tangle.getLipmaaSet(4).has(reply3Hi), true, 'lipmaa 4 (-1)')

    assert.equal(tangle.getLipmaaSet(5).size, 0, 'lipmaa 5 (empty)')
  })

  await t.test('Tangle.getDeletablesAndErasables basic', (t) => {
    const { deletables, erasables } = tangle.getDeletablesAndErasables(reply2)

    assert.deepEqual([...deletables], [reply1Hi], 'deletables')
    assert.deepEqual([...erasables], [reply1Lo, rootPost], 'erasables')
  })

  await t.test('Tangle.getDeletablesAndErasables with many inputs', (t) => {
    const { deletables, erasables } = tangle.getDeletablesAndErasables(
      reply3Lo,
      reply2
    )

    assert.deepEqual([...deletables], [reply1Hi], 'deletables')
    assert.deepEqual([...erasables], [reply1Lo, rootPost], 'erasables')
  })

  await t.test(
    'Tangle.getDeletablesAndErasables with many inputs again',
    (t) => {
      const { deletables, erasables } = tangle.getDeletablesAndErasables(
        reply3Lo,
        reply3Hi
      )

      assert.deepEqual(
        [...deletables],
        [reply1Lo, reply1Hi, reply2],
        'deletables'
      )
      assert.deepEqual([...erasables], [rootPost], 'erasables')
    }
  )

  await t.test('Tangle.getDeletablesAndErasables with lipmaa', (t) => {
    const { deletables, erasables } = tangle.getDeletablesAndErasables(reply3Lo)

    assert.deepEqual(
      [...deletables],
      [reply1Lo, reply1Hi, reply2],
      'deletables'
    )
    assert.deepEqual([...erasables], [rootPost], 'erasables')
  })

  await t.test('Tangle.getMinimumAmong', (t) => {
    const actual1 = tangle.getMinimumAmong([reply1Lo, reply1Hi])
    const expected1 = [reply1Lo, reply1Hi]
    assert.deepEqual(actual1, expected1)

    const actual2 = tangle.getMinimumAmong([reply1Lo, reply1Hi, reply2])
    const expected2 = [reply1Lo, reply1Hi]
    assert.deepEqual(actual2, expected2)

    const actual3 = tangle.getMinimumAmong([reply2, reply3Lo, reply3Hi])
    const expected3 = [reply2]
    assert.deepEqual(actual3, expected3)

    const actual4 = tangle.getMinimumAmong([reply1Hi, reply3Lo])
    const expected4 = [reply1Hi]
    assert.deepEqual(actual4, expected4)
  })

  await t.test(
    'Tangle.topoSort after some have been deleted and erased',
    async (t) => {
      const { deletables, erasables } =
        tangle.getDeletablesAndErasables(reply3Lo)
      for (const msgID of deletables) {
        await p(peer.db.del)(msgID)
      }
      for (const msgID of erasables) {
        await p(peer.db.erase)(msgID)
      }

      const tangle2 = peer.db.getTangle(rootPost)
      const sorted = tangle2.topoSort()

      assert.deepEqual(sorted, [rootPost, reply3Lo, reply3Hi])
    }
  )

  await p(peer.close)(true)
})
