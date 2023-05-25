const test = require('tape')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const p = require('util').promisify
const { generateKeypair } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-tangle')
rimraf.sync(DIR)

let peer
let rootPost, reply1Lo, reply1Hi, reply2A, reply3Lo, reply3Hi
let tangle
test('setup', async (t) => {
  const keysA = generateKeypair('alice')
  const keysB = generateKeypair('bob')
  const keysC = generateKeypair('carol')

  peer = SecretStack({ appKey: caps.shs })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keys: keysA, path: DIR })

  await peer.db.loaded()

  const group = (await p(peer.db.group.create)(null)).hash

  // Slow down append so that we can trigger msg creation in parallel
  const originalAppend = peer.db._getLog().append
  peer.db._getLog().append = function (...args) {
    setTimeout(originalAppend, 20, ...args)
  }

  rootPost = (
    await p(peer.db.feed.publish)({
      group,
      keys: keysA,
      type: 'comment',
      data: { text: 'root' },
    })
  ).hash

  const [{ hash: reply1B }, { hash: reply1C }] = await Promise.all([
    p(peer.db.feed.publish)({
      group,
      keys: keysB,
      type: 'comment',
      data: { text: 'reply 1B' },
      tangles: [rootPost],
    }),
    p(peer.db.feed.publish)({
      group,
      keys: keysC,
      type: 'comment',
      data: { text: 'reply 1C' },
      tangles: [rootPost],
    }),
  ])
  reply1Lo = reply1B.localeCompare(reply1C) < 0 ? reply1B : reply1C
  reply1Hi = reply1B.localeCompare(reply1C) < 0 ? reply1C : reply1B

  reply2A = (
    await p(peer.db.feed.publish)({
      group,
      keys: keysA,
      type: 'comment',
      data: { text: 'reply 2' },
      tangles: [rootPost],
    })
  ).hash

  const [{ hash: reply3B }, { hash: reply3C }] = await Promise.all([
    p(peer.db.feed.publish)({
      group,
      keys: keysB,
      type: 'comment',
      data: { text: 'reply 3B' },
      tangles: [rootPost],
    }),
    p(peer.db.feed.publish)({
      group,
      keys: keysC,
      type: 'comment',
      data: { text: 'reply 3C' },
      tangles: [rootPost],
    }),
  ])
  reply3Lo = reply3B.localeCompare(reply3C) < 0 ? reply3B : reply3C
  reply3Hi = reply3B.localeCompare(reply3C) < 0 ? reply3C : reply3B

  tangle = peer.db.getTangle(rootPost)
})

test('Tangle.has', (t) => {
  t.true(tangle.has(rootPost), 'has rootPost')
  t.true(tangle.has(reply1Lo), 'has reply1Lo')
  t.true(tangle.has(reply1Hi), 'has reply1Hi')
  t.true(tangle.has(reply2A), 'has reply2A')
  t.true(tangle.has(reply3Lo), 'has reply3Lo')
  t.true(tangle.has(reply3Hi), 'has reply3Hi')
  t.false(tangle.has('nonsense'), 'does not have nonsense')
  t.end()
})

test('Tangle.getDepth', (t) => {
  t.equals(tangle.getDepth(rootPost), 0, 'depth of rootPost is 0')
  t.equals(tangle.getDepth(reply1Lo), 1, 'depth of reply1Lo is 1')
  t.equals(tangle.getDepth(reply1Hi), 1, 'depth of reply1Hi is 1')
  t.equals(tangle.getDepth(reply2A), 2, 'depth of reply2A is 2')
  t.equals(tangle.getDepth(reply3Lo), 3, 'depth of reply3Lo is 3')
  t.equals(tangle.getDepth(reply3Hi), 3, 'depth of reply3Hi is 3')
  t.end()
})

test('Tangle.getMaxDepth', (t) => {
  t.equals(tangle.getMaxDepth(), 3, 'max depth is 3')
  t.end()
})

test('Tangle.topoSort', (t) => {
  const sorted = tangle.topoSort()

  t.deepEquals(sorted, [
    rootPost,
    reply1Lo,
    reply1Hi,
    reply2A,
    reply3Lo,
    reply3Hi,
  ])
  t.end()
})

test('Tangle.precedes', (t) => {
  t.true(tangle.precedes(rootPost, reply1Lo), 'rootPost precedes reply1Lo')
  t.true(tangle.precedes(rootPost, reply1Hi), 'rootPost precedes reply1Hi')
  t.false(
    tangle.precedes(reply1Hi, rootPost),
    'reply1Hi doesnt precede rootPost'
  )
  t.false(
    tangle.precedes(reply1Lo, reply1Hi),
    'reply1Lo doesnt precede reply1Hi'
  )
  t.false(tangle.precedes(reply1Lo, reply1Lo), 'reply1Lo doesnt precede itself')
  t.true(tangle.precedes(reply1Lo, reply3Hi), 'reply1Lo precedes reply3Hi')
  t.true(tangle.precedes(reply1Hi, reply2A), 'reply1Hi precedes reply2A')
  t.false(
    tangle.precedes(reply3Lo, reply1Hi),
    'reply3Lo doesnt precede reply1Hi'
  )

  t.end()
})

test('Tangle.getTips', (t) => {
  const tips = tangle.getTips()

  t.equals(tips.size, 2, 'there are 2 tips')
  t.true(tips.has(reply3Lo), 'tips contains reply3Lo')
  t.true(tips.has(reply3Hi), 'tips contains reply3Hi')
  t.end()
})

test('Tangle.getLipmaaSet', (t) => {
  t.equals(tangle.getLipmaaSet(0).size, 0, 'lipmaa 0 (empty)')

  t.equals(tangle.getLipmaaSet(1).size, 1, 'lipmaa 1 (-1)')
  t.true(tangle.getLipmaaSet(1).has(rootPost), 'lipmaa 1 (-1)')

  t.equals(tangle.getLipmaaSet(2).size, 2, 'lipmaa 2 (-1)')
  t.true(tangle.getLipmaaSet(2).has(reply1Lo), 'lipmaa 2 (-1)')
  t.true(tangle.getLipmaaSet(2).has(reply1Hi), 'lipmaa 2 (-1)')

  t.equals(tangle.getLipmaaSet(3).size, 1, 'lipmaa 3 (leap!)')
  t.true(tangle.getLipmaaSet(3).has(rootPost), 'lipmaa 3 (leap!)')

  t.equals(tangle.getLipmaaSet(4).size, 2, 'lipmaa 4 (-1)')
  t.true(tangle.getLipmaaSet(4).has(reply3Lo), 'lipmaa 4 (-1)')
  t.true(tangle.getLipmaaSet(4).has(reply3Hi), 'lipmaa 4 (-1)')

  t.equals(tangle.getLipmaaSet(5).size, 0, 'lipmaa 5 (empty)')

  t.end()
})

test('Tangle.getDeletablesAndErasables basic', (t) => {
  const { deletables, erasables } = tangle.getDeletablesAndErasables(reply2A)

  t.deepEquals(deletables, [reply1Hi], 'deletables')
  t.deepEquals(erasables, [reply1Lo, rootPost], 'erasables')
  t.end()
})

test('Tangle.getDeletablesAndErasables with lipmaa', (t) => {
  const { deletables, erasables } = tangle.getDeletablesAndErasables(reply3Lo)

  t.deepEquals(deletables, [reply1Lo, reply1Hi, reply2A], 'deletables')
  t.deepEquals(erasables, [rootPost], 'erasables')
  t.end()
})

test('Tangle.topoSort after some have been deleted and erased', async (t) => {
  const { deletables, erasables } = tangle.getDeletablesAndErasables(reply3Lo)
  for (const msgHash of deletables) {
    await p(peer.db.del)(msgHash)
  }
  for (const msgHash of erasables) {
    await p(peer.db.erase)(msgHash)
  }

  const tangle2 = peer.db.getTangle(rootPost)
  const sorted = tangle2.topoSort()

  t.deepEquals(sorted, [rootPost, reply3Lo, reply3Hi])
})

test('teardown', async (t) => {
  await p(peer.close)(true)
})
