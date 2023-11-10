const fs = require('fs')
const b4a = require('b4a')
const Cache = require('@alloc/quick-lru') // @ts-ignore
const RAF = require('polyraf') // @ts-ignore
const Obv = require('obz') // @ts-ignore
const AtomicFile = require('atomic-file-rw') // @ts-ignore
const debounce = require('lodash.debounce') // @ts-ignore
const isBufferZero = require('is-buffer-zero') // @ts-ignore
const debug = require('debug')('log') // @ts-ignore
const mutexify = require('mutexify')

const {
  deletedRecordErr,
  nanOffsetErr,
  negativeOffsetErr,
  outOfBoundsOffsetErr,
  // delDuringCompactErr,
  appendLargerThanBlockErr,
  unexpectedTruncationErr,
  overwriteLargerThanOld,
  // compactWithMaxLiveStreamErr,
} = require('./errors')
const Record = require('./record')
// const Compaction = require('./compaction') // FIXME:

/**
 * @typedef {Buffer | Uint8Array} B4A
 * @typedef {number} BlockIndex
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
 *   (...args: [Error] | []) => void :
 *   (...args: [Error] | [null, T]) => void
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

// const COMPACTION_PROGRESS_EMIT_INTERVAL = 1000 // FIXME:

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
  const raf = RAF(filename)
  const statsFilename = filename + '.stats'
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
  const since = Obv() // offset of last written record
  // let compaction = null // FIXME:
  // const compactionProgress = Obv()
  // if (typeof window !== 'undefined') {
  //   // fs sync not working in browser
  //   compactionProgress.set({ percent: 1, done: true, sizeDiff: 0 })
  // } else {
  //   compactionProgress.set(
  //     Compaction.stateFileExists(filename)
  //       ? { percent: 0, done: false }
  //       : { percent: 1, done: true, sizeDiff: 0 }
  //   )
  // }
  // const waitingCompaction = []
  // onLoad(function maybeResumeCompaction() {
  //   // fs sync not working in browser
  //   if (typeof window !== 'undefined') return
  //   if (Compaction.stateFileExists(filename)) {
  //     compact(function onCompactDone(err) {
  //       if (err) throw err
  //     })
  //   }
  // })()

  AtomicFile.readFile(
    statsFilename,
    'utf8',
    /** @type {CB<string>} */
    function statsUp(err, json) {
      if (err) {
        debug('error loading stats: %s', err.message)
        deletedBytes = 0
      } else {
        try {
          const stats = JSON.parse(json)
          deletedBytes = stats.deletedBytes
        } catch (err) {
          debug('error parsing stats: %s', /** @type {Error} */ (err).message)
          deletedBytes = 0
        }
      }

      raf.stat(
        /** @type {CB<{size: number}>} */
        function onRAFStatDone(err, stat) {
          if (err) debug('failed to stat ' + filename, err)

          const fileSize = stat ? stat.size : -1

          if (fileSize <= 0) {
            debug('empty file')
            latestBlockBuf = b4a.alloc(blockSize)
            latestBlockIndex = 0
            nextOffsetInBlock = 0
            cache.set(0, latestBlockBuf)
            since.set(-1)
            // @ts-ignore
            while (waitingLoad.length) waitingLoad.shift()()
          } else {
            const blockStart = fileSize - blockSize
            loadLatestBlock(blockStart, function onLoadedLatestBlock(err) {
              if (err) throw err
              debug('opened file, since: %d', since.value)
              // @ts-ignore
              while (waitingLoad.length) waitingLoad.shift()()
            })
          }
        }
      )
    }
  )

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
              since.set(blockStart + offsetInBlock)
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

  /** @type {(fn: (unlock: (cb: CB<any>, ...args: ([Error] | [null, any])) => void) => void) => void} */
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
   * @param {number} newSize
   * @param {CB<void>} cb
   */
  function truncateWithFSync(newSize, cb) {
    writeLock(function onWriteLockReleasedForTruncate(unlock) {
      raf.del(
        newSize,
        Infinity,
        function onRAFDeleteDone(/** @type {Error | null} */ err) {
          if (err) return unlock(cb, err)

          if (raf.fd) {
            fs.fsync(raf.fd, function onFSyncDoneForTruncate(err) {
              if (err) unlock(cb, err)
              else unlock(cb, null, undefined)
            })
          } else unlock(cb, null, undefined)
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
    debug('found invalid record at %d, fixing last block', badOffsetInBlock)
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
      debug('getting offset %d from cache', offset)
      const cachedBlockBuf = cache.get(blockIndex)
      cb(null, cachedBlockBuf)
    } else {
      debug('getting offset %d from disc', offset)
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
   * @return {[number, extractCodecType<typeof codec> | null, number]}
   */
  function getDataNextOffset(blockBuf, offset) {
    const offsetInBlock = getOffsetInBlock(offset)
    const [dataBuf, recSize, dataLength, emptyLength] = Record.read(
      blockBuf,
      offsetInBlock
    )
    const nextOffsetInBlock = offsetInBlock + recSize

    let nextOffset
    if (Record.isEOB(blockBuf, nextOffsetInBlock)) {
      if (getNextBlockStart(offset) > since.value) nextOffset = -1
      else nextOffset = 0
    } else {
      nextOffset = offset + recSize
    }

    if (dataLength === 0 && emptyLength > 0) return [nextOffset, null, recSize]
    else return [nextOffset, codec.decode(dataBuf), recSize]
  }

  /**
   * @param {(offset: number, data: extractCodecType<typeof codec> | null, size: number) => void} onNext
   * @param {(error?: Error) => void} onDone
   */
  function scan(onNext, onDone) {
    let cursor = 0
    const gotNextBlock =
      /** @type {CB<B4A>} */
      (
        (err, blockBuf) => {
          if (err) return onDone(err)
          if (isBufferZero(blockBuf)) return onDone()
          while (true) {
            const [offset, data, size] = getDataNextOffset(blockBuf, cursor)
            onNext(cursor, data, size)
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
    // if (compaction) { // FIXME:
    //   cb(delDuringCompactErr())
    //   return
    // }
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
        if (err) debug('error flushing overwrites with fsync: %s', err.message)
        saveStats(function onSavedStats(err, _) {
          if (err) debug('error saving stats: %s', err.message)
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
      debug("data doesn't fit current block, creating new")
    }

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
    debug('data inserted at offset %d', offset)
    return offset
  }

  /**
   * @param {extractCodecType<typeof codec>} data
   * @param {CB<number>} cb
   */
  function append(data, cb) {
    // if (compaction) { // FIXME:
    //   waitingCompaction.push(() => append(data, cb))
    //   return
    // }

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
    debug('writing block of size: %d, to offset: %d', blockBuf.length, blockIndex * blockSize)
    writingBlockIndex = blockIndex
    writeWithFSync(blockStart, blockBuf, null, function onBlockWritten(err, _) {
      const drainsBefore = (waitingDrain.get(blockIndex) || []).slice(0)
      writingBlockIndex = -1
      if (err) {
        debug('failed to write block %d', blockIndex)
        throw err
      } else {
        since.set(offset)

        // prettier-ignore
        debug('draining the waiting queue for %d, items: %d', blockIndex, drainsBefore.length)
        for (let i = 0; i < drainsBefore.length; ++i) drainsBefore[i]()

        // the resumed streams might have added more to waiting
        let drainsAfter = waitingDrain.get(blockIndex) || []
        if (drainsBefore.length === drainsAfter.length)
          waitingDrain.delete(blockIndex)
        else if (drainsAfter.length === 0) waitingDrain.delete(blockIndex)
        else
          waitingDrain.set(
            blockIndex,
            // @ts-ignore // FIXME:
            waitingDrain.get(blockIndex).slice(drainsBefore.length)
          )

        write() // next!
      }
    })
  }

  /**
   * @param {number} blockIndex
   * @param {B4A } blockBuf
   * @param {CB<null>} cb
   */
  function overwriteBlock(blockIndex, blockBuf, cb) {
    cache.set(blockIndex, blockBuf)
    const blockStart = blockIndex * blockSize
    writeWithFSync(blockStart, blockBuf, null, cb)
  }

  /**
   * @param {number} offset
   * @param {extractCodecType<typeof codec>} data
   * @param {CB<void>} cb
   */
  function overwrite(offset, data, cb) {
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
      cb()
    })
  }

  /**
   * @param {number} newLatestBlockIndex
   * @param {CB<number>} cb
   */
  function truncate(newLatestBlockIndex, cb) {
    assert(typeof latestBlockIndex === 'number', 'latestBlockIndex not set')
    if (newLatestBlockIndex > latestBlockIndex) {
      return cb(unexpectedTruncationErr())
    }
    if (newLatestBlockIndex === latestBlockIndex) {
      const blockStart = latestBlockIndex * blockSize
      loadLatestBlock(blockStart, function onTruncateLoadedLatestBlock1(err) {
        if (err) cb(err)
        else cb(null, 0)
      })
      return
    }
    const size = (latestBlockIndex + 1) * blockSize
    const newSize = (newLatestBlockIndex + 1) * blockSize
    for (let i = newLatestBlockIndex + 1; i < latestBlockIndex; ++i) {
      cache.delete(i)
    }
    truncateWithFSync(newSize, function onTruncateWithFSyncDone(err) {
      if (err) return cb(err)
      const blockStart = newSize - blockSize
      loadLatestBlock(blockStart, function onTruncateLoadedLatestBlock2(err) {
        if (err) return cb(err)
        const sizeDiff = size - newSize
        cb(null, sizeDiff)
      })
    })
  }

  /**
   * @param {CB<{ totalBytes: number; deletedBytes: number }>} cb
   */
  function stats(cb) {
    if (since.value == null) {
      since((/** @type {number} */ totalBytes) => {
        cb(null, { totalBytes: Math.max(0, totalBytes), deletedBytes })
        return false
      })
    } else {
      cb(null, { totalBytes: Math.max(0, since.value), deletedBytes })
    }
  }

  /**
   * @param {CB<unknown>} cb
   */
  function saveStats(cb) {
    const stats = JSON.stringify({ deletedBytes })
    AtomicFile.writeFile(statsFilename, stats, 'utf8', cb)
  }

  /**
   * @param {CB<unknown>} cb
   */
  // function compact(cb) { // FIXME:
  //   if (compaction) {
  //     debug('compaction already in progress')
  //     waitingCompaction.push(cb)
  //     return
  //   }
  //   for (const stream of self.streams) {
  //     if (stream.live && (stream.max || stream.max_inclusive)) {
  //       return cb(compactWithMaxLiveStreamErr())
  //     }
  //   }
  //   onStreamsDone(function startCompactAfterStreamsDone() {
  //     onDrain(function startCompactAfterDrain() {
  //       onOverwritesFlushed(function startCompactAfterDeletes() {
  //         if (compactionProgress.value.done) {
  //           compactionProgress.set({ percent: 0, done: false })
  //         }
  //         compaction = new Compaction(self, (/** @type {any} */ err, /** @type {any} */ stats) => {
  //           compaction = null
  //           if (err) return cb(err)
  //           deletedBytes = 0
  //           saveStats(function onSavedStatsAfterCompaction(err) {
  //             if (err)
  //               debug('error saving stats after compaction: %s', err.message)
  //           })
  //           for (const stream of self.streams) {
  //             if (stream.live) stream.postCompactionReset(since.value)
  //           }
  //           compactionProgress.set({ ...stats, percent: 1, done: true })
  //           for (const callback of waitingCompaction) callback()
  //           waitingCompaction.length = 0
  //           cb()
  //         })
  //         let prevUpdate = 0
  //         compaction.progress((/** @type {any} */ stats) => {
  //           const now = Date.now()
  //           if (now - prevUpdate > COMPACTION_PROGRESS_EMIT_INTERVAL) {
  //             prevUpdate = now
  //             compactionProgress.set({ ...stats, done: false })
  //           }
  //         })
  //       })
  //     })
  //   })
  // }

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
   * @param {CallableFunction} fn
   */
  function onDrain(fn) {
    // if (compaction) { // FIXME:
    //   waitingCompaction.push(fn)
    //   return
    // }
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
    scan: onLoad(scan), // TODO
    del: onLoad(del), // TODO
    append: onLoad(append), // TODO
    overwrite: onLoad(overwrite), // TODO
    close: onLoad(close), // TODO
    onDrain: onLoad(onDrain), // TODO
    onOverwritesFlushed: onLoad(onOverwritesFlushed),
    // compact: onLoad(compact), // FIXME:
    // compactionProgress,
    since,
    stats, // TODO

    // Internals needed by ./compaction.js:
    filename,
    blockSize,
    overwriteBlock,
    truncate,
    hasNoSpaceFor,

    // Useful for tests
    _get: onLoad(get),
  }
}

module.exports = Log
