const test = require('node:test')
const assert = require('node:assert')
const p = require('node:util').promisify
const Log = require('../../lib/log')

test('Log compaction', async (t) => {
  await t.test('compact a log that does not have holes', async (t) => {
    const file = '/tmp/ppppp-db-log-compaction-test-' + Date.now() + '.log'
    const log = Log(file, { blockSize: 15 })

    const stats = await p(log.stats)()
    assert.equal(stats.totalBytes, 0, 'stats.totalBytes (1)')
    assert.equal(stats.deletedBytes, 0, 'stats.deletedBytes (1)')

    const buf1 = Buffer.from('first')
    const buf2 = Buffer.from('second')

    const offset1 = await p(log.append)(buf1)
    const offset2 = await p(log.append)(buf2)
    await p(log.onDrain)()
    assert('append two records')

    const stats2 = await p(log.stats)()
    assert.equal(stats2.totalBytes, 25, 'stats.totalBytes (2)')
    assert.equal(stats2.deletedBytes, 0, 'stats.deletedBytes (2)')

    const progressArr = []
    log.compactionProgress((stats) => {
      progressArr.push(stats)
    })

    await p(log.compact)()

    assert.deepEqual(
      progressArr,
      [
        { percent: 0, done: false },
        { percent: 1, done: true, sizeDiff: 0, holesFound: 0 },
      ],
      'progress events'
    )

    const stats3 = await p(log.stats)()
    assert.equal(stats3.totalBytes, 25, 'stats.totalBytes (3)')
    assert.equal(stats3.deletedBytes, 0, 'stats.deletedBytes (3)')

    await new Promise((resolve, reject) => {
      const arr = []
      log.scan(
        (offset, data, size) => {
          arr.push(data)
        },
        (err) => {
          if (err) return reject(err)
          assert.deepEqual(arr, [buf1, buf2], 'both records exist')
          resolve()
        }
      )
    })

    await p(log.close)()
  })

  await t.test('delete first record, compact, stream', async (t) => {
    const file = '/tmp/ppppp-db-log-compaction-test-' + Date.now() + '.log'
    const log = Log(file, { blockSize: 15 })

    const buf1 = Buffer.from('first')
    const buf2 = Buffer.from('second')

    const progressArr = []
    log.compactionProgress((stats) => {
      progressArr.push(stats)
    })

    const offset1 = await p(log.append)(buf1)
    const offset2 = await p(log.append)(buf2)
    await p(log.onDrain)()
    assert('append two records')

    const stats1 = await p(log.stats)()
    assert.equal(stats1.totalBytes, 25, 'stats.totalBytes before')
    assert.equal(stats1.deletedBytes, 0, 'stats.deletedBytes before')

    await p(log.del)(offset1)
    await p(log.onOverwritesFlushed)()
    assert('delete first record')

    await p(log.compact)()

    assert.deepEqual(
      progressArr,
      [
        { percent: 0, done: false },
        { percent: 1, done: true, sizeDiff: 15, holesFound: 1 },
      ],
      'progress events'
    )

    const stats2 = await p(log.stats)()
    assert.equal(stats2.totalBytes, 10, 'stats.totalBytes after')
    assert.equal(stats2.deletedBytes, 0, 'stats.deletedBytes after')

    await new Promise((resolve, reject) => {
      const arr = []
      log.scan(
        (offset, data, size) => {
          arr.push(data)
        },
        (err) => {
          if (err) return reject(err)
          assert.deepEqual(arr, [buf2], 'only second record exists')
          resolve()
        }
      )
    })

    await p(log.close)()
  })

  await t.test('delete last record, compact, stream', async (t) => {
    const file = '/tmp/ppppp-db-log-compaction-test-' + Date.now() + '.log'
    const log = Log(file, { blockSize: 15 })

    const buf1 = Buffer.from('first')
    const buf2 = Buffer.from('second')
    const buf3 = Buffer.from('third')

    const offset1 = await p(log.append)(buf1)
    const offset2 = await p(log.append)(buf2)
    const offset3 = await p(log.append)(buf3)
    await p(log.onDrain)()
    assert('append three records')

    await p(log.del)(offset3)
    await p(log.onOverwritesFlushed)()
    assert('delete third record')

    await new Promise((resolve, reject) => {
      const arr = []
      log.scan(
        (offset, data, size) => {
          arr.push(data)
        },
        (err) => {
          if (err) return reject(err)
          assert.deepEqual(arr, [buf1, buf2, null], 'all blocks')
          resolve()
        }
      )
    })

    await p(log.compact)()

    await new Promise((resolve, reject) => {
      const arr = []
      log.scan(
        (offset, data, size) => {
          arr.push(data)
        },
        (err) => {
          if (err) return reject(err)
          assert.deepEqual(arr, [buf1, buf2], 'last block truncated away')
          resolve()
        }
      )
    })

    await p(log.close)()
  })
})
