const test = require('tape')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const p = require('util').promisify
const { generateKeypair } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-records-iter')
rimraf.sync(DIR)

test('records() iterator', async (t) => {
  const keys = generateKeypair('alice')
  const peer = SecretStack({ appKey: caps.shs })
    .use(require('../'))
    .call(null, { keys, path: DIR })

  await peer.db.loaded()

  for (let i = 0; i < 6; i++) {
    await p(peer.db.create)({
      type: i % 2 === 0 ? 'post' : 'about',
      content:
        i % 2 === 0
          ? { text: 'hello ' + i }
          : { about: peer.id, name: 'Mr. #' + i },
    })
  }

  let count = 0
  for (const rec of peer.db.records()) {
    if (!rec.msg.content) continue
    t.true(rec.misc.size > rec.msg.metadata.size)
    count++
  }
  t.equals(count, 6)

  await p(peer.close)(true)
})
