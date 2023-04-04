const path = require('path')
const push = require('push-stream')
const AAOL = require('async-append-only-log')
const promisify = require('promisify-4loc')
const Obz = require('obz')
const FeedV1 = require('./feed-v1')
const { ReadyGate } = require('./utils')
const { decrypt } = require('./encryption')

/**
 * @typedef {import('./feed-v1').Msg} Msg
 */

/**
 * @typedef {Object} RecDeleted
 * @property {never} id
 * @property {never} msg
 * @property {never} received
 * @property {Object} misc
 * @property {number} misc.offset
 * @property {number} misc.size
 * @property {number} misc.seq
 */

/**
 * @typedef {Object} RecPresent
 * @property {string} id
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

  const msgsPerFeed = {
    _mapAll: new Map(), // who => Set<MsgHash>
    _mapTips: new Map(), // who => Set<MsgHash>
    _byHash: new Map(), // msgId => Msg // TODO: optimize space usage of this??
    update(msg, msgId) {
      const msgHash = FeedV1.getMsgHash(msgId ?? msg)
      const feedId = FeedV1.getFeedId(msg)
      const setAll = this._mapAll.get(feedId) ?? new Set()
      const setTips = this._mapTips.get(feedId) ?? new Set()
      for (const p of msg.metadata.prev) {
        setTips.delete(p)
      }
      setAll.add(msgHash)
      setTips.add(msgHash)
      this._mapTips.set(feedId, setTips)
      this._mapAll.set(feedId, setAll)
      this._byHash.set(msgHash, msg)
    },
    getAll(feedId) {
      const map = new Map()
      for (const msgHash of this._mapAll.get(feedId) ?? []) {
        const msg = this._byHash.get(msgHash)
        if (msg) map.set(msgHash, msg)
      }
      return map
    },
    getTips(feedId) {
      const map = new Map()
      for (const msgHash of this._mapTips.get(feedId) ?? []) {
        const msg = this._byHash.get(msgHash)
        if (msg) map.set(msgHash, msg)
      }
      return map
    },
    deleteMsg(msg) {
      const feedId = FeedV1.getFeedId(msg)
      const msgHash = FeedV1.getMsgHash(msg)
      const setAll = this._mapAll.get(feedId)
      setAll.delete(msgHash)
      const setTips = this._mapTips.get(feedId)
      setTips.delete(msgHash)
      this._byHash.delete(msgHash)
    },
  }

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

          msgsPerFeed.update(rec.msg)
        },
        function drainEnd(err) {
          // prettier-ignore
          if (err) throw new Error('Failed to initially scan the log', { cause: err });
          scannedLog.setReady()
        }
      )
    )
  })

  function logAppend(id, msg, feedId, isOOO, cb) {
    const rec = {
      id,
      msg,
      received: Date.now(),
    }
    if (isOOO) rec.ooo = isOOO
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

  function add(msg, cb) {
    const feedId = FeedV1.getFeedId(msg)
    // TODO: optimize this. This may be slow if you're adding many msgs in a
    // row, because `getAll()` creates a new Map() each time.
    const existingMsgs = msgsPerFeed.getAll(feedId)

    FeedV1.validate(msg, existingMsgs, validationCB)

    function validationCB(err) {
      // prettier-ignore
      if (err) return cb(new Error('add() failed validation for feed format v1', {cause: err}))
      const msgId = FeedV1.getMsgId(msg)
      msgsPerFeed.update(msg, msgId)

      logAppend(msgId, msg, feedId, false, logAppendCB)
    }

    function logAppendCB(err, rec) {
      if (err) return cb(new Error('add() failed in the log', { cause: err }))
      onRecordAdded.set(rec)
      cb(null, rec)
    }
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

    // Create full opts:
    let tempMsg
    try {
      tempMsg = FeedV1.create({
        when: Date.now(),
        ...opts,
        existing: [],
        tips: [],
        keys,
      })
    } catch (err) {
      return cb(new Error('create() failed', { cause: err }))
    }
    const feedId = FeedV1.getFeedId(tempMsg)
    const existing = msgsPerFeed.getAll(feedId)
    const tips = msgsPerFeed.getTips(feedId)
    const fullOpts = { when: Date.now(), ...opts, existing, tips, keys }

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
    const msgId = FeedV1.getMsgId(msg)
    msgsPerFeed.update(msg, msgId)

    // Encode the native message and append it to the log:
    logAppend(msgId, msg, feedId, false, (err, rec) => {
      // prettier-ignore
      if (err) return cb(new Error('create() failed to append the log', { cause: err }))
      onRecordAdded.set(rec)
      cb(null, rec)
    })
  }

  function del(msgId, cb) {
    const rec = getRecord(msgId)
    msgsPerFeed.deleteMsg(rec.msg)
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
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i]
      if (rec && rec.id === msgId) return rec
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

    // internal
    findEncryptionFormatFor,
  }
}
