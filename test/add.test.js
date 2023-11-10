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

  const accountMsg0 = MsgV3.createAccount(keypair, 'person', 'aliceNonce')
  const id = MsgV3.getMsgID(accountMsg0)

  await p(peer.db.add)(accountMsg0, id)

  const rootMsg = MsgV3.createMoot(id, 'post', keypair)
  const rootID = MsgV3.getMsgID(rootMsg)

  const recRoot = await p(peer.db.add)(rootMsg, rootID)
  assert.equal(recRoot.msg.metadata.dataSize, 0, 'root msg added')
  const tangle = new MsgV3.Tangle(rootID)
  tangle.add(recRoot.id, recRoot.msg)

  const inputMsg = MsgV3.create({
    keypair,
    domain: 'post',
    data: { text: 'This is the first post!' },
    account: id,
    accountTips: [id],
    tangles: {
      [rootID]: tangle,
    },
  })

  const rec = await p(peer.db.add)(inputMsg, rootID)
  assert.equal(rec.msg.data.text, 'This is the first post!')

  await p(peer.db._getLog().onDrain)()
  const stats = await p(peer.db.logStats)()
  assert.deepEqual(stats, { totalBytes: 904, deletedBytes: 0 })

  await p(peer.close)(true)
})
