const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const p = require('node:util').promisify
const Log = require('../../lib/log')

const msg1 = Buffer.from('hello world hello world hello world')
const msg2 = Buffer.from('ola mundo ola mundo ola mundo')

test('Log overwrites', async (t) => {
  await t.test('Simple overwrite', async (t) => {
    const file = '/tmp/ppppp-db-log-test-overwrite.log'
    try {
      fs.unlinkSync(file)
    } catch (_) {}
    const log = Log(file, { blockSize: 2 * 1024 })

    const offset1 = await p(log.append)(msg1)
    assert.equal(offset1, 0)
    const offset2 = await p(log.append)(msg2)
    assert.ok(offset2 > offset1)

    const buf1 = await p(log._get)(offset1)
    assert.equal(buf1.toString(), msg1.toString())
    const buf2 = await p(log._get)(offset2)
    assert.equal(buf2.toString(), msg2.toString())

    await p(log.overwrite)(offset1, Buffer.from('hi world'))
    await p(log.onOverwritesFlushed)()
    const buf = await p(log._get)(offset1)
    assert.equal(buf.toString(), 'hi world')

    let arr = []
    await new Promise((resolve, reject) => {
      log.scan(
        (offset, data, size) => {
          arr.push(data.toString())
        },
        (err) => {
          if (err) reject(err)
          else resolve()
        }
      )
    })

    assert.deepEqual(arr, ['hi world', 'ola mundo ola mundo ola mundo'])

    await p(log.close)()
  })

  await t.test('Cannot overwrite larger data', async (t) => {
    const file = '/tmp/ppppp-db-log-test-overwrite-larger.log'
    try {
      fs.unlinkSync(file)
    } catch (_) {}
    const log = Log(file, { blockSize: 2 * 1024 })

    const offset1 = await p(log.append)(msg1)
    assert.equal(offset1, 0)
    const offset2 = await p(log.append)(msg2)
    assert.ok(offset2 > offset1)

    const buf1 = await p(log._get)(offset1)
    assert.equal(buf1.toString(), msg1.toString())
    const buf2 = await p(log._get)(offset2)
    assert.equal(buf2.toString(), msg2.toString())

    const promise = p(log.overwrite)(
      offset1,
      Buffer.from('hello world hello world hello world hello world')
    )
    await assert.rejects(promise, (err) => {
      assert.ok(err)
      assert.match(err.message, /should not be larger than existing data/)
      return true
    })

    await p(log.close)()
  })
})
