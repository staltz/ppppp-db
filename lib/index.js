const path = require('node:path')
const push = require('push-stream')
const AAOL = require('async-append-only-log')
const promisify = require('promisify-4loc')
const b4a = require('b4a')
const base58 = require('bs58')
const Obz = require('obz')
const MsgV2 = require('./msg-v2')
const { ReadyGate } = require('./utils')
const { decrypt } = require('./encryption')

/**
 * @typedef {import('./msg-v2').Msg} Msg
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
 * @property {Object=} misc.originalData
 * @property {string=} misc.encryptionFormat
 */

/**
 * @typedef {RecPresent | RecDeleted} Rec
 */

class DBTangle extends MsgV2.Tangle {
  /**
   * @param {string} rootHash
   * @param {Iterable<Rec>} recordsIter
   */
  constructor(rootHash, recordsIter) {
    super(rootHash)
    for (const rec of recordsIter) {
      if (!rec.msg) continue
      this.add(rec.hash, rec.msg)
    }
  }

  getDeletablesAndErasables(msgHash) {
    const erasables = this.shortestPathToRoot(msgHash)
    const sorted = this.topoSort()
    const index = sorted.indexOf(msgHash)
    const deletables = sorted.filter(
      (msgHash, i) => i < index && !erasables.includes(msgHash)
    )
    return { deletables, erasables }
  }
}

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
        return b4a.from(JSON.stringify(msg), 'utf8')
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
      const size = b4a.from(JSON.stringify(rec), 'utf8').length
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

  function populateTangles(tangleIds) {
    const tangles = {}
    for (const tangleId of tangleIds) {
      tangles[tangleId] ??= new DBTangle(tangleId, records())
    }
    return tangles
  }

  function loaded(cb) {
    if (cb === void 0) return promisify(loaded)()
    scannedLog.onReady(cb)
  }

  function add(msg, tangleRootHash, cb) {
    const msgHash = MsgV2.getMsgHash(msg)

    // TODO: optimize this. Perhaps have a Map() of msgHash -> record
    // Or even better, a bloom filter. If you just want to answer no/perhaps.
    let rec
    if ((rec = getRecord(msgHash))) return cb(null, rec)

    // TODO: optimize this. This may be slow if you're adding many msgs in a
    // row, because it creates a new Map() each time. Perhaps with QuickLRU
    const tangle = new DBTangle(tangleRootHash, records())

    const pubkeys = new Set()
    if (msg.metadata.group) {
      const groupTangle = new DBTangle(msg.metadata.group, records())
      if (!groupTangle.has(msg.metadata.group)) {
        // prettier-ignore
        return cb(new Error('add() failed because the group tangle is unknown'))
      }
      for (const msgHash of groupTangle.topoSort()) {
        const msg = get(msgHash)
        if (!msg?.data?.add) continue
        pubkeys.add(msg.data.add)
      }
    }

    let err
    if ((err = MsgV2.validate(msg, tangle, pubkeys, msgHash, tangleRootHash))) {
      return cb(new Error('add() failed msg validation', { cause: err }))
    }

    logAppend(msgHash, msg, (err, rec) => {
      if (err) return cb(new Error('add() failed in the log', { cause: err }))
      onRecordAdded.set(rec)
      cb(null, rec)
    })
  }

  function initializeFeed(opts, cb) {
    const keypair = opts.keypair ?? config.keypair
    const { group, type } = opts

    const feedRootHash = getFeedId(group, type)
    if (feedRootHash) return cb(null, feedRootHash)

    const feedRoot = MsgV2.createRoot(group, type, keypair)
    add(feedRoot, MsgV2.getMsgHash(feedRoot), (err, rec) => {
      // prettier-ignore
      if (err) return cb(new Error('initializeFeed() failed to add root', { cause: err }));
      cb(null, rec.hash)
    })
  }

  function createGroup(opts, cb) {
    const keypair = opts?.keypair ?? config.keypair

    let msg
    try {
      msg = MsgV2.createGroup(keypair, opts?._nonce)
    } catch (err) {
      return cb(new Error('group.create() failed', { cause: err }))
    }
    const msgHash = MsgV2.getMsgHash(msg)

    logAppend(msgHash, msg, (err, rec) => {
      // prettier-ignore
      if (err) return cb(new Error('group.create() failed in the log', { cause: err }))
      onRecordAdded.set(rec)
      cb(null, rec)
    })
  }

  function addToGroup(opts, cb) {
    if (!opts?.keypair) return cb(new Error('group.add() requires a `keypair`'))
    if (!opts?.group) return cb(new Error('group.add() requires a `group`'))
    const addedKeypair = opts.keypair
    const signingKeypair = config.keypair

    // Fill-in tangle opts:
    const tangles = populateTangles([opts.group])
    const fullOpts = {
      group: null,
      groupTips: null,
      tangles,
      keypair: signingKeypair,
      data: { add: addedKeypair.public },
      type: 'group',
    }

    // Create the actual message:
    let msg
    try {
      msg = MsgV2.create(fullOpts)
    } catch (err) {
      return cb(new Error('group.add() failed', { cause: err }))
    }
    const msgHash = MsgV2.getMsgHash(msg)

    logAppend(msgHash, msg, (err, rec) => {
      // prettier-ignore
      if (err) return cb(new Error('group.add() failed to append the log', { cause: err }))
      onRecordAdded.set(rec)
      cb(null, rec)
    })
  }

  function publishToFeed(opts, cb) {
    if (!opts) return cb(new Error('feed.publish() requires an `opts`'))
    const keypair = opts.keypair ?? config.keypair

    const encryptionFormat = encryptionFormats.get(opts.encryptionFormat)
    if (opts.data.recps) {
      if (!encryptionFormat) {
        // prettier-ignore
        return cb(new Error(`feed.publish() does not support encryption format "${opts.encryptionFormat}"`))
      }
    }
    if (!opts.data) return cb(new Error('feed.publish() requires a `data`'))
    if (!opts.type) return cb(new Error('feed.publish() requires a `type`'))
    if (!opts.group) return cb(new Error('feed.publish() requires a `group`'))

    initializeFeed(opts, (err, feedRootHash) => {
      // prettier-ignore
      if (err) return cb(new Error('feed.publish() failed to initialize feed', { cause: err }));

      // Fill-in tangle opts:
      const tangleTemplates = opts.tangles ?? []
      tangleTemplates.push(feedRootHash)
      const tangles = populateTangles(tangleTemplates)
      const groupTangle = new DBTangle(opts.group, records())
      const groupTips = [...groupTangle.getTips()]
      const fullOpts = { ...opts, tangles, groupTips, keypair }

      // If opts ask for encryption, encrypt and put ciphertext in opts.data
      const recps = fullOpts.data.recps
      if (Array.isArray(recps) && recps.length > 0) {
        const plaintext = MsgV2.toPlaintextBuffer(fullOpts)
        const encryptOpts = {
          ...fullOpts,
          recps: recps.map(
            (recp) =>
              // TODO: temporary until our encryption formats are ppppp not SSB
              `@${b4a.from(base58.decode(recp)).toString('base64')}.ed25519`
          ),
        }
        let ciphertextBuf
        try {
          ciphertextBuf = encryptionFormat.encrypt(plaintext, encryptOpts)
        } catch (err) {
          // prettier-ignore
          console.log(err);
          return cb(
            new Error('feed.publish() failed to encrypt data', { cause: err })
          )
        }
        if (!ciphertextBuf) {
          // prettier-ignore
          return cb(new Error('feed.publish() failed to encrypt with ' + encryptionFormat.name))
        }
        const ciphertextBase64 = ciphertextBuf.toString('base64')
        fullOpts.data = ciphertextBase64 + '.' + encryptionFormat.name
      }

      // Create the actual message:
      let msg
      try {
        msg = MsgV2.create(fullOpts)
      } catch (err) {
        return cb(new Error('feed.publish() failed', { cause: err }))
      }
      const msgHash = MsgV2.getMsgHash(msg)

      // Encode the native message and append it to the log:
      logAppend(msgHash, msg, (err, rec) => {
        // prettier-ignore
        if (err) return cb(new Error('feed.publish() failed to append the log', { cause: err }))
        onRecordAdded.set(rec)
        cb(null, rec)
      })
    })
  }

  function getFeedId(groupId, findType) {
    const findGroup = MsgV2.stripGroup(groupId)
    for (const rec of records()) {
      if (MsgV2.isFeedRoot(rec.msg, findGroup, findType)) return rec.hash
    }
    return null
  }

  // TODO: improve performance of this when getting many messages, the argument
  // could be an array of hashes, so we can do a single pass over the records.
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

  function del(msgId, cb) {
    const rec = getRecord(msgId)
    if (!rec) return cb()
    if (!rec.msg) return cb()
    const { offset, size, seq } = rec.misc
    recs[rec.misc.seq] = { misc: { offset, size, seq } }
    log.onDrain(() => {
      log.del(offset, cb)
    })
  }

  function erase(msgId, cb) {
    const rec = getRecord(msgId)
    if (!rec) return cb()
    if (!rec.msg) return cb()
    if (!rec.msg.data) return cb()
    recs[rec.misc.seq].msg = MsgV2.erase(rec.msg)
    // FIXME: persist this change to disk!! Not supported by AAOL yet
    cb()
  }

  function getTangle(tangleId) {
    return new DBTangle(tangleId, records())
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

  return {
    // public
    installEncryptionFormat,
    loaded,
    add,
    group: {
      create: createGroup,
      add: addToGroup,
    },
    feed: {
      publish: publishToFeed,
      getId: getFeedId,
    },
    getRecord,
    get,
    del,
    erase,
    onRecordAdded,
    getTangle,
    msgs,
    records,

    // internal
    findEncryptionFormatFor,

    // used by tests
    _getLog: () => log,
  }
}
