const test = require('tape')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const p = require('util').promisify
const { generateKeypair } = require('./util')
const Tangle = require('../lib/tangle')

const DIR = path.join(os.tmpdir(), 'ppppp-db-tangle')
rimraf.sync(DIR)

let peer
let rootPost, reply1Lo, reply1Hi, reply2A, reply3Lo, reply3Hi
test('setup', async (t) => {
  const keysA = generateKeypair('alice')
  const keysB = generateKeypair('bob')
  const keysC = generateKeypair('carol')

  peer = SecretStack({ appKey: caps.shs })
    .use(require('../'))
    .use(require('ssb-box'))
    .call(null, { keys: keysA, path: DIR })

  await peer.db.loaded()

  // Slow down append so that we can create msgs in parallel
  const originalAppend = peer.db._getLog().append
  peer.db._getLog().append = function (...args) {
    setTimeout(originalAppend, 20, ...args)
  }

  rootPost = (
    await p(peer.db.create)({
      keys: keysA,
      type: 'comment',
      content: { text: 'root' },
    })
  ).hash

  const [{ hash: reply1B }, { hash: reply1C }] = await Promise.all([
    p(peer.db.create)({
      keys: keysB,
      type: 'comment',
      content: { text: 'reply 1' },
      tangles: [rootPost],
    }),
    p(peer.db.create)({
      keys: keysC,
      type: 'comment',
      content: { text: 'reply 1' },
      tangles: [rootPost],
    }),
  ])
  reply1Lo = reply1B.localeCompare(reply1C) < 0 ? reply1B : reply1C
  reply1Hi = reply1B.localeCompare(reply1C) < 0 ? reply1C : reply1B

  reply2A = (
    await p(peer.db.create)({
      keys: keysA,
      type: 'comment',
      content: { text: 'reply 2' },
      tangles: [rootPost],
    })
  ).hash

  const [{ hash: reply3B }, { hash: reply3C }] = await Promise.all([
    p(peer.db.create)({
      keys: keysB,
      type: 'comment',
      content: { text: 'reply 3' },
      tangles: [rootPost],
    }),
    p(peer.db.create)({
      keys: keysC,
      type: 'comment',
      content: { text: 'reply 3' },
      tangles: [rootPost],
    }),
  ])
  reply3Lo = reply3B.localeCompare(reply3C) < 0 ? reply3B : reply3C
  reply3Hi = reply3B.localeCompare(reply3C) < 0 ? reply3C : reply3B
})

test('Tangle.topoSort', (t) => {
  const tangle = new Tangle(rootPost, peer.db.records())
  const sorted = tangle.topoSort()

  t.deepEquals(sorted, [
    rootPost,
    reply1Lo,
    reply1Hi,
    reply2A,
    reply3Lo,
    reply3Hi,
  ])
  console.log(sorted);
  t.end()
})

test('Tangle.getTips', (t) => {
  const tangle = new Tangle(rootPost, peer.db.records())
  const tips = tangle.getTips()

  t.equals(tips.length, 2, 'there are 2 tips')
  t.true(tips.includes(reply3Lo), 'tips contains reply3Lo')
  t.true(tips.includes(reply3Hi), 'tips contains reply3Hi')
  t.end()
})

test('Tangle.getLipmaa', (t) => {
  const tangle = new Tangle(rootPost, peer.db.records())
  t.deepEquals(tangle.getLipmaa(0), [], 'lipmaa 0 (empty)')
  t.deepEquals(tangle.getLipmaa(1), [rootPost], 'lipmaa 1 (-1)')
  t.deepEquals(tangle.getLipmaa(2), [reply1Lo, reply1Hi], 'lipmaa 2 (-1)')
  t.deepEquals(tangle.getLipmaa(3), [rootPost], 'lipmaa 3 (leap!)')
  t.deepEquals(tangle.getLipmaa(4), [reply3Lo, reply3Hi], 'lipmaa 4 (-1)')
  t.deepEquals(tangle.getLipmaa(5), [], 'lipmaa 5 (empty)')

  t.end()
})

test('Tangle.getDeletablesAndEmptyables basic', t => {
  const tangle = new Tangle(rootPost, peer.db.records())
  const { deletables, emptyables } = tangle.getDeletablesAndEmptyables(reply2A)

  t.deepEquals(deletables, [reply1Hi], 'deletables')
  t.deepEquals(emptyables, [reply1Lo, rootPost], 'emptyables')
  t.end()
})


test('Tangle.getDeletablesAndEmptyables with lipmaa', t => {
  const tangle = new Tangle(rootPost, peer.db.records())
  const { deletables, emptyables } = tangle.getDeletablesAndEmptyables(reply3Lo)

  t.deepEquals(deletables, [reply1Lo, reply1Hi, reply2A], 'deletables')
  t.deepEquals(emptyables, [rootPost], 'emptyables')
  t.end()
})

test('teardown', async (t) => {
  await p(peer.close)(true)
})
