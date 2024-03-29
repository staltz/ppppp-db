const fs = require('fs')
const b4a = require('b4a')
const p = require('promisify-tuple')
const AtomicFile = require('atomic-file-rw')
const mutexify = require('mutexify')
const Obz = require('obz') // @ts-ignore
const Cache = require('@alloc/quick-lru') // @ts-ignore
const RAF = require('polyraf') // @ts-ignore
const debounce = require('lodash.debounce') // @ts-ignore
const isBufferZero = require('is-buffer-zero') // @ts-ignore
const debug = require('debug')('ppppp-db:log')

const {
  deletedRecordErr,
  nanOffsetErr,
  negativeOffsetErr,
  outOfBoundsOffsetErr,
  appendLargerThanBlockErr,
  overwriteLargerThanOld,
  delDuringCompactErr,
} = require('./errors')
const Record = require('./record')

/**
 * @typedef {Buffer | Uint8Array} B4A
 * @typedef {number} BlockIndex
 */

/**
 * @template T
 * @typedef {import('mutexify').Mutexify<T>} Mutexify
 */

/**
 * @template T
 * @typedef {import('obz').Obz<T>} Obz
 */

/**
 * @template T
 * @typedef {{
 *   encode: (data: T) => B4A,
 *   decode: (data: B4A) => T
 * }} Codec
 */

/**
 * @template Type
 * @typedef {Type extends Codec<infer X> ? X : never} extractCodecType
 */

/**
 * @template T
 * @typedef {{
 *   blockSize?: number,
 *   codec?: Codec<T>,
 *   writeTimeout?: number,
 *   validateRecord?: (data: B4A) => boolean
 * }} Options
 */

/**
 * @template T
 * @typedef {T extends void ?
 *   (...args: [NodeJS.ErrnoException] | []) => void :
 *   (...args: [NodeJS.ErrnoException] | [null, T]) => void
 * } CB
 */

/**
 * @param {unknown} check
 * @param {string} message
 * @returns {asserts check}
 */
function assert(check, message) {
  if (!check) throw new Error(message)
}

const DEFAULT_BLOCK_SIZE = 65536
const DEFAULT_WRITE_TIMEOUT = 250
const DEFAULT_VALIDATE = () => true

const COMPACTION_PROGRESS_START = { percent: 0, done: false }
const COMPACTION_PROGRESS_END_EMPTY = {
  percent: 1,
  done: true,
  sizeDiff: 0,
  holesFound: 0,
}
const COMPACTION_PROGRESS_EMIT_INTERVAL = 500

/**
 * @template [T=B4A]
 * @param {string} filename
 * @param {Options<T>} opts
 */
function Log(filename, opts) {
  const DEFAULT_CODEC = /** @type {Codec<T>} */ (
    /** @type {any} */ ({
      encode: (/** @type {any} */ x) => x,
      decode: (/** @type {any} */ x) => x,
    })
  )

  const cache = new Cache({ maxSize: 1024 }) // This is potentially 64 MiB!
  let raf = RAF(filename)
  const statsFilename = filename + 'stats.json'
  const blockSize = opts?.blockSize ?? DEFAULT_BLOCK_SIZE
  const codec = opts?.codec ?? DEFAULT_CODEC
  const writeTimeout = opts?.writeTimeout ?? DEFAULT_WRITE_TIMEOUT
  const validateRecord = opts?.validateRecord ?? DEFAULT_VALIDATE

  /**
   * @type {Array<CallableFunction>}
   */
  const waitingLoad = []

  /** @type {Map<BlockIndex, Array<CallableFunction>>} */
  const waitingDrain = new Map() // blockIndex -> []
  /** @type {Array<CB<any>>} */
  const waitingFlushOverwrites = []
  /** @type {Map<BlockIndex, {blockBuf: B4A; offset: number}>} */
  const blocksToBeWritten = new Map() // blockIndex -> { blockBuf, offset }
  /** @type {Map<BlockIndex, B4A>} */
  const blocksWithOverwritables = new Map() // blockIndex -> blockBuf
  let flushingOverwrites = false
  let writingBlockIndex = -1

  let latestBlockBuf = /** @type {B4A | null} */ (null)
  let latestBlockIndex = /** @type {number | null} */ (null)
  let nextOffsetInBlock = /** @type {number | null} */ (null)
  let deletedBytes = 0
  /** Offset of last written record @type {Obz<number>} */
  const lastRecOffset = Obz()

  let compacting = false
  const compactionProgress = Obz()
  compactionProgress.set(COMPACTION_PROGRESS_START)
  /** @type {Array<CB<any>>} */
  const waitingCompaction = []

  AtomicFile.readFile(statsFilename, 'utf8', function onStatsLoaded(err, json) {
    if (err) {
      // prettier-ignore
      if (err.code !== 'ENOENT') debug('Failed loading stats file: %s', err.message)
      deletedBytes = 0
    } else {
      try {
        const stats = JSON.parse(json)
        deletedBytes = stats.deletedBytes
      } catch (err) {
        // prettier-ignore
        debug('Failed parsing stats file: %s', /** @type {Error} */ (err).message)
        deletedBytes = 0
      }
    }

    raf.stat(
      /** @type {CB<{size: number}>} */ function onRAFStatDone(err, stat) {
        // prettier-ignore
        if (err && err.code !== 'ENOENT') debug('Failed to read %s stats: %s', filename, err.message)

        const fileSize = stat ? stat.size : -1

        if (fileSize <= 0) {
          debug('Opened log file, which is empty')
          latestBlockBuf = b4a.alloc(blockSize)
          latestBlockIndex = 0
          nextOffsetInBlock = 0
          cache.set(0, latestBlockBuf)
          lastRecOffset.set(-1)
          // @ts-ignore
          while (waitingLoad.length) waitingLoad.shift()()
        } else {
          const blockStart = fileSize - blockSize
          loadLatestBlock(blockStart, function onLoadedLatestBlock(err) {
            if (err) throw err
            // prettier-ignore
            debug('Opened log file, last record is at log offset %d, block %d', lastRecOffset.value, latestBlockIndex)
            // @ts-ignore
            while (waitingLoad.length) waitingLoad.shift()()
          })
        }
      }
    )
  })

  /**
   * @param {number} blockStart
   * @param {CB<void>} cb
   */
  function loadLatestBlock(blockStart, cb) {
    raf.read(
      blockStart,
      blockSize,
      /** @type {CB<B4A>} */
      (
        function onRAFReadLastDone(err, blockBuf) {
          if (err) return cb(err)
          getLastGoodRecord(
            blockBuf,
            blockStart,
            function gotLastGoodRecord(err, offsetInBlock) {
              if (err) return cb(err)
              latestBlockBuf = blockBuf
              latestBlockIndex = blockStart / blockSize
              const recSize = Record.readSize(blockBuf, offsetInBlock)
              nextOffsetInBlock = offsetInBlock + recSize
              lastRecOffset.set(blockStart + offsetInBlock)
              cb()
            }
          )
        }
      )
    )
  }

  /**
   * @param {number} offset
   */
  function getOffsetInBlock(offset) {
    return offset % blockSize
  }

  /**
   * @param {number} offset
   */
  function getBlockStart(offset) {
    return offset - getOffsetInBlock(offset)
  }

  /**
   * @param {number} offset
   */
  function getNextBlockStart(offset) {
    return getBlockStart(offset) + blockSize
  }

  /**
   * @param {number} offset
   */
  function getBlockIndex(offset) {
    return getBlockStart(offset) / blockSize
  }

  /** @type {Mutexify<any>} */
  const writeLock = mutexify()

  /**
   * @template T
   * @param {number} blockStart
   * @param {B4A | undefined} blockBuf
   * @param {T} successValue
   * @param {CB<T>} cb
   */
  function writeWithFSync(blockStart, blockBuf, successValue, cb) {
    writeLock(function onWriteLockReleased(unlock) {
      raf.write(
        blockStart,
        blockBuf,
        function onRAFWriteDone(/** @type {Error | null} */ err) {
          if (err) return unlock(cb, err)

          if (raf.fd) {
            fs.fsync(raf.fd, function onFSyncDone(err) {
              if (err) unlock(cb, err)
              else unlock(cb, null, successValue)
            })
          } else unlock(cb, null, successValue)
        }
      )
    })
  }

  /**
   * @param {B4A} blockBuf
   * @param {number} badOffsetInBlock
   * @param {number} blockStart
   * @param {number} successValue
   * @param {CB<number>} cb
   */
  function fixBlock(blockBuf, badOffsetInBlock, blockStart, successValue, cb) {
    // prettier-ignore
    debug('Fixing a block with an invalid record at block offset %d', badOffsetInBlock)
    blockBuf.fill(0, badOffsetInBlock, blockSize)
    writeWithFSync(blockStart, blockBuf, successValue, cb)
  }

  /**
   * @param {B4A} blockBuf
   * @param {number} blockStart
   * @param {CB<number>} cb
   */
  function getLastGoodRecord(blockBuf, blockStart, cb) {
    let lastGoodOffset = 0
    for (let offsetInRec = 0; offsetInRec < blockSize; ) {
      if (Record.isEOB(blockBuf, offsetInRec)) break
      const [dataBuf, recSize, dataLength] = Record.read(blockBuf, offsetInRec)
      const isLengthCorrupt = offsetInRec + recSize > blockSize
      const isDataCorrupt = dataLength > 0 && !validateRecord(dataBuf)
      if (isLengthCorrupt || isDataCorrupt) {
        fixBlock(blockBuf, offsetInRec, blockStart, lastGoodOffset, cb)
        return
      }
      lastGoodOffset = offsetInRec
      offsetInRec += recSize
    }

    cb(null, lastGoodOffset)
  }

  /**
   * @param {number} offset
   * @param {CB<B4A>} cb
   */
  function getBlock(offset, cb) {
    const blockIndex = getBlockIndex(offset)

    if (cache.has(blockIndex)) {
      debug('Reading block %d at log offset %d from cache', blockIndex, offset)
      const cachedBlockBuf = cache.get(blockIndex)
      cb(null, cachedBlockBuf)
    } else {
      debug('Reading block %d at log offset %d from disc', blockIndex, offset)
      const blockStart = getBlockStart(offset)
      raf.read(
        blockStart,
        blockSize,
        /** @type {CB<B4A>} */
        (
          function onRAFReadDone(err, blockBuf) {
            if (err) return cb(err)
            cache.set(blockIndex, blockBuf)
            cb(null, blockBuf)
          }
        )
      )
    }
  }

  /**
   * @param {number} offset
   * @param {CB<extractCodecType<typeof codec>>} cb
   */
  function get(offset, cb) {
    assert(typeof latestBlockIndex === 'number', 'latestBlockIndex not set')
    assert(typeof nextOffsetInBlock === 'number', 'nextOffsetInBlock not set')
    const logSize = latestBlockIndex * blockSize + nextOffsetInBlock
    if (typeof offset !== 'number') return cb(nanOffsetErr(offset))
    if (isNaN(offset)) return cb(nanOffsetErr(offset))
    if (offset < 0) return cb(negativeOffsetErr(offset))
    if (offset >= logSize) return cb(outOfBoundsOffsetErr(offset, logSize))

    getBlock(offset, function gotBlock(err, blockBuf) {
      if (err) return cb(err)
      const offsetInBlock = getOffsetInBlock(offset)
      const [dataBuf, _recSize, dataLength, emptyLength] = Record.read(
        blockBuf,
        offsetInBlock
      )
      if (dataLength === 0 && emptyLength > 0) return cb(deletedRecordErr())
      // @ts-ignore
      cb(null, codec.decode(dataBuf))
    })
  }

  /**
   * Returns [nextOffset, decodedRecord, recordSize] where nextOffset can take 3
   * forms:
   * * `-1`: end of log
   * * `0`: need a new block
   * * `>0`: next record within block
   * @param {Buffer} blockBuf
   * @param {number} offset
   * @param {boolean} asRaw
   * @return {[number, extractCodecType<typeof codec> | B4A | null, number]}
   */
  function getDataNextOffset(blockBuf, offset, asRaw = false) {
    const offsetInBlock = getOffsetInBlock(offset)
    const [dataBuf, recSize, dataLength, emptyLength] = Record.read(
      blockBuf,
      offsetInBlock
    )
    const nextOffsetInBlock = offsetInBlock + recSize

    let nextOffset
    if (Record.isEOB(blockBuf, nextOffsetInBlock)) {
      if (getNextBlockStart(offset) > lastRecOffset.value) nextOffset = -1
      else nextOffset = 0
    } else {
      nextOffset = offset + recSize
    }

    if (dataLength === 0 && emptyLength > 0) return [nextOffset, null, recSize]
    else return [nextOffset, asRaw ? dataBuf : codec.decode(dataBuf), recSize]
  }

  /**
   * @param {(offset: number, data: extractCodecType<typeof codec> | null, size: number) => Promise<void> | void} onNext
   * @param {(error?: Error) => void} onDone
   * @param {boolean} asRaw
   */
  function scan(onNext, onDone, asRaw = false) {
    let cursor = 0
    const gotNextBlock =
      /** @type {CB<B4A>} */
      (
        async (err, blockBuf) => {
          if (err) return onDone(err)
          if (isBufferZero(blockBuf)) return onDone()
          while (true) {
            const [offset, data, size] = getDataNextOffset(
              blockBuf,
              cursor,
              asRaw
            )
            // @ts-ignore
            const promise = onNext(cursor, data, size)
            if (promise) await promise
            if (offset === 0) {
              cursor = getNextBlockStart(cursor)
              getNextBlock()
              return
            } else if (offset === -1) {
              onDone()
              return
            } else {
              cursor = offset
            }
          }
        }
      )
    function getNextBlock() {
      setTimeout(getBlock, 0, cursor, gotNextBlock)
    }
    getNextBlock()
  }

  /**
   * @param {number} offset
   * @param {CB<void>} cb
   */
  function del(offset, cb) {
    if (compacting) {
      cb(delDuringCompactErr())
      return
    }
    const blockIndex = getBlockIndex(offset)
    if (blocksToBeWritten.has(blockIndex)) {
      onDrain(function delAfterDrained() {
        del(offset, cb)
      })
      return
    }

    const gotBlockForDelete = /** @type {CB<B4A>} */ (
      (err, blockBuf) => {
        if (err) return cb(err)
        assert(blockBuf, 'blockBuf should be defined in gotBlockForDelete')
        const blockBufNow = blocksWithOverwritables.get(blockIndex) ?? blockBuf
        const offsetInBlock = getOffsetInBlock(offset)
        Record.overwriteAsEmpty(blockBufNow, offsetInBlock)
        deletedBytes += Record.readSize(blockBufNow, offsetInBlock)
        blocksWithOverwritables.set(blockIndex, blockBufNow)
        scheduleFlushOverwrites()
        // prettier-ignore
        debug('Deleted record at log offset %d, block %d, block offset %d', offset, blockIndex, offsetInBlock)
        cb()
      }
    )

    if (blocksWithOverwritables.has(blockIndex)) {
      const blockBuf = /** @type {any} */ (
        blocksWithOverwritables.get(blockIndex)
      )
      gotBlockForDelete(null, blockBuf)
    } else {
      getBlock(offset, gotBlockForDelete)
    }
  }

  /**
   * @param {Uint8Array} dataBuf
   * @param {number} offsetInBlock
   */
  function hasNoSpaceFor(dataBuf, offsetInBlock) {
    return offsetInBlock + Record.size(dataBuf) + Record.EOB_SIZE > blockSize
  }

  const scheduleFlushOverwrites = debounce(flushOverwrites, writeTimeout)

  function flushOverwrites() {
    if (blocksWithOverwritables.size === 0) {
      for (const cb of waitingFlushOverwrites) cb()
      waitingFlushOverwrites.length = 0
      return
    }
    const blockIndex = blocksWithOverwritables.keys().next().value
    const blockStart = blockIndex * blockSize
    const blockBuf = blocksWithOverwritables.get(blockIndex)
    blocksWithOverwritables.delete(blockIndex)
    flushingOverwrites = true

    writeWithFSync(
      blockStart,
      blockBuf,
      null,
      function flushedOverwrites(err, _) {
        if (err) debug('Failed to flush overwrites with fsync: %s', err.message)
        saveStats(function onSavedStats(err, _) {
          // prettier-ignore
          if (err) debug('Failed to save stats file after flugshing overwrites: %s', err.message)
          flushingOverwrites = false
          if (err) {
            for (const cb of waitingFlushOverwrites) cb(err)
            waitingFlushOverwrites.length = 0
            return
          }
          flushOverwrites() // next
        })
      }
    )
  }

  /**
   * @param {CB<void>} cb
   */
  function onOverwritesFlushed(cb) {
    if (flushingOverwrites || blocksWithOverwritables.size > 0) {
      waitingFlushOverwrites.push(cb)
    } else cb()
  }

  /**
   * @param {extractCodecType<typeof codec>} data
   * @returns {number}
   */
  function appendSingle(data) {
    let encodedData = codec.encode(data)
    if (typeof encodedData === 'string') encodedData = b4a.from(encodedData)

    if (Record.size(encodedData) + Record.EOB_SIZE > blockSize) {
      throw appendLargerThanBlockErr()
    }

    assert(typeof latestBlockIndex === 'number', 'latestBlockIndex not set')
    assert(typeof nextOffsetInBlock === 'number', 'nextOffsetInBlock not set')
    if (hasNoSpaceFor(encodedData, nextOffsetInBlock)) {
      const nextBlockBuf = b4a.alloc(blockSize)
      latestBlockBuf = nextBlockBuf
      latestBlockIndex += 1
      nextOffsetInBlock = 0
      // prettier-ignore
      debug('Block %d created at log offset %d to fit new record', latestBlockIndex, latestBlockIndex * blockSize)
    }

    // prettier-ignore
    debug('Appending record at log offset %d, blockIndex %d, block offset %d', latestBlockIndex * blockSize + nextOffsetInBlock, latestBlockIndex, nextOffsetInBlock)
    assert(latestBlockBuf, 'latestBlockBuf not set')
    Record.write(latestBlockBuf, nextOffsetInBlock, encodedData)
    cache.set(latestBlockIndex, latestBlockBuf) // update cache
    const offset = latestBlockIndex * blockSize + nextOffsetInBlock
    blocksToBeWritten.set(latestBlockIndex, {
      blockBuf: latestBlockBuf,
      offset,
    })
    nextOffsetInBlock += Record.size(encodedData)
    scheduleWrite()
    return offset
  }

  /**
   * @param {extractCodecType<typeof codec>} data
   * @param {CB<number>} cb
   */
  function append(data, cb) {
    if (compacting) {
      waitingCompaction.push(() => append(data, cb))
      return
    }

    let offset
    try {
      offset = appendSingle(data)
    } catch (err) {
      return cb(/** @type {any} */ (err))
    }
    cb(null, offset)
  }

  const scheduleWrite = debounce(write, writeTimeout)

  function write() {
    if (blocksToBeWritten.size === 0) return
    const blockIndex = blocksToBeWritten.keys().next().value
    const blockStart = blockIndex * blockSize
    const { blockBuf, offset } =
      /** @type {{ blockBuf: B4A, offset: number }} */ (
        blocksToBeWritten.get(blockIndex)
      )
    blocksToBeWritten.delete(blockIndex)

    // prettier-ignore
    debug('Writing block %d of size %d at log offset %d', blockIndex, blockBuf.length, blockStart)
    writingBlockIndex = blockIndex
    writeWithFSync(blockStart, blockBuf, null, function onBlockWritten(err, _) {
      const drainsBefore = (waitingDrain.get(blockIndex) || []).slice(0)
      writingBlockIndex = -1
      if (err) {
        // prettier-ignore
        debug('Failed to write block %d at log offset %d', blockIndex, blockStart)
        throw err
      } else {
        lastRecOffset.set(offset)

        // prettier-ignore
        if (drainsBefore.length > 0) debug('Draining the waiting queue (%d functions) for block %d at log offset %d', drainsBefore.length, blockIndex, blockStart)
        for (let i = 0; i < drainsBefore.length; ++i) drainsBefore[i]()

        // the resumed streams might have added more to waiting
        let drainsAfter = waitingDrain.get(blockIndex) || []
        if (drainsBefore.length === drainsAfter.length) {
          waitingDrain.delete(blockIndex)
        } else if (drainsAfter.length === 0) {
          waitingDrain.delete(blockIndex)
        } else {
          waitingDrain.set(
            blockIndex,
            // @ts-ignore
            waitingDrain.get(blockIndex).slice(drainsBefore.length)
          )
        }

        write() // next!
      }
    })
  }

  /**
   * @param {number} offset
   * @param {extractCodecType<typeof codec>} data
   * @param {CB<void>} cb
   */
  function overwrite(offset, data, cb) {
    if (compacting) {
      waitingCompaction.push(() => overwrite(offset, data, cb))
      return
    }

    let encodedData = codec.encode(data)
    if (typeof encodedData === 'string') encodedData = b4a.from(encodedData)

    assert(typeof latestBlockIndex === 'number', 'latestBlockIndex not set')
    assert(typeof nextOffsetInBlock === 'number', 'nextOffsetInBlock not set')
    const logSize = latestBlockIndex * blockSize + nextOffsetInBlock
    const blockIndex = getBlockIndex(offset)
    if (typeof offset !== 'number') return cb(nanOffsetErr(offset))
    if (isNaN(offset)) return cb(nanOffsetErr(offset))
    if (offset < 0) return cb(negativeOffsetErr(offset))
    if (offset >= logSize) return cb(outOfBoundsOffsetErr(offset, logSize))

    // Get the existing record at offset
    getBlock(offset, function gotBlock(err, blockBuf) {
      if (err) return cb(err)
      const blockBufNow = blocksWithOverwritables.get(blockIndex) ?? blockBuf
      const offsetInBlock = getOffsetInBlock(offset)
      const oldDataLength = Record.readDataLength(blockBufNow, offsetInBlock)
      const oldEmptyLength = Record.readEmptyLength(blockBufNow, offsetInBlock)
      // Make sure encodedData fits inside existing record
      if (encodedData.length > oldDataLength + oldEmptyLength) {
        return cb(overwriteLargerThanOld())
      }
      const newEmptyLength = oldDataLength - encodedData.length
      deletedBytes += newEmptyLength
      // write
      Record.write(blockBufNow, offsetInBlock, encodedData, newEmptyLength)
      blocksWithOverwritables.set(blockIndex, blockBufNow)
      scheduleFlushOverwrites()
      // prettier-ignore
      debug('Overwrote record at log offset %d, block %d, block offset %d', offset, blockIndex, offsetInBlock)
      cb()
    })
  }

  function getTotalBytes() {
    assert(typeof latestBlockIndex === 'number', 'latestBlockIndex not set')
    assert(typeof nextOffsetInBlock === 'number', 'nextOffsetInBlock not set')
    return latestBlockIndex * blockSize + nextOffsetInBlock
  }

  /**
   * @param {CB<{ totalBytes: number; deletedBytes: number }>} cb
   */
  function stats(cb) {
    onLoad(() => {
      cb(null, {
        totalBytes: getTotalBytes(),
        deletedBytes,
      })
    })()
  }

  /**
   * @param {CB<void>} cb
   */
  function saveStats(cb) {
    const stats = JSON.stringify({ deletedBytes })
    AtomicFile.writeFile(statsFilename, stats, 'utf8', (err, _) => {
      if (err) return cb(new Error('Failed to save stats file', { cause: err }))
      cb()
    })
  }

  /** @type {CB<void>} */
  function logError(err) {
    if (err) console.error(err)
  }

  /**
   * Compaction is the process of removing deleted records from the log by
   * creating a new log with only the undeleted records, and then atomically
   * swapping the new log for the old one.
   * @param {CB<void>?} cb
   */
  async function compact(cb) {
    cb ??= logError
    const debug2 = debug.extend('compact')
    if (deletedBytes === 0) {
      debug2('Skipping compaction since there are no deleted bytes')
      compactionProgress.set(COMPACTION_PROGRESS_END_EMPTY)
      return cb()
    }
    await p(onDrain)()
    const [err1] = await p(onOverwritesFlushed)()
    if (err1) {
      // prettier-ignore
      return cb(new Error('Compact failed to pre-flush overwrites', { cause: err1 }))
    }
    if (compacting) {
      if (cb) waitingCompaction.push(cb)
      return
    }
    compacting = true

    const startCompactTimestamp = Date.now()
    if (compactionProgress.value.done) {
      compactionProgress.set(COMPACTION_PROGRESS_START)
    }

    const filenameNew = filename + '.compacting'
    const [err2] = await p(fs.unlink.bind(fs))(filenameNew)
    if (err2 && err2.code !== 'ENOENT') {
      compacting = false
      // prettier-ignore
      return cb(new Error('Compact failed to get rid of previous compacting log', { cause: err2 }))
    }

    const rafNew = RAF(filenameNew)

    /**
     * @param {number} blockIndex
     * @param {B4A} blockBuf
     * @returns {Promise<void>}
     */
    function writeBlock(blockIndex, blockBuf) {
      const blockStart = blockIndex * blockSize
      // prettier-ignore
      debug2('Writing block %d of size %d at log offset %d', blockIndex, blockBuf.length, blockStart)
      return new Promise((resolve, reject) => {
        rafNew.write(
          blockStart,
          blockBuf,
          /** @type {CB<void>} */
          function onCompactRAFWriteDone(err) {
            if (err) return reject(err)
            if (rafNew.fd) {
              fs.fsync(rafNew.fd, function onCompactFSyncDone(err) {
                if (err) reject(err)
                else resolve()
              })
            } else resolve()
          }
        )
      })
    }

    // Scan the old log and write blocks on the new log
    const oldTotalBytes = getTotalBytes()
    const oldLastRecOffset = lastRecOffset.value
    let latestBlockBufNew = b4a.alloc(blockSize)
    let latestBlockIndexNew = 0
    let nextOffsetInBlockNew = 0
    let holesFound = 0
    let timestampLastEmit = Date.now()
    const err3 = await new Promise((done) => {
      scan(
        function compactScanningRecord(oldRecOffset, data, size) {
          const now = Date.now()
          if (now - timestampLastEmit > COMPACTION_PROGRESS_EMIT_INTERVAL) {
            timestampLastEmit = now
            const percent = oldRecOffset / oldLastRecOffset
            compactionProgress.set({ percent, done: false })
          }
          if (!data) {
            holesFound += 1
            return
          }
          const dataBuf = /** @type {B4A} */ (/** @type {any} */ (data))
          /** @type {Promise<void> | undefined} */
          let promiseWriteBlock = void 0

          if (hasNoSpaceFor(dataBuf, nextOffsetInBlockNew)) {
            promiseWriteBlock = writeBlock(
              latestBlockIndexNew,
              latestBlockBufNew
            )
            latestBlockBufNew = b4a.alloc(blockSize)
            latestBlockIndexNew += 1
            nextOffsetInBlockNew = 0
            // prettier-ignore
            debug2('Block %d created for log offset %d to fit new record', latestBlockIndexNew, latestBlockIndexNew * blockSize)
          }

          Record.write(latestBlockBufNew, nextOffsetInBlockNew, dataBuf)
          // prettier-ignore
          debug2('Record copied into log offset %d, block %d, block offset %d', latestBlockIndexNew * blockSize + nextOffsetInBlockNew, latestBlockIndexNew, nextOffsetInBlockNew)
          nextOffsetInBlockNew += Record.size(dataBuf)
          return promiseWriteBlock
        },
        done,
        true
      )
    })
    if (err3) {
      await p(rafNew.close.bind(rafNew))()
      compacting = false
      // prettier-ignore
      return cb(new Error('Compact failed while scanning-sifting the old log', { cause: err3 }))
    }
    await writeBlock(latestBlockIndexNew, latestBlockBufNew)

    // Swap the new log for the old one
    const [[err4], [err5]] = await Promise.all([
      p(raf.close.bind(raf))(),
      p(rafNew.close.bind(rafNew))(),
    ])
    if (err4 ?? err5) {
      compacting = false
      // prettier-ignore
      return cb(new Error('Compact failed to close log files', { cause: err4 ?? err5 }))
    }
    const [err6] = await p(fs.rename.bind(fs))(filenameNew, filename)
    if (err6) {
      compacting = false
      // prettier-ignore
      return cb(new Error('Compact failed to replace old log with new', { cause: err6 }))
    }
    raf = RAF(filename)
    latestBlockBuf = latestBlockBufNew
    latestBlockIndex = latestBlockIndexNew
    nextOffsetInBlock = nextOffsetInBlockNew
    cache.clear()
    const nextSince = latestBlockIndex * blockSize + nextOffsetInBlock
    const sizeDiff = oldTotalBytes - getTotalBytes()
    lastRecOffset.set(nextSince)
    const duration = Date.now() - startCompactTimestamp
    debug2('Completed in %d ms', duration)
    deletedBytes = 0
    const [err7] = await p(saveStats)()
    if (err7) {
      compacting = false
      return cb(new Error('Compact failed to save stats file', { cause: err7 }))
    }
    compactionProgress.set({ percent: 1, done: true, sizeDiff, holesFound })
    compacting = false
    for (const callback of waitingCompaction) callback()
    waitingCompaction.length = 0
    cb()
  }

  /**
   * @param {CB<unknown>} cb
   */
  function close(cb) {
    onDrain(function closeAfterHavingDrained() {
      onOverwritesFlushed(function closeAfterOverwritesFlushed() {
        raf.close(cb)
      })
    })
  }

  /**
   * @template T
   * @param {T} fn
   * @returns {T}
   */
  function onLoad(fn) {
    const fun = /** @type {(this: null | void, ...args: Array<any> )=>void} */ (
      fn
    )
    return /** @type {any} */ (
      function waitForLogLoaded(/** @type {any[]} */ ...args) {
        if (latestBlockBuf === null) waitingLoad.push(fun.bind(null, ...args))
        else fun(...args)
      }
    )
  }

  /**
   * @param {() => void} fn
   */
  function onDrain(fn) {
    if (compacting) {
      waitingCompaction.push(fn)
      return
    }
    if (blocksToBeWritten.size === 0 && writingBlockIndex === -1) fn()
    else {
      const latestBlockIndex = /** @type {number} */ (
        blocksToBeWritten.size > 0
          ? last(blocksToBeWritten.keys())
          : writingBlockIndex
      )
      const drains = waitingDrain.get(latestBlockIndex) || []
      drains.push(fn)
      waitingDrain.set(latestBlockIndex, drains)
    }
  }

  /**
   * @param {IterableIterator<number>} iterable
   */
  function last(iterable) {
    let res = null
    for (let x of iterable) res = x
    return res
  }

  return {
    // Public API:
    scan: onLoad(scan),
    del: onLoad(del),
    append: onLoad(append),
    overwrite: onLoad(overwrite),
    close: onLoad(close),
    onDrain: onLoad(onDrain),
    onOverwritesFlushed: onLoad(onOverwritesFlushed),
    compact: onLoad(compact),
    compactionProgress,
    lastRecOffset,
    stats,

    // Useful for tests
    _get: onLoad(get),
  }
}

module.exports = Log
