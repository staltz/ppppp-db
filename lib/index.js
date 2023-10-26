const Path = require('path')
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
  ACCOUNT_ANY,
} = require('./msg-v3/constants')
const ReadyGate = require('./utils/ready-gate')
const Ghosts = require('./ghosts')
const { decrypt } = require('./encryption')

/**
 * @typedef {import('ppppp-keypair').Keypair} Keypair
 * @typedef {import('ppppp-keypair').KeypairPublicSlice} KeypairPublicSlice
 * @typedef {import('ppppp-keypair').KeypairPrivateSlice} KeypairPrivateSlice
 * @typedef {string} MsgID
 * @typedef {import('./msg-v3').Msg} Msg
 * @typedef {import('./msg-v3').AccountData} AccountData
 * @typedef {import('./msg-v3').AccountPower} AccountPower
 * @typedef {import('./encryption').EncryptionFormat} EncryptionFormat
 * @typedef {import('./msg-v3/tangle')} Tangle
 *
 * @typedef {Buffer | Uint8Array} B4A
 */

/**
 * @typedef {{
 *   id?: never;
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
 *   id: MsgID;
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
 * @typedef {T extends void ?
 *   (...args: [Error] | []) => void :
 *   (...args: [Error] | [null, T]) => void
 * } CB
 */

class DBTangle extends MsgV3.Tangle {
  /**
   * @param {MsgID} rootID
   * @param {Iterable<Rec>} recordsIter
   */
  constructor(rootID, recordsIter) {
    super(rootID)
    for (const rec of recordsIter) {
      if (!rec.msg) continue
      this.add(rec.id, rec.msg)
    }
  }

  /**
   * Given a set of msgs (`msgIDs`) in this tangle, find all "deletable" and
   * "erasable" msgs that precede that set.
   *
   * *Deletables* are msgs that precede `msgsIDs` but are not important in any
   * validation path toward the root, and thus can be deleted.
   *
   * *Erasables* are msgs that precede `msgsIDs` and can be erased without
   * losing a validation path toward the root.
   * @param {Array<MsgID>} msgIDs
   * @returns {{ deletables: Set<MsgID>, erasables: Set<MsgID> }}
   */
  getDeletablesAndErasables(...msgIDs) {
    // Determine erasables
    const erasables = new Set()
    const minimum = this.getMinimumAmong(msgIDs)
    for (const msgID of minimum) {
      const trail = this.shortestPathToRoot(msgID)
      for (const id of trail) {
        erasables.add(id)
      }
    }

    // Determine deletables
    const deletables = new Set()
    const sorted = this.topoSort()
    for (const msgID of sorted) {
      if (erasables.has(msgID)) continue
      if (minimum.some((min) => this.precedes(msgID, min))) {
        deletables.add(msgID)
      }
    }

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

  const log = AAOL(Path.join(config.path, 'db.bin'), {
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

  const ghosts = new Ghosts(Path.join(config.path, 'ghosts'))

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
   * @param {MsgID} id
   * @param {Msg} msg
   * @param {CB<RecPresent>} cb
   */
  function logAppend(id, msg, cb) {
    /** @type {RecPresent} */
    const rec = {
      id,
      msg,
      received: Date.now(),
      misc: {
        offset: 0,
        size: 0,
        seq: 0,
      },
    }
    log.append(rec, (/** @type {any} */ err, /** @type {number} */ offset) => {
      if (err) return cb(new Error('logAppend failed', { cause: err }))
      const size = b4a.from(JSON.stringify(rec), 'utf8').length
      const seq = recs.length
      const recExposed = decrypt(rec, peer, config)
      rec.misc = recExposed.misc = { offset, size, seq }
      recs.push(recExposed)
      cb(null, rec)
    })
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
   * @param {Array<MsgID>} tangleIDs
   */
  function populateTangles(tangleIDs) {
    /** @type {Record<MsgID, DBTangle>} */
    const tangles = {}
    for (const tangleID of tangleIDs) {
      tangles[tangleID] ??= new DBTangle(tangleID, records())
    }
    return tangles
  }

  /**
   * @param {Pick<RecPresent, 'id' | 'msg'>} rec
   * @returns {Tangle | null}
   */
  function getAccountTangle(rec) {
    const accountID = getAccountID(rec)
    let accountTangle = /** @type {Tangle | null} */ (null)
    if (accountID) {
      accountTangle = new DBTangle(accountID, records())
      if (rec.id === accountID) {
        accountTangle.add(rec.id, rec.msg)
      }
      if (!accountTangle.has(accountID)) {
        throw new Error(`Account tangle "${accountID}" is locally unknown`)
      }
    }
    return accountTangle
  }

  /**
   * Find which pubkeys are authorized to sign this msg given the account.
   *
   * @private
   * @param {Tangle | null} accountTangle
   * @returns {Set<string>}
   */
  function getPubkeysInAccount(accountTangle) {
    const pubkeys = new Set()
    if (!accountTangle) return pubkeys
    // TODO: prune the accountTangle beyond msg.metadata.accountTips
    for (const msgID of accountTangle.topoSort()) {
      const msg = get(msgID)
      if (!msg?.data) continue
      /** @type {AccountData} */
      const data = msg.data
      if (data.action !== 'add') continue
      if (data.add.key.purpose !== 'sig') continue
      if (data.add.key.algorithm !== 'ed25519') continue
      pubkeys.add(data.add.key.bytes)
    }
    return pubkeys
  }

  /**
   * @param {CB<void>} cb
   */
  function loaded(cb) {
    if (cb === void 0) return promisify(loaded)()
    scannedLog.onReady(() => {
      ghosts.onReady(cb)
    })
  }

  /**
   * Checks whether the given `rec` can correctly fit into the log, validating
   * the msg in relation to the given `tangleID`, and whether the account is
   * locally known.
   *
   * @param {Pick<RecPresent, 'id' | 'msg'>} rec
   * @param {MsgID} tangleID
   * @returns {Error | null}
   */
  function verifyRec(rec, tangleID) {
    // TODO: optimize this. This may be slow if you're adding many msgs in a
    // row, because it creates a new Map() each time. Perhaps with QuickLRU
    const tangle = new DBTangle(tangleID, records())
    if (rec.id === tangleID) {
      tangle.add(rec.id, rec.msg)
    }

    // Identify the account and its pubkeys:
    /** @type {Tangle | null} */
    let accountTangle
    try {
      accountTangle = getAccountTangle(rec)
    } catch (err) {
      return new Error('Unknown account tangle owning this msg', { cause: err })
    }
    const pubkeys = getPubkeysInAccount(accountTangle)

    // Don't accept ghosts to come back, unless they are trail msgs
    if (!!rec.msg.data && ghosts.read(tangleID).has(rec.id)) {
      return new Error('Refusing a ghost msg to come back')
    }

    let err
    if ((err = MsgV3.validate(rec.msg, tangle, pubkeys, rec.id, tangleID))) {
      return new Error('Invalid msg', { cause: err })
    }

    // Account tangle related validations
    if (rec.msg.metadata.account === ACCOUNT_SELF) {
      const validAccountTangle = /** @type {Tangle} */ (accountTangle)
      if ((err = validateAccountMsg(rec.msg, validAccountTangle))) {
        return new Error('Invalid account msg', { cause: err })
      }
    }

    // Unwrap encrypted inner msg and verify it too
    if (typeof rec.msg.data === 'string') {
      const recDecrypted = decrypt(rec, peer, config)
      if (MsgV3.isMsg(recDecrypted.msg.data)) {
        const innerMsg = /** @type {Msg} */ (recDecrypted.msg.data)
        const innerMsgID = MsgV3.getMsgID(innerMsg)
        const innerRec = { id: innerMsgID, msg: innerMsg }
        try {
          verifyRec(innerRec, innerMsgID)
        } catch (err) {
          return new Error('Failed to verify inner msg', { cause: err })
        }
      }
    }

    return null
  }

  /**
   * @param {Msg} msg
   * @param {MsgID} tangleID
   * @param {CB<RecPresent>} cb
   */
  function add(msg, tangleID, cb) {
    const msgID = MsgV3.getMsgID(msg)

    // TODO: optimize this. Perhaps have a Map() of msgID -> record
    // Or even better, a bloom filter. If you just want to answer no/perhaps.
    let rec
    if ((rec = getRecord(msgID))) return cb(null, rec)
    else rec = { msg, id: msgID }

    let err
    if ((err = verifyRec(rec, tangleID))) {
      return cb(new Error('add() failed to verify msg', { cause: err }))
    }

    // The majority of cases don't have ghosts to be removed, but this operation
    // is silent and cheap if there are no ghosts.
    removeGhost(tangleID, msgID, (err) => {
      // prettier-ignore
      if (err) return cb(new Error('add() failed to remove ghost', { cause: err }))
      logAppend(msgID, msg, (err, rec) => {
        if (err) return cb(new Error('add() failed in the log', { cause: err }))
        onRecordAdded.set(rec)
        cb(null, rec)
      })
    })
  }

  /**
   * @param {Msg} msg
   * @param {Tangle} accountTangle
   * @returns {string | undefined}
   */
  function validateAccountMsg(msg, accountTangle) {
    if (!MsgV3.isRoot(msg)) {
      /** @type {AccountData} */
      const data = msg.data
      if (data.action === 'add') {
        // Does this msg.pubkey have the "add" power?
        const keypair = {
          curve: /** @type {const} */ ('ed25519'),
          public: msg.pubkey,
        }
        const powers = getAccountPowers(accountTangle, keypair)
        if (!powers.has('add')) {
          // prettier-ignore
          return `invalid account msg: pubkey "${msg.pubkey}" does not have "add" power`
        }
      }
      // TODO validate 'del'
    }
  }

  /**
   * @param {{ keypair?: Keypair; account: string; domain: string; }} opts
   * @param {CB<MsgID>} cb
   */
  function initializeFeed(opts, cb) {
    const keypair = opts.keypair ?? config.keypair
    const { account, domain } = opts

    const mootID = findMoot(account, domain)
    if (mootID) return cb(null, mootID)

    const moot = MsgV3.createMoot(account, domain, keypair)
    add(moot, MsgV3.getMsgID(moot), (err, rec) => {
      // prettier-ignore
      if (err) return cb(new Error('initializeFeed() failed to add root', { cause: err }));
      cb(null, rec.id)
    })
  }

  /**
   * Public the account ID from the given record.
   *
   * @param {Pick<RecPresent, 'msg' | 'id'>} rec
   * @returns {string | null}
   */
  function getAccountID(rec) {
    if (rec.msg.metadata.account === ACCOUNT_SELF) {
      for (const tangleID in rec.msg.metadata.tangles) {
        return tangleID
      }
      return rec.id
    } else if (rec.msg.metadata.account === ACCOUNT_ANY) {
      return null
    } else {
      return rec.msg.metadata.account
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
        const accountID = getAccountID(rec)
        if (accountID) {
          cb(null, accountID)
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
    for (const msgID of accountTangle.topoSort()) {
      const msg = get(msgID)
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
    const msgID = MsgV3.getMsgID(msg)

    logAppend(msgID, msg, (err, rec) => {
      // prettier-ignore
      if (err) return cb(new Error('account.create() failed in the log', { cause: err }))
      onRecordAdded.set(rec)
      cb(null, rec.id)
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
   * @param {Tangle} accountTangle
   * @param {KeypairPublicSlice} keypair
   * @returns {Set<AccountPower>}
   */
  function getAccountPowers(accountTangle, keypair) {
    const powers = new Set()
    for (const msgID of accountTangle.topoSort()) {
      const msg = get(msgID)
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
   * @param {CB<RecPresent>} cb
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
    const msgID = MsgV3.getMsgID(msg)

    logAppend(msgID, msg, (err, rec) => {
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
   *   tangles?: Array<MsgID>;
   * }} opts
   * @param {CB<RecPresent>} cb
   */
  function publishToFeed(opts, cb) {
    if (!opts) return cb(new Error('feed.publish() requires an `opts`'))
    // prettier-ignore
    if (!opts.account) return cb(new Error('feed.publish() requires an `account`'))
    if (!opts.domain) return cb(new Error('feed.publish() requires a `domain`'))
    if (!opts.data) return cb(new Error('feed.publish() requires a `data`'))
    if (opts.keypair) {
      const keypair = opts.keypair
      // prettier-ignore
      if (!keypair.curve) return cb(new Error('feed.publish() requires a `keypair` with `curve`', { cause: keypair }))
      // prettier-ignore
      if (!keypair.public) return cb(new Error('feed.publish() requires a `keypair` with `public`', { cause: keypair }))
      // prettier-ignore
      if (!keypair.private) return cb(new Error('feed.publish() requires a `keypair` with `private`', { cause: keypair }))
    }
    if (opts.tangles) {
      const tangles = opts.tangles
      // prettier-ignore
      if (!Array.isArray(tangles)) return cb(new Error('feed.publish() "tangles" option must be an array', { cause: tangles }))
      // prettier-ignore
      if (tangles.some(id => typeof id !== 'string')) return cb(new Error('feed.publish() "tangles" option should only have string IDs', { cause: tangles }))
    }
    if (opts.data.recps) {
      if (!encryptionFormats.has(opts.encryptionFormat ?? '')) {
        // prettier-ignore
        return cb(new Error(`feed.publish() does not support encryption format "${opts.encryptionFormat}"`))
      }
    }

    const keypair = opts.keypair ?? config.keypair
    initializeFeed(opts, (err, mootID) => {
      // prettier-ignore
      if (err) return cb(new Error('feed.publish() failed to initialize feed', { cause: err }));

      // Fill-in tangle opts:
      const tangleTemplates = opts.tangles ?? []
      tangleTemplates.push(mootID)
      const tangles = populateTangles(tangleTemplates)
      const accountTangle = new DBTangle(opts.account, records())
      const accountTips = [...accountTangle.tips]
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
        // prettier-ignore
        return cb(new Error('feed.publish() failed to create message', { cause: err }))
      }
      const msgID = MsgV3.getMsgID(msg)

      // Encode the native message and append it to the log:
      logAppend(msgID, msg, (err, rec) => {
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
  function findMoot(id, findDomain) {
    const findAccount = MsgV3.stripAccount(id)
    for (const rec of records()) {
      if (rec.msg && MsgV3.isMoot(rec.msg, findAccount, findDomain)) {
        return rec.id
      }
    }
    return null
  }

  /**
   * @param {MsgID} msgID
   * @returns {RecPresent | null}
   */
  function getRecord(msgID) {
    // TODO: improve performance of this when getting many messages, the arg
    // could be an array of hashes, so we can do a single pass over the records.
    const isUri = msgID.startsWith('ppppp:')
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i]
      if (!rec) continue
      if (isUri && rec.id && msgID.endsWith(rec.id)) return rec
      else if (!isUri && rec.id === msgID) return rec
    }
    return null
  }

  /**
   * @param {MsgID} msgID
   */
  function get(msgID) {
    return getRecord(msgID)?.msg
  }

  /**
   * @param {MsgID} msgID
   * @param {CB<void>} cb
   */
  function del(msgID, cb) {
    const rec = getRecord(msgID)
    if (!rec) return cb()
    if (!rec.msg) return cb()
    const { offset, size, seq } = rec.misc
    recs[rec.misc.seq] = { misc: { offset, size, seq } }
    log.onDrain(() => {
      log.del(offset, cb)
    })
  }

  /**
   * @param {{ tangleID: MsgID; msgID: MsgID; span: number; }} opts
   * @param {CB<void>} cb
   */
  function addGhost(opts, cb) {
    if (!opts) return cb(new Error('ghosts.add() requires an `opts`'))
    // prettier-ignore
    if (!opts.tangleID || typeof opts.tangleID !== 'string') return cb(new Error('ghosts.add() requires tangleID for the deleted msg in `opts.tangleID`'))
    // prettier-ignore
    if (!opts.msgID || typeof opts.msgID !== 'string') return cb(new Error('ghosts.add() requires msgID of the deleted msg in `opts.msgID`'))
    // prettier-ignore
    if (!opts.span || typeof opts.span !== 'number') return cb(new Error('ghosts.add() requires span in `opts.span`'))
    const { tangleID, msgID, span} = opts
    const rec = getRecord(msgID)
    if (!rec) return cb()
    if (!rec.msg) return cb()
    const tangleData = rec.msg.metadata.tangles[tangleID]
    // prettier-ignore
    if (!tangleData) return cb(new Error(`ghosts.add() opts.msg "${opts.msgID}" does not belong to opts.tangle "${opts.tangleID}"`))
    const depth = tangleData.depth

    ghosts.save(tangleID, msgID, depth, span, (err) => {
      // prettier-ignore
      if (err) cb(new Error('ghosts.add() failed to save to disk', { cause: err }))
      else cb()
    })
  }

  /**
   * @param {MsgID} tangleID
   * @param {MsgID} msgID
   * @param {CB<void>} cb
   */
  function removeGhost(tangleID, msgID, cb) {
    // prettier-ignore
    if (typeof tangleID !== 'string') return cb(new Error('ghosts.remove() requires tangleID in the 1st arg'))
    // prettier-ignore
    if (typeof msgID !== 'string') return cb(new Error('ghosts.remove() requires msgID in the 2nd arg'))

    ghosts.remove(tangleID, msgID, (err) => {
      // prettier-ignore
      if (err) cb(new Error('ghosts.remove() failed to save to disk', { cause: err }))
      else cb()
    })
  }

  /**
   * @param {MsgID} tangleID
   * @returns {Array<string>}
   */
  function getGhosts(tangleID) {
    const map = ghosts.read(tangleID)
    return [...map.keys()]
  }

  /**
   * @param {MsgID} tangleID
   * @returns {number}
   */
  function getMinGhostDepth(tangleID) {
    const map = ghosts.read(tangleID)
    let minDepth = Infinity
    for (const depth of map.values()) {
      if (depth < minDepth) minDepth = depth
    }
    return minDepth
  }

  /**
   * @param {MsgID} msgID
   * @param {CB<void>} cb
   */
  function erase(msgID, cb) {
    const rec = getRecord(msgID)
    if (!rec) return cb()
    if (!rec.msg) return cb()
    if (!rec.msg.data) return cb()
    recs[rec.misc.seq].msg = MsgV3.erase(rec.msg)
    // FIXME: persist this change to disk!! Not supported by AAOL yet
    cb()
  }

  /**
   * @param {MsgID} tangleID
   * @returns {DBTangle}
   */
  function getTangle(tangleID) {
    return new DBTangle(tangleID, records())
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

  /**
   * @param {CB<{ totalBytes: number; deletedBytes: number }>} cb
   */
  function logStats(cb) {
    log.stats(cb)
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
      getID: findMoot,
    },
    getRecord,
    get,
    del,
    erase,
    ghosts: {
      add: addGhost,
      get: getGhosts,
      getMinDepth: getMinGhostDepth,
    },
    onRecordAdded,
    getTangle,
    msgs,
    records,
    logStats,

    // internal
    findEncryptionFormatFor,

    // used by tests
    _getLog: () => log,
  }
}

exports.name = 'db'
exports.init = initDB
