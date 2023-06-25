const path = require('node:path')
// @ts-ignore
const push = require('push-stream')
// @ts-ignore
const AAOL = require('async-append-only-log')
const promisify = require('promisify-4loc')
const b4a = require('b4a')
const base58 = require('bs58')
// @ts-ignore
const Obz = require('obz')
const MsgV2 = require('./msg-v3')
const { ReadyGate } = require('./utils')
const { decrypt } = require('./encryption')

/**
 * @typedef {import('ppppp-keypair').Keypair} Keypair
 * @typedef {import('./msg-v3').Msg} Msg
 * @typedef {import('./encryption').EncryptionFormat} EncryptionFormat
 *
 * @typedef {Buffer | Uint8Array} B4A
 */

/**
 * @typedef {{
 *   hash?: never;
 *   msg?: never;
 *   received?: never;
 *   misc: {
 *     offset: number;
 *     size: number;
 *     seq: number;
 *   };
 * }} RecDeleted
 *
 * @typedef {{
 *   hash: string;
 *   msg: Msg;
 *   received: number;
 *   misc: {
 *     offset: number;
 *     size: number;
 *     seq: number;
 *     private?: boolean;
 *     originalData?: any;
 *     encryptionFormat?: string;
 *   }
 * }} RecPresent
 *
 * @typedef {RecPresent | RecDeleted} Rec
 */

/**
 * @template T
 * @typedef {(...args: [Error] | [null, T]) => void} CB
 */

/**
 * @typedef {(...args: [Error] | []) => void} CBVoid
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

  /**
   * @param {string} msgHash
   */
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

/**
 * @param {any} peer
 * @param {{ path: string; keypair: Keypair; }} config
 */
function initDB(peer, config) {
  /** @type {Array<Rec>} */
  const recs = []

  /** @type {Map<string, EncryptionFormat>} */
  const encryptionFormats = new Map()

  const onRecordAdded = Obz()

  const log = AAOL(path.join(config.path, 'db.bin'), {
    cacheSize: 1,
    blockSize: 64 * 1024,
    codec: {
      /**
       * @param {Msg} msg
       */
      encode(msg) {
        return b4a.from(JSON.stringify(msg), 'utf8')
      },
      /**
       * @param {B4A} buf
       */
      decode(buf) {
        return JSON.parse(b4a.toString(buf, 'utf8'))
      },
    },
    /**
     * @param {B4A} buf
     */
    validateRecord(buf) {
      try {
        JSON.parse(b4a.toString(buf, 'utf8'))
        return true
      } catch {
        return false
      }
    },
  })

  peer.close.hook(function (/** @type {any} */ fn, /** @type {any} */ args) {
    log.close(() => {
      // @ts-ignore
      fn.apply(this, args)
    })
  })

  const scannedLog = new ReadyGate()
  // setTimeout to let peer.db.* secret-stack become available
  setTimeout(() => {
    let i = -1
    log.stream({ offsets: true, values: true, sizes: true }).pipe(
      push.drain(
        // @ts-ignore
        function drainEach({ offset, value, size }) {
          i += 1
          if (!value) {
            // deleted record
            /** @type {RecDeleted} */
            const rec = { misc: { offset, size, seq: i } }
            recs.push(rec)
            return
          }
          // TODO: for performance, dont decrypt on startup, instead decrypt on
          // demand, or decrypt in the background. Or then store the log with
          // decrypted msgs and only encrypt when moving it to the network.
          const rec = decrypt(value, peer, config)
          rec.misc ??= /** @type {Rec['misc']} */ ({})
          rec.misc.offset = offset
          rec.misc.size = size
          rec.misc.seq = i
          recs.push(rec)
        },
        function drainEnd(/** @type {any} */ err) {
          // prettier-ignore
          if (err) throw new Error('Failed to initially scan the log', { cause: err });
          scannedLog.setReady()
        }
      )
    )
  })

  /**
   * @param {string} hash
   * @param {Msg} msg
   * @param {CB<Rec>} cb
   */
  function logAppend(hash, msg, cb) {
    /** @type {RecPresent} */
    const rec = {
      hash,
      msg,
      received: Date.now(),
      misc: {
        offset: 0,
        size: 0,
        seq: 0,
      },
    }
    log.append(
      rec,
      (/** @type {any} */ err, /** @type {number} */ newOffset) => {
        if (err) return cb(new Error('logAppend failed', { cause: err }))
        const offset = newOffset // latestOffset
        const size = b4a.from(JSON.stringify(rec), 'utf8').length
        const seq = recs.length
        const recExposed = decrypt(rec, peer, config)
        rec.misc = recExposed.misc = { offset, size, seq }
        recs.push(recExposed)
        cb(null, rec)
      }
    )
  }

  /**
   * @param {EncryptionFormat} encryptionFormat
   */
  function installEncryptionFormat(encryptionFormat) {
    if (encryptionFormat.setup) {
      const loaded = new ReadyGate()
      encryptionFormat.setup(config, (/** @type {any} */ err) => {
        // prettier-ignore
        if (err) throw new Error(`Failed to install encryption format "${encryptionFormat.name}"`, {cause: err});
        loaded.setReady()
      })
      encryptionFormat.onReady = loaded.onReady.bind(loaded)
    }
    encryptionFormats.set(encryptionFormat.name, encryptionFormat)
  }

  /**
   * @param {string} ciphertextJS
   */
  function findEncryptionFormatFor(ciphertextJS) {
    if (!ciphertextJS) return null
    if (typeof ciphertextJS !== 'string') return null
    const suffix = ciphertextJS.split('.').pop()
    if (!suffix) {
      // prettier-ignore
      console.warn('findEncryptionFormatFor() failed to find suffix\n\n' + ciphertextJS)
      return null
    }
    const encryptionFormat = encryptionFormats.get(suffix) ?? null
    return encryptionFormat
  }

  /**
   * @param {Array<string>} tangleIds
   */
  function populateTangles(tangleIds) {
    /** @type {Record<string, DBTangle>} */
    const tangles = {}
    for (const tangleId of tangleIds) {
      tangles[tangleId] ??= new DBTangle(tangleId, records())
    }
    return tangles
  }

  /**
   * @param {CB<void>} cb
   */
  function loaded(cb) {
    if (cb === void 0) return promisify(loaded)()
    scannedLog.onReady(cb)
  }

  /**
   * @param {Msg} msg
   * @param {string} tangleRootHash
   * @param {CB<Rec>} cb
   */
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
    if (msg.metadata.identity) {
      const identityTangle = new DBTangle(msg.metadata.identity, records())
      if (!identityTangle.has(msg.metadata.identity)) {
        // prettier-ignore
        return cb(new Error('add() failed because the identity tangle is unknown'))
      }
      for (const msgHash of identityTangle.topoSort()) {
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

  /**
   * @param {{ keypair?: any; identity: string; domain: string; }} opts
   * @param {CB<string>} cb
   */
  function initializeFeed(opts, cb) {
    const keypair = opts.keypair ?? config.keypair
    const { identity, domain } = opts

    const feedRootHash = getFeedId(identity, domain)
    if (feedRootHash) return cb(null, feedRootHash)

    const feedRoot = MsgV2.createRoot(identity, domain, keypair)
    add(feedRoot, MsgV2.getMsgHash(feedRoot), (err, rec) => {
      // prettier-ignore
      if (err) return cb(new Error('initializeFeed() failed to add root', { cause: err }));
      const recHash = /** @type {string} */ (rec.hash)
      cb(null, recHash)
    })
  }

  /**
   * @param {{keypair?: Keypair, _nonce?: string} | null} opts
   * @param {CB<Rec>} cb
   */
  function createIdentity(opts, cb) {
    const keypair = opts?.keypair ?? config.keypair

    let msg
    try {
      msg = MsgV2.createIdentity(keypair, opts?._nonce)
    } catch (err) {
      return cb(new Error('identity.create() failed', { cause: err }))
    }
    const msgHash = MsgV2.getMsgHash(msg)

    logAppend(msgHash, msg, (err, rec) => {
      // prettier-ignore
      if (err) return cb(new Error('identity.create() failed in the log', { cause: err }))
      onRecordAdded.set(rec)
      cb(null, rec)
    })
  }

  /**
   * @param {{ keypair: Keypair; identity: string; }} opts
   * @param {CB<Rec>} cb
   */
  function addToIdentity(opts, cb) {
    if (!opts?.keypair)
      return cb(new Error('identity.add() requires a `keypair`'))
    if (!opts?.identity)
      return cb(new Error('identity.add() requires a `identity`'))
    const addedKeypair = opts.keypair
    const signingKeypair = config.keypair

    // Fill-in tangle opts:
    const tangles = populateTangles([opts.identity])
    const fullOpts = {
      identity: null,
      identityTips: null,
      tangles,
      keypair: signingKeypair,
      data: { add: addedKeypair.public },
      domain: 'identity',
    }

    // Create the actual message:
    let msg
    try {
      msg = MsgV2.create(fullOpts)
    } catch (err) {
      return cb(new Error('identity.add() failed', { cause: err }))
    }
    const msgHash = MsgV2.getMsgHash(msg)

    logAppend(msgHash, msg, (err, rec) => {
      // prettier-ignore
      if (err) return cb(new Error('identity.add() failed to append the log', { cause: err }))
      onRecordAdded.set(rec)
      cb(null, rec)
    })
  }

  /**
   * @param {{
   *   keypair?: Keypair;
   *   encryptionFormat?: string;
   *   data: any;
   *   domain: string;
   *   identity: string;
   *   tangles?: Array<string>;
   * }} opts
   * @param {CB<Rec>} cb
   */
  function publishToFeed(opts, cb) {
    if (!opts) return cb(new Error('feed.publish() requires an `opts`'))
    const keypair = opts.keypair ?? config.keypair

    if (opts.data.recps) {
      if (!encryptionFormats.has(opts.encryptionFormat ?? '')) {
        // prettier-ignore
        return cb(new Error(`feed.publish() does not support encryption format "${opts.encryptionFormat}"`))
      }
    }
    if (!opts.data) return cb(new Error('feed.publish() requires a `data`'))
    if (!opts.domain) return cb(new Error('feed.publish() requires a `domain`'))
    if (!opts.identity)
      return cb(new Error('feed.publish() requires a `identity`'))

    initializeFeed(opts, (err, feedRootHash) => {
      // prettier-ignore
      if (err) return cb(new Error('feed.publish() failed to initialize feed', { cause: err }));

      // Fill-in tangle opts:
      const tangleTemplates = opts.tangles ?? []
      tangleTemplates.push(feedRootHash)
      const tangles = populateTangles(tangleTemplates)
      const identityTangle = new DBTangle(opts.identity, records())
      const identityTips = [...identityTangle.getTips()]
      const fullOpts = { ...opts, tangles, identityTips, keypair }

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
        const encryptionFormat = /** @type {EncryptionFormat} */ (
          encryptionFormats.get(opts.encryptionFormat ?? '')
        )
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

  /**
   * @param {string} id
   * @param {string} findDomain
   */
  function getFeedId(id, findDomain) {
    const findIdentity = MsgV2.stripIdentity(id)
    for (const rec of records()) {
      if (rec.msg && MsgV2.isFeedRoot(rec.msg, findIdentity, findDomain)) {
        return rec.hash
      }
    }
    return null
  }

  /**
   * @param {string} msgId
   */
  function getRecord(msgId) {
    // TODO: improve performance of this when getting many messages, the arg
    // could be an array of hashes, so we can do a single pass over the records.
    const isUri = msgId.startsWith('ppppp:')
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i]
      if (!rec) continue
      if (isUri && rec.hash && msgId.endsWith(rec.hash)) return rec
      else if (!isUri && rec.hash === msgId) return rec
    }
    return null
  }

  /**
   * @param {string} msgId
   */
  function get(msgId) {
    return getRecord(msgId)?.msg
  }

  /**
   * @param {string} msgId
   * @param {CBVoid} cb
   */
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

  /**
   * @param {string} msgId
   * @param {CBVoid} cb
   */
  function erase(msgId, cb) {
    const rec = getRecord(msgId)
    if (!rec) return cb()
    if (!rec.msg) return cb()
    if (!rec.msg.data) return cb()
    recs[rec.misc.seq].msg = MsgV2.erase(rec.msg)
    // FIXME: persist this change to disk!! Not supported by AAOL yet
    cb()
  }

  /**
   * @param {string} tangleId
   * @returns {DBTangle}
   */
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
    identity: {
      create: createIdentity,
      add: addToIdentity,
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

exports.name = 'db'
exports.init = initDB
