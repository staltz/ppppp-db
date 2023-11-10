const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const p = require('node:util').promisify
const Log = require('../../lib/log')

test('Log basics', async function (t) {
  await t.test('Log handles basic binary records', async function (t) {
    const file = '/tmp/ppppp-db-log-test-basic-binary.log'
    try {
      fs.unlinkSync(file)
    } catch (_) {}
    const log = Log(file, { blockSize: 2 * 1024 })

    const msg1 = Buffer.from('testing')
    const msg2 = Buffer.from('testing2')

    const offset1 = await p(log.append)(msg1)
    assert.equal(offset1, 0)

    const offset2 = await p(log.append)(msg2)
    assert.equal(offset2, msg1.length + 4)

    const b1 = await p(log._get)(offset1)
    assert.equal(b1.toString(), msg1.toString())

    const b2 = await p(log._get)(offset2)
    assert.equal(b2.toString(), msg2.toString())

    await p(log.close)()
  })

  const json1 = { text: 'testing' }
  const json2 = { test: 'testing2' }

  await t.test('Log handles basic json records', async function (t) {
    const file = '/tmp/ppppp-db-log-test-basic-json.log'
    try {
      fs.unlinkSync(file)
    } catch (_) {}
    const log = Log(file, {
      blockSize: 2 * 1024,
      codec: require('flumecodec/json'),
    })

    const offset1 = await p(log.append)(json1)
    assert.equal(offset1, 0)

    const offset2 = await p(log.append)(json2)
    assert.equal(offset2, 22)

    const rec1 = await p(log._get)(offset1)
    assert.deepEqual(rec1, json1)

    const rec2 = await p(log._get)(offset2)
    assert.deepEqual(rec2, json2)

    await p(log.close)()
  })

  await t.test('Log handles basic json record re-reading', async function (t) {
    const file = '/tmp/ppppp-db-log-test-basic-json.log'
    const log = Log(file, {
      blockSize: 2 * 1024,
      codec: require('flumecodec/json'),
    })

    await p(log.onDrain)()
    assert.equal(log.since.value, 22)

    const rec1 = await p(log._get)(0)
    assert.deepEqual(rec1, json1)

    const rec2 = await p(log._get)(22)
    assert.deepEqual(rec2, json2)

    await p(log.close)()
  })
})
