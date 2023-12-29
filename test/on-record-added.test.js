const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const Keypair = require('ppppp-keypair')
const { createPeer } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-on-msg-added')
rimraf.sync(DIR)

test('onRecordAdded', async (t) => {
  const peer = createPeer({
    keypair: Keypair.generate('ed25519', 'alice'),
    path: DIR,
  })

  await peer.db.loaded()

  const account = await p(peer.db.account.create)({
    subdomain: 'person',
    _nonce: 'alice',
  })

  let publishedRec1 = false
  const listenedRecs = []

  var remove = peer.db.onRecordAdded((rec) => {
    listenedRecs.push(rec)
    if (rec.msg.data?.text === 'I am hungry') {
      assert.equal(publishedRec1, true, 'onRecordAdded triggered after publish')
    }
  })

  const rec1 = await new Promise((resolve, reject) => {
    peer.db.feed.publish(
      {
        account,
        domain: 'post',
        data: { text: 'I am hungry' },
      },
      (err, rec) => {
        publishedRec1 = true
        if (err) reject(err)
        else resolve(rec)
      }
    )
  })
  assert.equal(rec1.msg.data.text, 'I am hungry', 'msg1 text correct')

  await p(setTimeout)(500)

  assert.equal(listenedRecs.length, 3)
  assert.equal(listenedRecs[0].msg.metadata.account, 'self', 'account root')
  assert.equal(listenedRecs[1].msg.data, null, 'root')
  assert.equal(listenedRecs[1].msg.metadata.dataSize, 0, 'root')
  assert.deepEqual(listenedRecs[2], rec1, 'actual record')

  remove()
  await p(peer.close)(true)
})
