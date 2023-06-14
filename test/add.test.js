const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const Keypair = require('ppppp-keypair')
const MsgV2 = require('../lib/msg-v2')

const DIR = path.join(os.tmpdir(), 'ppppp-db-add')
rimraf.sync(DIR)

test('add()', async (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const peer = SecretStack({ appKey: caps.shs })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keypair, path: DIR })

  await peer.db.loaded()

  const groupMsg0 = MsgV2.createGroup(keypair)
  const group = MsgV2.getMsgHash(groupMsg0)

  await p(peer.db.add)(groupMsg0, group)

  const rootMsg = MsgV2.createRoot(group, 'post', keypair)
  const rootHash = MsgV2.getMsgHash(rootMsg)

  const recRoot = await p(peer.db.add)(rootMsg, rootHash)
  assert.equal(recRoot.msg.metadata.dataSize, 0, 'root msg added')
  const tangle = new MsgV2.Tangle(rootHash)
  tangle.add(recRoot.hash, recRoot.msg)

  const inputMsg = MsgV2.create({
    keypair,
    type: 'post',
    data: { text: 'This is the first post!' },
    group,
    groupTips: [group],
    tangles: {
      [rootHash]: tangle,
    },
  })

  const rec = await p(peer.db.add)(inputMsg, rootHash)
  assert.equal(rec.msg.data.text, 'This is the first post!')

  await p(peer.close)(true)
})
