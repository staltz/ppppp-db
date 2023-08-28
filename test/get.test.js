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

const DIR = path.join(os.tmpdir(), 'ppppp-db-get')
rimraf.sync(DIR)

const keypair = Keypair.generate('ed25519', 'alice')
let peer
let id
let msgID1
test('setup', async (t) => {
  peer = SecretStack({ appKey: caps.shse })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keypair, path: DIR })

  await peer.db.loaded()

  id = (await p(peer.db.account.create)({domain: 'person'}))

  const rec1 = await p(peer.db.feed.publish)({
    account: id,
    domain: 'post',
    data: { text: 'I am 1st post' },
  })
  msgID1 = MsgV3.getMsgID(rec1.msg)
})

test('get() supports msg IDs', async (t) => {
  const msg = peer.db.get(msgID1)
  assert.ok(msg, 'msg exists')
  assert.equal(msg.data.text, 'I am 1st post')
})

test('teardown', (t) => {
  peer.close(t.end)
})
