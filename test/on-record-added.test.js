const test = require('tape')
const path = require('path')
const rimraf = require('rimraf')
const os = require('os')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const p = require('util').promisify
const { generateKeypair } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-on-msg-added')
rimraf.sync(DIR)

test('onRecordAdded', async (t) => {
  const keys = generateKeypair('alice')
  const peer = SecretStack({ appKey: caps.shs })
    .use(require('../lib'))
    .call(null, { keys, path: DIR })

  await peer.db.loaded()

  const listened = []
  var remove = peer.db.onRecordAdded((ev) => {
    listened.push(ev)
  })

  const rec1 = await p(peer.db.create)({
    type: 'post',
    content: { text: 'I am hungry' },
  })
  t.equal(rec1.msg.content.text, 'I am hungry', 'msg1 text correct')

  await p(setTimeout)(500)

  t.equal(listened.length, 2)
  t.deepEquals(listened[0].msg.content, null, 'root')
  t.deepEquals(listened[0].msg.metadata.size, 0, 'root')
  t.deepEquals(listened[1], rec1, 'actual record')

  remove()
  await p(peer.close)(true)
})
