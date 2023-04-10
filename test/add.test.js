const test = require('tape')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const FeedV1 = require('../lib/feed-v1')
const p = require('util').promisify
const { generateKeypair } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-add')
rimraf.sync(DIR)

test('add()', async (t) => {
  const keys = generateKeypair('alice')
  const peer = SecretStack({ appKey: caps.shs })
    .use(require('../'))
    .use(require('ssb-box'))
    .call(null, { keys, path: DIR })

  await peer.db.loaded()

  const rootMsg = FeedV1.createRoot(keys, 'post')
  const rootHash = FeedV1.getMsgHash(rootMsg)

  const recRoot = await p(peer.db.add)(rootMsg, rootHash)
  t.equals(recRoot.msg.metadata.when, 0, 'root msg added')

  const inputMsg = FeedV1.create({
    keys,
    when: 1514517067954,
    type: 'post',
    content: { text: 'This is the first post!' },
    tangles: {
      [rootHash]: new Map([[FeedV1.getMsgHash(rootMsg), rootMsg]]),
    },
  })

  const rec = await p(peer.db.add)(inputMsg, rootHash)
  t.equal(rec.msg.content.text, 'This is the first post!')

  await p(peer.close)(true)
})
