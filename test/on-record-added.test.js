const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ppppp-caps')
const Keypair = require('ppppp-keypair')

const DIR = path.join(os.tmpdir(), 'ppppp-db-on-msg-added')
rimraf.sync(DIR)

test('onRecordAdded', async (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const peer = SecretStack({ appKey: caps.shse })
    .use(require('../lib'))
    .call(null, { keypair, path: DIR })

  await peer.db.loaded()

  const identity = (await p(peer.db.identity.create)(null)).hash

  const listened = []
  var remove = peer.db.onRecordAdded((ev) => {
    listened.push(ev)
  })

  const rec1 = await p(peer.db.feed.publish)({
    identity,
    domain: 'post',
    data: { text: 'I am hungry' },
  })
  assert.equal(rec1.msg.data.text, 'I am hungry', 'msg1 text correct')

  await p(setTimeout)(500)

  assert.equal(listened.length, 3)
  assert.equal(listened[0].msg.metadata.identity, null, 'identity root')
  assert.equal(listened[1].msg.data, null, 'root')
  assert.equal(listened[1].msg.metadata.dataSize, 0, 'root')
  assert.deepEqual(listened[2], rec1, 'actual record')

  remove()
  await p(peer.close)(true)
})
