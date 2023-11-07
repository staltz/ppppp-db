const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const p = require('node:util').promisify
const Log = require('../../lib/log')

test('Log get() handles bad offset NaN', async function (t) {
  const file = '/tmp/ppppp-db-log-test-bad-offset.log'
  try {
    fs.unlinkSync(file)
  } catch (_) {}
  const log = Log(file, { blockSize: 2 * 1024 })

  const msg = Buffer.from('testing')

  const offset1 = await p(log.append)(msg)
  assert.equal(offset1, 0)

  await assert.rejects(p(log.get)(NaN), (err) => {
    assert.match(err.message, /Offset NaN is not a number/, err.message)
    assert.equal(err.code, 'ERR_AAOL_INVALID_OFFSET')
    return true
  })

  await p(log.close)()
})

test('Log get() handles bad offset -1', async function (t) {
  const file = '/tmp/ppppp-db-log-test-bad-offset.log'
  try {
    fs.unlinkSync(file)
  } catch (_) {}
  const log = Log(file, { blockSize: 2 * 1024 })

  const msg = Buffer.from('testing')

  const offset1 = await p(log.append)(msg)
  assert.equal(offset1, 0)

  await assert.rejects(p(log.get)(-1), (err) => {
    assert.match(err.message, /Offset -1 is negative/, err.message)
    assert.equal(err.code, 'ERR_AAOL_INVALID_OFFSET')
    return true
  })
  await p(log.close)()
})

test('Log get() handles bad offset out of bounds', async function (t) {
  const file = '/tmp/ppppp-db-log-test-bad-offset.log'
  try {
    fs.unlinkSync(file)
  } catch (_) {}
  const log = Log(file, { blockSize: 2 * 1024 })

  const msg = Buffer.from('testing')

  const offset1 = await p(log.append)(msg)
  assert.equal(offset1, 0)

  await assert.rejects(p(log.get)(10240), (err) => {
    assert.match(err.message, /Offset 10240 is beyond log size/, err.message)
    assert.equal(err.code, 'ERR_AAOL_OFFSET_OUT_OF_BOUNDS')
    return true
  })

  await p(log.close)()
})
