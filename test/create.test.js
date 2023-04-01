const test = require('tape')
const ssbKeys = require('ssb-keys')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const p = require('util').promisify

const DIR = path.join(os.tmpdir(), 'ppppp-db-create');
rimraf.sync(DIR)

let ssb
test('setup', async (t) => {
  ssb = SecretStack({ appKey: caps.shs })
    .use(require('../'))
    .use(require('ssb-classic'))
    .use(require('ssb-box'))
    .call(null, {
      keys: ssbKeys.generate('ed25519', 'alice'),
      path: DIR,
    })

  await ssb.db.loaded()
})

test('create() classic', async (t) => {
  const msg1 = await p(ssb.db.create)({
    feedFormat: 'classic',
    content: { type: 'post', text: 'I am hungry' },
  })
  t.equal(msg1.value.content.text, 'I am hungry', 'msg1 text correct')

  const msg2 = await p(ssb.db.create)({
    content: { type: 'post', text: 'I am hungry 2' },
    feedFormat: 'classic',
  })
  t.equal(msg2.value.content.text, 'I am hungry 2', 'msg2 text correct')
  t.equal(msg2.value.previous, msg1.key, 'msg2 previous correct')
})

test('create() classic box', async (t) => {
  const msgBoxed = await p(ssb.db.create)({
    feedFormat: 'classic',
    content: { type: 'post', text: 'I am chewing food', recps: [ssb.id] },
    encryptionFormat: 'box',
  })
  t.equal(typeof msgBoxed.value.content, 'string')
  t.true(msgBoxed.value.content.endsWith('.box'), '.box')

  const msgVal = ssb.db.get(msgBoxed.key)
  t.equals(msgVal.content.text, 'I am chewing food')
})

test('teardown', (t) => {
  ssb.close(t.end)
})
