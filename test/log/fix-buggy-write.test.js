const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const p = require('node:util').promisify
const Log = require('../../lib/log')

var file = '/tmp/ds-test_restart.log'

var msg1 = { text: 'hello world hello world' }
var msg2 = { text: 'hello world hello world 2' }

test('Log fix buggy write', async (t) => {
  await t.test('Simple', async (t) => {
    try {
      fs.unlinkSync(file)
    } catch (_) {}
    const log = Log(file, {
      block: 16 * 1024,
      codec: require('flumecodec/json'),
    })

    const offset1 = await p(log.append)(msg1)
    assert.equal(offset1, 0)
    const offset2 = await p(log.append)(msg2)
    assert.equal(offset2, 36)

    await p(log.onDrain)()
    let arr = []
    await new Promise((resolve) => {
      log.scan(
        (offset, msg, size) => {
          arr.push(msg)
        },
        (err) => {
          assert.ifError(err)
          resolve()
        }
      )
    })
    assert.deepEqual(arr, [msg1, msg2])

    await p(log.close)()
  })

  await t.test('Re-read', async (t) => {
    const log = Log(file, {
      block: 16 * 1024,
      codec: require('flumecodec/json'),
    })

    await p(log.onDrain)()
    let arr = []
    await new Promise((resolve) => {
      log.scan(
        (offset, msg, size) => {
          arr.push(msg)
        },
        (err) => {
          assert.ifError(err)
          resolve()
        }
      )
    })
    assert.deepEqual(arr, [msg1, msg2])

    await p(log.close)()
  })
})
