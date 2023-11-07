const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const p = require('node:util').promisify
const Log = require('../../lib/log')

const msg1 = Buffer.from(
  'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world'
)
const msg2 = Buffer.from(
  'hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db hello offset db'
)
const msg3 = Buffer.from(
  'hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db hello offsetty db'
)

test('Log performing simple delete', async (t) => {
  const file = '/tmp/ppppp-db-log-test-del.log'
  try {
    fs.unlinkSync(file)
  } catch (_) {}
  const log = Log(file, { blockSize: 2 * 1024 })

  const offset1 = await p(log.append)(msg1)
  assert.equal(offset1, 0)
  const offset2 = await p(log.append)(msg2)
  assert.ok(offset2 > offset1)
  const offset3 = await p(log.append)(msg3)
  assert.ok(offset3 > offset2)

  const buf1 = await p(log.get)(offset1)
  assert.equal(buf1.toString(), msg1.toString())
  const buf2 = await p(log.get)(offset2)
  assert.equal(buf2.toString(), msg2.toString())
  const buf3 = await p(log.get)(offset3)
  assert.equal(buf3.toString(), msg3.toString())

  await p(log.del)(offset2)
  await p(log.onDeletesFlushed)()
  await assert.rejects(p(log.get)(offset2), (err) => {
    assert.ok(err)
    assert.equal(err.message, 'Record has been deleted')
    assert.equal(err.code, 'ERR_AAOL_DELETED_RECORD')
    return true
  })

  await p(log.close)()
})

test('Log deleted records are not invalid upon re-opening', async (t) => {
  const file = '/tmp/ppppp-db-log-test-del-invalid.log'
  try {
    fs.unlinkSync(file)
  } catch (_) {}

  const opts = {
    blockSize: 2 * 1024,
    codec: {
      encode(msg) {
        return Buffer.from(JSON.stringify(msg), 'utf8')
      },
      decode(buf) {
        return JSON.parse(buf.toString('utf8'))
      },
    },
    validateRecord(buf) {
      try {
        JSON.parse(buf.toString('utf8'))
        return true
      } catch {
        return false
      }
    },
  }
  const log = Log(file, opts)

  const offset1 = await p(log.append)({ text: 'm0' })
  const offset2 = await p(log.append)({ text: 'm1' })
  const offset3 = await p(log.append)({ text: 'm2' })

  await p(log.del)(offset2)
  await p(log.onDeletesFlushed)()

  await p(log.close)()

  const log2 = Log(file, opts)

  let arr = []
  await new Promise((resolve) => {
    log2.scan(
      (offset, value, size) => {
        arr.push(value)
      },
      (err) => {
        assert.ifError(err)
        assert.deepEqual(arr, [{ text: 'm0' }, null, { text: 'm2' }])
        resolve()
      }
    )
  })

  await assert.rejects(p(log2.get)(offset2), (err) => {
    assert.ok(err)
    assert.equal(err.message, 'Record has been deleted')
    assert.equal(err.code, 'ERR_AAOL_DELETED_RECORD')
    return true
  })

  await p(log2.close)()
})

test('Log deletes are handled by scan()', async (t) => {
  const file = '/tmp/offset-test_' + Date.now() + '.log'
  const log = Log(file, { blockSize: 64 * 1024 })

  const buf1 = Buffer.from('hello one')
  const buf2 = Buffer.from('hello two')

  const offset1 = await p(log.append)(buf1)
  const offset2 = await p(log.append)(buf2)

  await p(log.del)(offset1)
  await p(log.onDrain)()
  await p(log.onDeletesFlushed)()

  const arr = []
  await new Promise((resolve) => {
    log.scan(
      (offset, rec, length) => {
        arr.push(rec)
      },
      (err) => {
        assert.ifError(err)
        resolve()
      }
    )
  })
  assert.deepEqual(arr, [null, buf2])

  await p(log.close)()
})

test('Log can handle many deleted records', { timeout: 60e3 }, async (t) => {
  const file = '/tmp/aaol-test-delete-many' + Date.now() + '.log'
  const log = Log(file, { blockSize: 64 * 1024 })

  const TOTAL = 100000
  const offsets = []
  const logAppend = p(log.append)
  if (process.env.VERBOSE) console.time('append ' + TOTAL)
  for (let i = 0; i < TOTAL; i += 1) {
    const offset = await logAppend(Buffer.from(`hello ${i}`))
    offsets.push(offset)
  }
  assert('appended records')
  if (process.env.VERBOSE) console.timeEnd('append ' + TOTAL)

  await p(log.onDrain)()

  const logDel = p(log.del)
  if (process.env.VERBOSE) console.time('delete ' + TOTAL / 2)
  for (let i = 0; i < TOTAL; i += 2) {
    await logDel(offsets[i])
  }
  if (process.env.VERBOSE) console.timeEnd('delete ' + TOTAL / 2)
  assert('deleted messages')

  await p(log.onDeletesFlushed)()

  await new Promise((resolve) => {
    let i = 0
    log.scan(
      (offset, rec, length) => {
        if (i % 2 === 0) {
          if (rec !== null) assert.fail('record ' + i + ' should be deleted')
        } else {
          if (rec === null) assert.fail('record ' + i + ' should be present')
        }
        i += 1
      },
      (err) => {
        assert.ifError(err)
        resolve()
      }
    )
  })

  await p(log.close)()
})
