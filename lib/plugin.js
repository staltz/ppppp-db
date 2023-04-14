const path = require('path')
const push = require('push-stream')
const AAOL = require('async-append-only-log')
const promisify = require('promisify-4loc')
const Obz = require('obz')
const FeedV1 = require('./feed-v1')
const Tangle = require('./tangle')
const { ReadyGate, isEmptyObject } = require('./utils')
const { decrypt } = require('./encryption')

/**
 * @typedef {import('./feed-v1').Msg} Msg
 */

/**
 * @typedef {Object} RecDeleted
 * @property {never} hash
 * @property {never} msg
 * @property {never} received
 * @property {Object} misc
 * @property {number} misc.offset
 * @property {number} misc.size
 * @property {number} misc.seq
 */

/**
 * @typedef {Object} RecPresent
 * @property {string} hash
 * @property {Msg} msg
 * @property {number} received
 * @property {Object} misc
 * @property {number} misc.offset
 * @property {number} misc.size
 * @property {number} misc.seq
 * @property {boolean=} misc.private
 * @property {Object=} misc.originalContent
 * @property {string=} misc.encryptionFormat
 */

/**
 * @typedef {RecPresent | RecDeleted} Rec
 */

exports.name = 'db'

exports.init = function initDB(peer, config) {
  /** @type {Array<Rec>} */
  const recs = []
  const encryptionFormats = new Map()
  const onRecordAdded = Obz()

  const log = AAOL(path.join(config.path, 'db.bin'), {
    cacheSize: 1,
    blockSize: 64 * 1024,
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
  })

  peer.close.hook(function (fn, args) {
    log.close(() => {
      fn.apply(this, args)
    })
  })

  const scannedLog = new ReadyGate()
  // setTimeout to let peer.db.* secret-stack become available
  setTimeout(() => {
    let i = -1
    log.stream({ offsets: true, values: true, sizes: true }).pipe(
      push.drain(
        function drainEach({ offset, value, size }) {
          i += 1
          if (!value) {
            // deleted record
            recs.push({ misc: { offset, size, seq: i } })
            return
          }
          // TODO: for performance, dont decrypt on startup, instead decrypt on
          // demand, or decrypt in the background. Or then store the log with
          // decrypted msgs and only encrypt when moving it to the network.
          const rec = decrypt(value, peer, config)
          rec.misc ??= {}
          rec.misc.offset = offset
          rec.misc.size = size
          rec.misc.seq = i
          recs.push(rec)
        },
        function drainEnd(err) {
          // prettier-ignore
          if (err) throw new Error('Failed to initially scan the log', { cause: err });
          scannedLog.setReady()
        }
      )
    )
  })

  function logAppend(hash, msg, cb) {
    const rec = {
      hash,
      msg,
      received: Date.now(),
    }
    log.append(rec, (err, newOffset) => {
      if (err) return cb(new Error('logAppend failed', { cause: err }))
      const offset = newOffset // latestOffset
      const size = Buffer.from(JSON.stringify(rec), 'utf8').length
      const seq = recs.length
      const recExposed = decrypt(rec, peer, config)
      rec.misc = recExposed.misc = { offset, size, seq }
      recs.push(recExposed)
      cb(null, rec)
    })
  }

  function installEncryptionFormat(encryptionFormat) {
    if (encryptionFormat.setup) {
      const loaded = new ReadyGate()
      encryptionFormat.setup(config, (err) => {
        // prettier-ignore
        if (err) throw new Error(`Failed to install encryption format "${encryptionFormat.name}"`, {cause: err});
        loaded.setReady()
      })
      encryptionFormat.onReady = loaded.onReady.bind(loaded)
    }
    encryptionFormats.set(encryptionFormat.name, encryptionFormat)
  }

  function findEncryptionFormatFor(ciphertextJS) {
    if (!ciphertextJS) return null
    if (typeof ciphertextJS !== 'string') return null
    const suffix = ciphertextJS.split('.').pop()
    const encryptionFormat = encryptionFormats.get(suffix) ?? null
    return encryptionFormat
  }

  function add(msg, tangleRootHash, cb) {
    // TODO: optimize this. This may be slow if you're adding many msgs in a
    // row, because it creates a new Map() each time.
    const tangle = new Tangle(tangleRootHash, records())

    const msgHash = FeedV1.getMsgHash(msg)
    FeedV1.validate(msg, tangle, msgHash, tangleRootHash, validationCB)

    function validationCB(err) {
      // prettier-ignore
      if (err) return cb(new Error('add() failed validation for feed format v1', {cause: err}))
      logAppend(msgHash, msg, logAppendCB)
    }

    function logAppendCB(err, rec) {
      if (err) return cb(new Error('add() failed in the log', { cause: err }))
      onRecordAdded.set(rec)
      cb(null, rec)
    }
  }

  function getFeedRoot(findWho, findType) {
    const findWho_ = findWho.startsWith('ppppp:feed/v1/')
      ? findWho.substring(16)
      : findWho
    for (const rec of records()) {
      const { who, type, tangles } = rec.msg.metadata
      if (who === findWho_ && type === findType && isEmptyObject(tangles)) {
        return rec.hash
      }
    }
    return null
  }

  function populateTangles(tangleIds) {
    const tangles = {}
    for (const tangleId of tangleIds) {
      tangles[tangleId] ??= new Tangle(tangleId, records())
    }
    return tangles
  }

  function create(opts, cb) {
    const keys = opts.keys ?? config.keys

    const encryptionFormat = encryptionFormats.get(opts.encryptionFormat)
    // prettier-ignore
    if (opts.content.recps) {
      if (!encryptionFormat) {
        return cb(new Error(`create() does not support encryption format "${opts.encryptionFormat}"`))
      }
    }
    if (!opts.content) return cb(new Error('create() requires a `content`'))
    if (!opts.type) return cb(new Error('create() requires a `type`'))

    const feedRootHash = getFeedRoot(FeedV1.stripAuthor(keys.id), opts.type)
    if (!feedRootHash) {
      const feedRoot = FeedV1.createRoot(keys, opts.type)
      add(feedRoot, FeedV1.getMsgHash(feedRoot), (err) => {
        // prettier-ignore
        if (err) return cb(new Error('create() failed to create root', {cause: err}));
        create(opts, cb)
      })
      return
    }

    // Fill-in tangle opts:
    const tangleTemplates = opts.tangles ?? []
    tangleTemplates.push(feedRootHash)
    const tangles = populateTangles(tangleTemplates)
    const fullOpts = { when: Date.now(), ...opts, tangles, keys }

    // If opts ask for encryption, encrypt and put ciphertext in opts.content
    const recps = fullOpts.content.recps
    if (Array.isArray(recps) && recps.length > 0) {
      const plaintext = FeedV1.toPlaintextBuffer(fullOpts)
      const encryptOpts = { ...fullOpts, recps }
      let ciphertextBuf
      try {
        ciphertextBuf = encryptionFormat.encrypt(plaintext, encryptOpts)
      } catch (err) {
        // prettier-ignore
        return cb(new Error('create() failed to encrypt content', {cause: err}));
      }
      if (!ciphertextBuf) {
        // prettier-ignore
        return cb(new Error('create() failed to encrypt with ' + encryptionFormat.name))
      }
      const ciphertextBase64 = ciphertextBuf.toString('base64')
      fullOpts.content = ciphertextBase64 + '.' + encryptionFormat.name
    }

    // Create the actual message:
    let msg
    try {
      msg = FeedV1.create(fullOpts)
    } catch (err) {
      return cb(new Error('create() failed', { cause: err }))
    }
    const msgHash = FeedV1.getMsgHash(msg)

    // Encode the native message and append it to the log:
    logAppend(msgHash, msg, (err, rec) => {
      // prettier-ignore
      if (err) return cb(new Error('create() failed to append the log', { cause: err }))
      onRecordAdded.set(rec)
      cb(null, rec)
    })
  }

  function del(msgId, cb) {
    const rec = getRecord(msgId)
    const { offset, size, seq } = rec.misc
    recs[rec.misc.seq] = { misc: { offset, size, seq } }
    log.onDrain(() => {
      log.del(offset, cb)
    })
  }

  function* msgs() {
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i]
      if (rec.msg) yield rec.msg
    }
  }

  function* records() {
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i]
      if (rec) yield rec
    }
  }

  function getRecord(msgId) {
    const isUri = msgId.startsWith('ppppp:')
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i]
      if (!rec) continue
      if (isUri && msgId.endsWith(rec.hash)) return rec
      else if (!isUri && rec.hash === msgId) return rec
    }
    return null
  }

  function get(msgId) {
    return getRecord(msgId)?.msg
  }

  function loaded(cb) {
    if (cb === void 0) return promisify(loaded)()
    scannedLog.onReady(cb)
  }

  return {
    // public
    installEncryptionFormat,
    loaded,
    add,
    create,
    del,
    onRecordAdded,
    msgs,
    records,
    getRecord,
    get,
    getFeedRoot,

    // internal
    findEncryptionFormatFor,

    // mockable by tests
    _getLog: () => log,
  }
}
