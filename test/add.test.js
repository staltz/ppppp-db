const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ppppp-caps')
const Keypair = require('ppppp-keypair')
const MsgV3 = require('../lib/msg-v3')

const DIR = path.join(os.tmpdir(), 'ppppp-db-add')
rimraf.sync(DIR)

test('add()', async (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const peer = SecretStack({ appKey: caps.shse })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keypair, path: DIR })

  await peer.db.loaded()

  const accountMsg0 = MsgV3.createAccount(keypair, 'person')
  const id = MsgV3.getMsgHash(accountMsg0)

  await p(peer.db.add)(accountMsg0, id)

  const rootMsg = MsgV3.createRoot(id, 'post', keypair)
  const rootHash = MsgV3.getMsgHash(rootMsg)

  const recRoot = await p(peer.db.add)(rootMsg, rootHash)
  assert.equal(recRoot.msg.metadata.dataSize, 0, 'root msg added')
  const tangle = new MsgV3.Tangle(rootHash)
  tangle.add(recRoot.hash, recRoot.msg)

  const inputMsg = MsgV3.create({
    keypair,
    domain: 'post',
    data: { text: 'This is the first post!' },
    account: id,
    accountTips: [id],
    tangles: {
      [rootHash]: tangle,
    },
  })

  const rec = await p(peer.db.add)(inputMsg, rootHash)
  assert.equal(rec.msg.data.text, 'This is the first post!')

  await p(peer.close)(true)
})
