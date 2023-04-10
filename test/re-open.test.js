const test = require('tape')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const p = require('util').promisify
const { generateKeypair } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-re-open')
rimraf.sync(DIR)

test('create some msgs, close, re-open', async (t) => {
  const keys = generateKeypair('alice')
  const peer = SecretStack({ appKey: caps.shs })
    .use(require('../'))
    .use(require('ssb-box'))
    .call(null, { keys, path: DIR })

  await peer.db.loaded()
  t.pass('opened db')

  const msgHashes = []
  for (let i = 0; i < 6; i++) {
    const rec = await p(peer.db.create)({
      type: 'post',
      content: { text: 'hello ' + i },
    })
    msgHashes.push(rec.hash)
  }
  t.pass('created some msgs')

  await p(peer.db.del)(msgHashes[2])
  t.pass('deleted the 3rd msg')

  await p(peer.close)(true)
  t.pass('closed')

  const peer2 = SecretStack({ appKey: caps.shs })
    .use(require('../'))
    .use(require('ssb-box'))
    .call(null, { keys, path: DIR })
  t.pass('re-opened')

  await peer2.db.loaded()

  const texts = []
  for (const msg of peer2.db.msgs()) {
    if (!msg.content) continue
    texts.push(msg.content.text)
  }

  t.deepEquals(
    texts,
    ['hello 0', 'hello 1', 'hello 3', 'hello 4', 'hello 5'],
    'queried posts'
  )

  await p(peer2.close)(true)
})
