const test = require('tape')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const MsgV2 = require('../lib/msg-v2')
const p = require('util').promisify
const { generateKeypair } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-add')
rimraf.sync(DIR)

test('add()', async (t) => {
  const keys = generateKeypair('alice')
  const peer = SecretStack({ appKey: caps.shs })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keys, path: DIR })

  await peer.db.loaded()

  const groupMsg0 = MsgV2.createGroup(keys)
  const group = MsgV2.getMsgHash(groupMsg0)

  await p(peer.db.add)(groupMsg0, group)

  const rootMsg = MsgV2.createRoot(group, 'post', keys)
  const rootHash = MsgV2.getMsgHash(rootMsg)

  const recRoot = await p(peer.db.add)(rootMsg, rootHash)
  t.equals(recRoot.msg.metadata.dataSize, 0, 'root msg added')
  const tangle = new MsgV2.Tangle(rootHash)
  tangle.add(recRoot.hash, recRoot.msg)

  const inputMsg = MsgV2.create({
    keys,
    type: 'post',
    data: { text: 'This is the first post!' },
    group,
    groupTips: [group],
    tangles: {
      [rootHash]: tangle,
    },
  })

  const rec = await p(peer.db.add)(inputMsg, rootHash)
  t.equal(rec.msg.data.text, 'This is the first post!')

  await p(peer.close)(true)
})
