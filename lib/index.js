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
const Keypair = require('ppppp-keypair')
const MsgV3 = require('./msg-v3')
const {
  SIGNATURE_TAG_ACCOUNT_ADD,
  ACCOUNT_SELF,
} = require('./msg-v3/constants')
const { ReadyGate } = require('./utils')
const { decrypt } = require('./encryption')

/**
 * @typedef {import('ppppp-keypair').Keypair} Keypair
 * @typedef {import('ppppp-keypair').KeypairPublicSlice} KeypairPublicSlice
 * @typedef {import('ppppp-keypair').KeypairPrivateSlice} KeypairPrivateSlice
 * @typedef {import('./msg-v3').Msg} Msg
 * @typedef {import('./msg-v3').AccountData} AccountData
 * @typedef {import('./msg-v3').AccountPower} AccountPower
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

class DBTangle extends MsgV3.Tangle {
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
    const msgHash = MsgV3.getMsgHash(msg)

    // TODO: optimize this. Perhaps have a Map() of msgHash -> record
    // Or even better, a bloom filter. If you just want to answer no/perhaps.
    let rec
    if ((rec = getRecord(msgHash))) return cb(null, rec)
    else rec = { msg, hash: msgHash }

    // TODO: optimize this. This may be slow if you're adding many msgs in a
    // row, because it creates a new Map() each time. Perhaps with QuickLRU
    const tangle = new DBTangle(tangleRootHash, records())

    // Find which pubkeys are authorized to sign this msg given the account:
    const pubkeys = new Set()
    const accountID = getAccountID(rec)
    let accountTangle = /** @type {DBTangle | null} */ (null)
    if (accountID && !MsgV3.isRoot(msg)) {
      accountTangle = new DBTangle(accountID, records())
      if (!accountTangle.has(accountID)) {
        // prettier-ignore
        return cb(new Error('add() failed because the account tangle is unknown'))
      }
      // TODO: prune the accountTangle beyond msg.metadata.accountTips
      for (const msgHash of accountTangle.topoSort()) {
        const msg = get(msgHash)
        if (!msg?.data) continue
        /** @type {AccountData} */
        const data = msg.data
        if (data.action !== 'add') continue
        if (data.add.key.purpose !== 'sig') continue
        if (data.add.key.algorithm !== 'ed25519') continue
        pubkeys.add(data.add.key.bytes)
      }
    }

    let err
    if ((err = MsgV3.validate(msg, tangle, pubkeys, msgHash, tangleRootHash))) {
      return cb(new Error('add() failed msg validation', { cause: err }))
    }

    // Account tangle related validations
    if (msg.metadata.account === ACCOUNT_SELF && accountTangle) {
      /** @type {AccountData} */
      const data = msg.data
      if (data.action === 'add') {
        // Does this msg.pubkey have the "add" power?
        const keypair = { curve: 'ed25519', public: msg.pubkey }
        const powers = getAccountPowers(accountTangle, keypair)
        if (!powers.has('add')) {
          // prettier-ignore
          return cb(new Error('add() failed because this msg.pubkey does not have "add" power'))
        }
      }
      // TODO validate 'del'
    }

    logAppend(msgHash, msg, (err, rec) => {
      if (err) return cb(new Error('add() failed in the log', { cause: err }))
      onRecordAdded.set(rec)
      cb(null, rec)
    })
  }

  /**
   * @param {{ keypair?: Keypair; account: string; domain: string; }} opts
   * @param {CB<string>} cb
   */
  function initializeFeed(opts, cb) {
    const keypair = opts.keypair ?? config.keypair
    const { account, domain } = opts

    const feedRootHash = getFeedId(account, domain)
    if (feedRootHash) return cb(null, feedRootHash)

    const feedRoot = MsgV3.createRoot(account, domain, keypair)
    add(feedRoot, MsgV3.getMsgHash(feedRoot), (err, rec) => {
      // prettier-ignore
      if (err) return cb(new Error('initializeFeed() failed to add root', { cause: err }));
      const recHash = /** @type {string} */ (rec.hash)
      cb(null, recHash)
    })
  }

  /**
   * Public the account ID from the given record.
   *
   * @param {Pick<RecPresent, 'msg' | 'hash'>} rec
   * @returns {string | null}
   */
  function getAccountID(rec) {
    if (!rec.msg) return null
    if (rec.msg.metadata.account === ACCOUNT_SELF) {
      for (const tangleId in rec.msg.metadata.tangles) {
        return tangleId
      }
      return rec.hash
    } else if (rec.msg.metadata.account) {
      return rec.msg.metadata.account
    } else {
      return null
    }
  }

  /**
   * Find the account that contains this `keypair` (or the implicit
   * config.keypair) under the given `domain`.
   *
   * @public
   * @param {{
   *   keypair?: KeypairPublicSlice;
   *   domain: string;
   * }} opts
   * @param {CB<string>} cb
   */
  function findAccount(opts, cb) {
    // prettier-ignore
    if (!opts.domain) return cb(new Error('account.find() requires a `domain`'))
    const keypair = opts?.keypair ?? config.keypair
    const domain = opts.domain

    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i]
      if (!rec) continue
      if (!rec.msg) continue
      if (!rec.msg.data) continue
      if (rec.msg.metadata.account !== ACCOUNT_SELF) continue
      if (rec.msg.metadata.domain !== domain) continue
      const data = /** @type {AccountData} */ (rec.msg.data)
      if (data.action === 'add' && data.add.key.bytes === keypair.public) {
        const accountId = getAccountID(rec)
        if (accountId) {
          cb(null, accountId)
        } else {
          // prettier-ignore
          cb(new Error(`account.find() failed to find ID in ${JSON.stringify(rec.msg)}`))
        }
        return
      }
    }
    // prettier-ignore
    const err = new Error(`account.find() failed for pubkey=${keypair.public} domain=${domain}`, { cause: 'ENOENT' });
    cb(err)
  }

  /**
   * Does this `account` have this `keypair` (or the implicit config.keypair)?
   *
   * @public
   * @param {{
   *   keypair?: KeypairPublicSlice;
   *   account: string;
   * }} opts
   * @returns {boolean}
   */
  function accountHas(opts) {
    const keypair = opts?.keypair ?? config.keypair

    const accountTangle = new DBTangle(opts.account, records())
    for (const msgHash of accountTangle.topoSort()) {
      const msg = get(msgHash)
      if (!msg?.data) continue
      /** @type {AccountData} */
      const data = msg.data
      if (data.action !== 'add') continue
      if (data.add.key.algorithm !== keypair.curve) continue
      if (data.add.key.bytes === keypair.public) {
        return true
      }
    }
    return false
  }

  /**
   * Create an account (root msg) for the given `keypair` (or the implicit
   * config.keypair) under this `domain`.
   *
   * @public
   * @param {{
   *   keypair?: Keypair,
   *   domain: string,
   *   _nonce?: string
   * }} opts
   * @param {CB<string>} cb
   */
  function createAccount(opts, cb) {
    // prettier-ignore
    if (!opts.domain) return cb(new Error('account.create() requires a `domain`'))
    const keypair = opts?.keypair ?? config.keypair
    const domain = opts.domain

    let msg
    try {
      msg = MsgV3.createAccount(keypair, domain, opts?._nonce)
    } catch (err) {
      return cb(new Error('account.create() failed', { cause: err }))
    }
    const msgHash = MsgV3.getMsgHash(msg)

    logAppend(msgHash, msg, (err, rec) => {
      // prettier-ignore
      if (err) return cb(new Error('account.create() failed in the log', { cause: err }))
      onRecordAdded.set(rec)
      const recHash = /** @type {string} */ (rec.hash)
      cb(null, recHash)
    })
  }

  /**
   * Find or create an account (root msg) for the given `keypair` (or the
   * implicit config.keypair) under this `domain`.
   *
   * @public
   * @param {{
   *   keypair?: Keypair,
   *   domain: string,
   *   _nonce?: string
   * }} opts
   * @param {CB<string>} cb
   */
  function findOrCreateAccount(opts, cb) {
    findAccount(opts, (err, accountID) => {
      if (err?.cause === 'ENOENT') {
        createAccount(opts, cb)
      } else if (err) {
        cb(err)
      } else {
        cb(null, accountID)
      }
    })
  }

  /**
   * @param {DBTangle} accountTangle
   * @param {KeypairPublicSlice} keypair
   * @returns {Set<AccountPower>}
   */
  function getAccountPowers(accountTangle, keypair) {
    const powers = new Set()
    for (const msgHash of accountTangle.topoSort()) {
      const msg = get(msgHash)
      if (!msg?.data) continue
      /** @type {AccountData} */
      const data = msg.data
      if (data.action !== 'add') continue
      if (data.add.key.algorithm !== keypair.curve) continue
      if (data.add.key.bytes !== keypair.public) continue
      if (data.add.powers) {
        for (const power of data.add.powers) {
          powers.add(power)
        }
      }
    }
    return powers
  }

  /**
   * Create a consent signature for the given `keypair` (or the implicit
   * config.keypair) to be added to the given `account`.
   *
   * @public
   * @param {{
   *   keypair?: KeypairPrivateSlice;
   *   account: string;
   * }} opts
   * @returns {string}
   */
  function consentToAccount(opts) {
    // prettier-ignore
    if (!opts.account) throw new Error('account.consent() requires an `account`')
    const keypair = opts?.keypair ?? config.keypair

    const signableBuf = b4a.from(
      SIGNATURE_TAG_ACCOUNT_ADD + base58.decode(opts.account),
      'utf8'
    )
    return Keypair.sign(keypair, signableBuf)
  }

  /**
   * Add the given `keypair` (or the implicit config.keypair) to the given
   * `account`, authorized by the given `consent` (or implicitly created on the
   * fly if the `keypair` contains the private key) with the following `powers`
   * (defaulting to no powers).
   *
   * @param {{
   *   account: string;
   *   powers?: Array<AccountPower>;
   *   _disobey?: true;
   * } & ({
   *   keypair: KeypairPublicSlice & {private?: never};
   *   consent: string;
   * } | {
   *   keypair: Keypair;
   *   consent?: never;
   * })} opts
   * @param {CB<Rec>} cb
   */
  function addToAccount(opts, cb) {
    if (!opts) return cb(new Error('account.add() requires an `opts`'))
    // prettier-ignore
    if (!opts.account) return cb(new Error('account.add() requires a `account`'))
    // prettier-ignore
    if (!opts.keypair) return cb(new Error('account.add() requires a `keypair`'))
    // prettier-ignore
    if (!opts.keypair.public) return cb(new Error('account.add() requires a `keypair` with `public`'))
    let consent = /** @type {string} */ (opts.consent)
    if (typeof opts.consent === 'undefined') {
      if (opts.keypair.private) {
        consent = consentToAccount(opts)
      } else {
        return cb(new Error('account.add() requires a `consent`'))
      }
    }
    const obeying = !opts._disobey
    const addedKeypair = opts.keypair
    const signingKeypair = config.keypair

    // Verify consent:
    const signableBuf = b4a.from(
      SIGNATURE_TAG_ACCOUNT_ADD + base58.decode(opts.account)
    )
    if (obeying && !Keypair.verify(addedKeypair, signableBuf, consent)) {
      // prettier-ignore
      return cb(new Error('account.add() failed because the consent is invalid'))
    }

    // Verify powers of the signingKeypair:
    const accountTangle = new DBTangle(opts.account, records())
    if (obeying) {
      const signingPowers = getAccountPowers(accountTangle, signingKeypair)
      if (!signingPowers.has('add')) {
        // prettier-ignore
        return cb(new Error('account.add() failed because the signing keypair does not have the "add" power'))
      }
    }

    // Verify input powers for the addedKeypair:
    if (obeying && opts.powers) {
      if (!Array.isArray(opts.powers)) {
        // prettier-ignore
        return cb(new Error('account.add() failed because opts.powers is not an array'))
      }
      for (const power of opts.powers) {
        if (power !== 'add' && power !== 'del' && power !== 'box') {
          // prettier-ignore
          return cb(new Error(`account.add() failed because opts.powers contains an unknown power "${power}"`))
        }
        // TODO check against duplicates
      }
    }

    const accountRoot = get(opts.account)
    if (!accountRoot) {
      // prettier-ignore
      return cb(new Error(`account.add() failed because the account root "${opts.account}" is unknown`))
    }

    /** @type {AccountData} */
    const data = {
      action: 'add',
      add: {
        key: {
          purpose: 'sig',
          algorithm: 'ed25519',
          bytes: addedKeypair.public,
        },
        consent,
      },
    }
    if (opts.powers) data.add.powers = opts.powers

    // Fill-in tangle opts:
    const fullOpts = {
      account: ACCOUNT_SELF,
      accountTips: null,
      tangles: {
        [opts.account]: accountTangle,
      },
      keypair: signingKeypair,
      data,
      domain: accountRoot.metadata.domain,
    }

    // Create the actual message:
    let msg
    try {
      msg = MsgV3.create(fullOpts)
    } catch (err) {
      return cb(new Error('account.add() failed', { cause: err }))
    }
    const msgHash = MsgV3.getMsgHash(msg)

    logAppend(msgHash, msg, (err, rec) => {
      // prettier-ignore
      if (err) return cb(new Error('account.add() failed to append the log', { cause: err }))
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
   *   account: string;
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
    if (!opts.account)
      return cb(new Error('feed.publish() requires a `account`'))

    initializeFeed(opts, (err, feedRootHash) => {
      // prettier-ignore
      if (err) return cb(new Error('feed.publish() failed to initialize feed', { cause: err }));

      // Fill-in tangle opts:
      const tangleTemplates = opts.tangles ?? []
      tangleTemplates.push(feedRootHash)
      const tangles = populateTangles(tangleTemplates)
      const accountTangle = new DBTangle(opts.account, records())
      const accountTips = [...accountTangle.getTips()]
      const fullOpts = { ...opts, tangles, accountTips, keypair }

      // If opts ask for encryption, encrypt and put ciphertext in opts.data
      const recps = fullOpts.data.recps
      if (Array.isArray(recps) && recps.length > 0) {
        const plaintext = MsgV3.toPlaintextBuffer(fullOpts)
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
        msg = MsgV3.create(fullOpts)
      } catch (err) {
        return cb(new Error('feed.publish() failed', { cause: err }))
      }
      const msgHash = MsgV3.getMsgHash(msg)

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
    const findAccount = MsgV3.stripAccount(id)
    for (const rec of records()) {
      if (rec.msg && MsgV3.isFeedRoot(rec.msg, findAccount, findDomain)) {
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
    recs[rec.misc.seq].msg = MsgV3.erase(rec.msg)
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
    account: {
      find: findAccount,
      create: createAccount,
      findOrCreate: findOrCreateAccount,
      add: addToAccount,
      consent: consentToAccount,
      has: accountHas,
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
