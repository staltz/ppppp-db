const test = require('tape')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const p = require('util').promisify
const MsgV2 = require('../lib/msg-v2')
const { generateKeypair } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-feed-publish')
rimraf.sync(DIR)

const keys = generateKeypair('alice')
let peer
let group
let rootMsg
let rootHash
test('setup', async (t) => {
  peer = SecretStack({ appKey: caps.shs })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keys, path: DIR })

  await peer.db.loaded()

  group = (await p(peer.db.group.create)(null)).hash
  rootMsg = MsgV2.createRoot(group, 'post', keys)
  rootHash = MsgV2.getMsgHash(rootMsg)

  await p(peer.db.add)(rootMsg, rootHash)
})

test('feed.getId()', async (t) => {
  const id = peer.db.feed.getId(group, 'post')
  t.equals(id, rootHash, 'feed.getId() returns root hash')
})

test('teardown', (t) => {
  peer.close(t.end)
})