const test = require('tape')
const ssbKeys = require('ssb-keys')
const path = require('path')
const rimraf = require('rimraf')
const os = require('os')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const p = require('util').promisify

const DIR = path.join(os.tmpdir(), 'ssb-memdb-for-each')
rimraf.sync(DIR)

test('forEach', async (t) => {
  const ssb = SecretStack({ appKey: caps.shs })
    .use(require('../'))
    .use(require('ssb-classic'))
    .call(null, {
      keys: ssbKeys.generate('ed25519', 'alice'),
      path: DIR,
    })

  await ssb.db.loaded()

  for (let i = 0; i < 10; i++) {
    await p(ssb.db.create)({
      feedFormat: 'classic',
      content:
        i % 2 === 0
          ? { type: 'post', text: 'hello ' + i }
          : { type: 'about', about: ssb.id, name: 'Mr. #' + i },
    })
  }

  const results = []
  ssb.db.forEach((msg) => {
    if (msg.value.content.type === 'post') {
      results.push(msg.value.content.text)
    }
  })

  t.deepEqual(
    results,
    ['hello 0', 'hello 2', 'hello 4', 'hello 6', 'hello 8'],
    'queried posts'
  )

  await p(ssb.close)(true)
})
