const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const Keypair = require('ppppp-keypair')
const MsgV4 = require('../lib/msg-v4')
const { createPeer } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-get')
rimraf.sync(DIR)

test('get()', async (t) => {
  const peer = createPeer({
    keypair: Keypair.generate('ed25519', 'alice'),
    path: DIR,
  })

  await peer.db.loaded()

  const id = await p(peer.db.account.create)({ subdomain: 'person' })

  const rec1 = await p(peer.db.feed.publish)({
    account: id,
    domain: 'post',
    data: { text: 'I am 1st post' },
  })
  const msgID1 = MsgV4.getMsgID(rec1.msg)

  const msg = await p(peer.db.get)(msgID1)
  assert.ok(msg, 'msg exists')
  assert.equal(msg.data.text, 'I am 1st post')

  await p(peer.close)(true)
})
