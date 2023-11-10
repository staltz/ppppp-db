const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const p = require('node:util').promisify
const RAF = require('polyraf')
const Log = require('../../lib/log')

function encode(json) {
  if (Buffer.isBuffer(json)) return json
  return Buffer.from(JSON.stringify(json), 'utf8')
}

function decode(buf) {
  return JSON.parse(buf.toString('utf8'))
}

test('Log handles corrupted records', async (t) => {
  const file = '/tmp/ppppp-db-log-corrupt-records.log'

  await t.test('Simulate corruption', async (t) => {
    try {
      fs.unlinkSync(file)
    } catch (_) {}
    const log = Log(file, {
      blockSize: 64 * 1024,
      codec: { encode, decode },
    })

    const msg1 = encode({ text: 'testing' })
    const msg2 = encode({ bool: true, test: 'x' })
    msg2[0] = 0x00

    await p(log.append)(msg1)
    await p(log.append)(msg2)

    await p(log.onDrain)()
  })

  await test('Re-read without validation', async (t) => {
    const log = Log(file, { blockSize: 64 * 1024 })

    await p(log.onDrain)()

    const arr = []
    await new Promise((resolve, reject) => {
      log.scan(
        (offset, rec, size) => {
          arr.push(rec)
        },
        (err) => {
          if (err) reject(err)
          else resolve()
        }
      )
    })
    // Because these are just buffers we won't see the corruption
    assert.equal(arr.length, 2)

    await p(log.close)()
  })

  await test('Re-read with validation', async (t) => {
    const log = Log(file, {
      blockSize: 64 * 1024,
      validateRecord(buf) {
        try {
          decode(buf)
          return true
        } catch {
          return false
        }
      },
    })

    await p(log.onDrain)()

    const arr = []
    await new Promise((resolve, reject) => {
      log.scan(
        (offset, rec, size) => {
          arr.push(rec)
        },
        (err) => {
          if (err) reject(err)
          else resolve()
        }
      )
    })
    assert.equal(arr.length, 1)

    await p(log.close)()
  })
})

test('Log handles corrupted length', async (t) => {
  const file = '/tmp/ppppp-db-log-corrupt-length.log'

  await t.test('Simulate length corruption', async (t) => {
    try {
      fs.unlinkSync(file)
    } catch (_) {}

    const raf = RAF(file)
    let block = Buffer.alloc(64 * 1024)

    const msg1 = encode({ text: 'testing' })
    const msg2 = encode({ bool: true, test: 'testing2' })

    block.writeUInt16LE(msg1.length, 0)
    msg1.copy(block, 4)
    block.writeUInt16LE(65534, 4 + msg1.length) // corrupt!
    msg2.copy(block, 4 + msg1.length + 4)

    await p(raf.write.bind(raf))(0, block)

    await p(raf.close.bind(raf))()
  })

  await t.test('Re-read without validation', async (t) => {
    const log = Log(file, { blockSize: 64 * 1024 })

    await p(log.onDrain)()

    const arr = []
    await new Promise((resolve, reject) => {
      log.scan(
        (offset, rec, size) => {
          arr.push(rec)
        },
        (err) => {
          if (err) reject(err)
          else resolve()
        }
      )
    })
    assert.equal(arr.length, 1)

    const msg = encode({ bool: true, test: 'testing2' })
    await p(log.append)(msg)

    await p(log.close)()
  })

  await t.test('Re-read with validation', async (t) => {
    const log = Log(file, {
      blockSize: 64 * 1024,
      validateRecord: (d) => {
        try {
          decode(d)
          return true
        } catch (ex) {
          return false
        }
      },
    })

    await p(log.onDrain)()

    const arr = []
    await new Promise((resolve, reject) => {
      log.scan(
        (offset, rec, size) => {
          arr.push(rec)
        },
        (err) => {
          if (err) reject(err)
          else resolve()
        }
      )
    })
    assert.equal(arr.length, 2)

    await p(log.close)()
  })
})
