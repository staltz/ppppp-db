const Path = require('path')
const promisify = require('promisify-4loc')
const b4a = require('b4a')
const base58 = require('bs58')
const Obz = require('obz')
const Keypair = require('ppppp-keypair')
const pull = require('pull-stream')
const p = require('node:util').promisify
const Log = require('./log')
const MsgV4 = require('./msg-v4')
const {
  SIGNATURE_TAG_ACCOUNT_ADD,
  ACCOUNT_SELF,
  ACCOUNT_ANY,
  ACCOUNT_DOMAIN_PREFIX,
} = require('./msg-v4/constants')
const Doneable = require('./utils/doneable')
const Ghosts = require('./ghosts')
const { decrypt } = require('./encryption')

/**
 * @typedef {import('ppppp-keypair').Keypair} Keypair
 * @typedef {import('ppppp-keypair').KeypairPublicSlice} KeypairPublicSlice
 * @typedef {import('ppppp-keypair').KeypairPrivateSlice} KeypairPrivateSlice
 * @typedef {string} MsgID
 * @typedef {import('./msg-v4').Msg} Msg
 * @typedef {import('./msg-v4').AccountData} AccountData
 * @typedef {import('./msg-v4').AccountPower} AccountPower
 * @typedef {import('./msg-v4/tangle')} Tangle
 * @typedef {import('./encryption').EncryptionFormat} EncryptionFormat
 * @typedef {Buffer | Uint8Array} B4A
 * @typedef {{global: {keypair: Keypair; path: string}}} ExpectedConfig
 * @typedef {{global: {keypair: Keypair; path?: string}}} Config
 * @typedef {{
 *   close: {
 *     (errOrEnd: boolean, cb?: CB<void>): void,
 *     hook(hookIt: (this: unknown, fn: any, args: any) => any): void
 *   };
 * }} Peer
 */

/**
 * @typedef {{
 *   id?: never;
 *   msg?: never;
 *   received?: never;
 * }} RecDeleted
 *
 * @typedef {{
 *   id: MsgID;
 *   msg: Msg;
 *   received: number;
 * }} RecInLog
 *
 * @typedef {{
 *   id: MsgID;
 *   msg: Msg;
 *   received: number;
 * }} RecPresent
 *
 * @typedef {{
 *   offset: number;
 *   size: number;
 *   seq: number;
 *   private?: boolean;
 *   originalData?: any;
 *   encryptionFormat?: string;
 * }} Misc
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

/**
 * @template T
 * @typedef {import('obz').Obz<T>} Obz
 */

/**
 * @param {Config} config
 * @returns {asserts config is ExpectedConfig}
 */
function assertValidConfig(config) {
  if (typeof config.global?.path !== 'string') {
    throw new Error('db requires config.global.path')
  }
}

class DBTangle extends MsgV4.Tangle {
  /** @type {(msgID: MsgID, cb: CB<Msg>) => void} */
  #getMsg

  /**
   * @param {MsgID} rootID
   * @param {(msgID: MsgID, cb: CB<Msg>) => void} getMsg
   */
  constructor(rootID, getMsg) {
    super(rootID)
    this.#getMsg = getMsg
  }

  /**
   * @param {MsgID} rootID
   * @param {AsyncIterable<Rec>} recordsIter
   * @param {(msgID: MsgID, cb: any) => void} getMsg
   * @return {Promise<DBTangle>}
   */
  static async init(rootID, recordsIter, getMsg) {
    const dbtangle = new DBTangle(rootID, getMsg)
    for await (const rec of recordsIter) {
      if (!rec.msg) continue
      dbtangle.add(rec.id, rec.msg)
    }
    return dbtangle
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

  /**
   * @param {Array<string>=} minSet
   * @param {Array<string>=} maxSet
   * @param {CB<Array<Msg>>=} cb
   * @return {Promise<Array<Msg>>|void}
   */
  slice(minSet = [], maxSet = [], cb) {
    // @ts-ignore
    if (cb === undefined) return p(this.slice).bind(this)(minSet, maxSet)

    const minSetGood = minSet.filter((msgID) => this.has(msgID))
    const maxSetGood = maxSet.filter((msgID) => this.has(msgID))
    const minSetTight = this.getMinimumAmong(minSetGood)

    const trail = new Set()
    for (const msgID of minSetTight) {
      const path = this.shortestPathToRoot(msgID)
      for (const msgID of path) {
        trail.add(msgID)
      }
    }

    const msgs = /**@type {Array<Msg>}*/ ([])

    pull(
      pull.values(this.topoSort()),
      pull.asyncMap((msgID, cb) => {
        this.#getMsg(msgID, (err, msg) => {
          if (err) return cb(err)
          cb(null, { id: msgID, msg })
        })
      }),
      pull.drain(
        (rec) => {
          if (trail.has(rec.id)) {
            if (rec.msg) msgs.push({ ...rec.msg, data: null })
          }
          const isMin = minSetGood.includes(rec.id)
          const isMax = maxSetGood.includes(rec.id)
          const isBeforeMin = minSetGood.some((min) =>
            this.precedes(rec.id, min)
          )
          const isAfterMax = maxSetGood.some((max) =>
            this.precedes(max, rec.id)
          )
          if (!isMin && isBeforeMin) return
          if (!isMax && isAfterMax) return
          if (rec.msg) msgs.push(rec.msg)
        },
        (err) => {
          if (err) return cb(Error('DBTangle.slice() failed', { cause: err }))
          return cb(null, msgs)
        }
      )
    )
  }
}

/**
 * @param {Peer} peer
 * @param {Config} config
 */
function initDB(peer, config) {
  assertValidConfig(config)

  /** @type {Array<Rec | null>} */
  const recs = []
  /** @type {WeakMap<Rec, Misc>} */
  let miscRegistry = new WeakMap()
  /** @type {Map<MsgID, Doneable<RecPresent>>} */
  const msgsBeingAdded = new Map()
  /** @type {Map<string, EncryptionFormat>} */
  const encryptionFormats = new Map()
  /** @type {Obz<Rec>} */
  const onRecordAdded = Obz()
  /** @type {Obz<MsgID>} */
  const onRecordDeletedOrErased = Obz()

  const codec = {
    /**
     * @param {RecInLog} msg
     * @returns {B4A}
     */
    encode(msg) {
      return b4a.from(JSON.stringify(msg), 'utf8')
    },
    /**
     * @param {B4A} buf
     * @returns {RecInLog}
     */
    decode(buf) {
      return JSON.parse(b4a.toString(buf, 'utf8'))
    },
  }

  const log = Log(Path.join(config.global.path, 'db', 'log'), {
    blockSize: 64 * 1024,
    codec,
    /**
     * @param {B4A} buf
     */
    validateRecord(buf) {
      try {
        codec.decode(buf)
        return true
      } catch {
        return false
      }
    },
  })

  const ghosts = new Ghosts(Path.join(config.global.path, 'db', 'ghosts'))

  peer.close.hook(function hookToCloseDB(fn, args) {
    log.close(() => {
      fn.apply(this, args)
    })
  })

  const scannedLog = new Doneable()
  // setTimeout to let peer.db.* secret-stack become available
  // needed by decrypt()
  setTimeout(() => {
    let seq = -1
    log.scan(
      function scanEach(offset, recInLog, size) {
        seq += 1
        if (!recInLog) {
          // deleted record
          recs.push(null)
          return
        }
        // TODO: for performance, dont decrypt on startup, instead decrypt on
        // demand, or decrypt in the background. Or then store the log with
        // decrypted msgs and only encrypt when moving it to the network.
        /** @type {RecPresent} */
        const rec = decrypt(recInLog, peer, config)
        miscRegistry.set(rec, { offset, size, seq })
        recs.push(rec)
      },
      function scanEnd(err) {
        // prettier-ignore
        if (err) throw new Error('Failed to initially scan the log', { cause: err });
        scannedLog.done()
      }
    )
  })

  let rescanning = /** @type {Doneable<null>} */ new Doneable()
  rescanning.done()

  /**
   * @param {CB<void>} cb
   */
  function rescanLogPostCompaction(cb) {
    miscRegistry = new WeakMap()
    let seq = -1
    rescanning = new Doneable()
    log.scan(
      function rescanEach(offset, recInLog, size) {
        seq += 1
        if (!recInLog) {
          // deleted record
          recs[seq] = null
          return
        }
        const rec = decrypt(recInLog, peer, config)
        miscRegistry.set(rec, { offset, size, seq })
        recs[seq] = rec
      },
      function rescanEnd(err) {
        // prettier-ignore
        if (err) return cb(new Error('Failed to rescan the log after compaction', { cause: err }))
        recs.length = seq + 1
        rescanning.done()
        cb()
      },
      false // asRaw
    )
  }

  /**
   * @param {MsgID} id
   * @param {Msg} msg
   * @param {CB<RecPresent>} cb
   */
  function logAppend(id, msg, cb) {
    /** @type {RecInLog} */
    const recInLog = {
      id,
      msg,
      received: Date.now(),
    }
    log.append(recInLog, (err, offset) => {
      if (err) return cb(new Error('logAppend failed', { cause: err }))
      const size = b4a.from(JSON.stringify(recInLog), 'utf8').length
      const seq = recs.length
      // FIXME: where do we put originalData ???
      const recExposed = decrypt(recInLog, peer, config)
      const rec = /** @type {RecPresent} */ (recInLog)
      miscRegistry.set(rec, { offset, size, seq })
      recs.push(recExposed)
      cb(null, rec)
    })
  }

  /**
   * @param {EncryptionFormat} encryptionFormat
   */
  function installEncryptionFormat(encryptionFormat) {
    if (encryptionFormat.setup) {
      const loaded = new Doneable()
      encryptionFormat.setup(config, (/** @type {any} */ err) => {
        // prettier-ignore
        if (err) throw new Error(`Failed to install encryption format "${encryptionFormat.name}"`, {cause: err});
        loaded.done()
      })
      encryptionFormat.onReady = loaded.onDone.bind(loaded)
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
   * @param {CB<Record<MsgID, DBTangle>>} cb
   */
  function populateTangles(tangleIDs, cb) {
    /** @type {Record<MsgID, DBTangle>} */
    const tangles = {}
    pull(
      pull.values(tangleIDs),
      pull.asyncMap((tangleID, cb) => {
        DBTangle.init(tangleID, records(), get).then((dbtangle) => {
          tangles[tangleID] ??= dbtangle
          cb(null, null)
        })
      }),
      pull.drain(
        () => {},
        () => {
          return cb(null, tangles)
        }
      )
    )
  }

  /**
   * @param {Pick<RecPresent, 'id' | 'msg'>} rec
   * @param {(err: Error | null, tangle: DBTangle | null) => void} cb
   */
  function getAccountTangle(rec, cb) {
    const accountID = getAccountID(rec)
    if (accountID) {
      DBTangle.init(accountID, records(), get).then((accountTangle) => {
        if (rec.id === accountID) {
          accountTangle.add(rec.id, rec.msg)
        }
        if (!accountTangle.has(accountID)) {
          return cb(
            Error(`Account tangle "${accountID}" is locally unknown`),
            null
          )
        }
        return cb(null, accountTangle)
      })
    } else {
      return cb(null, null)
    }
  }

  /**
   * Find which sigkeys are authorized to sign this msg given the account.
   *
   * @private
   * @param {DBTangle | null} accountTangle
   * @param {Msg['metadata']['accountTips']} accountTipsInMsg
   * @param {CB<Set<string>>} cb
   */
  function getSigkeysInAccount(accountTangle, accountTipsInMsg, cb) {
    const sigkeys = new Set()
    if (!accountTangle) return cb(null, sigkeys)

    accountTangle.slice(
      undefined,
      accountTipsInMsg ?? undefined,
      (err, prunedTangle) => {
        if (err) return cb(err)

        for (const msg of prunedTangle) {
          if (!msg?.data) continue
          /** @type {AccountData} */
          const data = msg.data
          if (data.action === 'add') {
            const purpose = data.key?.purpose
            if (purpose !== 'sig' && purpose !== 'shs-and-sig') continue
            if (data.key.algorithm !== 'ed25519') continue
            sigkeys.add(data.key.bytes)
          } else if (data.action === 'del') {
            const purpose = data.key?.purpose
            if (purpose !== 'sig' && purpose !== 'shs-and-sig') continue
            if (data.key.algorithm !== 'ed25519') continue
            sigkeys.delete(data.key.bytes)
          }
        }
        return cb(null, sigkeys)
      }
    )
  }

  /**
   * @param {CB<void>} cb
   */
  function loaded(cb) {
    if (cb === void 0) return promisify(loaded)()
    return scannedLog.onDone(() => {
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
   * @param {(err: Error | null, val: null) => void} cb
   */
  function verifyRec(rec, tangleID, cb) {
    let err
    // TODO: optimize this. This may be slow if you're adding many msgs in a
    // row, because it creates a new Map() each time. Perhaps with QuickLRU
    DBTangle.init(tangleID, records(), get).then((tangle) => {
      if (rec.id === tangleID) {
        tangle.add(rec.id, rec.msg)
      }

      if (MsgV4.isMoot(rec.msg)) {
        const sigkeys = new Set()
        if (
          (err = MsgV4.validate(rec.msg, tangle, sigkeys, rec.id, tangleID))
        ) {
          return cb(Error('Invalid msg', { cause: err }), null)
        }
        return cb(null, null)
      }

      // Identify the account and its sigkeys:
      getAccountTangle(rec, (err, accountTangle) => {
        // prettier-ignore
        if (err) return cb(Error('Unknown account tangle owning this msg', { cause: err }), null)

        getSigkeysInAccount(
          accountTangle,
          rec.msg.metadata.accountTips,
          (err, sigkeys) => {
            if (err) return cb(err, null)

            // Don't accept ghosts to come back, unless they are trail msgs
            if (!!rec.msg.data && ghosts.read(tangleID).has(rec.id)) {
              return cb(Error('Refusing a ghost msg to come back'), null)
            }

            if (
              (err = MsgV4.validate(rec.msg, tangle, sigkeys, rec.id, tangleID))
            ) {
              return cb(Error('Invalid msg', { cause: err }), null)
            }

            /** @param {(err: Error | null, val: null) => void} cb */
            function verifyInner(cb) {
              // Unwrap encrypted inner msg and verify it too
              if (typeof rec.msg.data === 'string') {
                const recDecrypted = decrypt(rec, peer, config)
                if (MsgV4.isMsg(recDecrypted.msg.data)) {
                  const innerMsg = /** @type {Msg} */ (recDecrypted.msg.data)
                  const innerMsgID = MsgV4.getMsgID(innerMsg)
                  const innerRec = { id: innerMsgID, msg: innerMsg }

                  verifyRec(innerRec, innerMsgID, (err) => {
                    // prettier-ignore
                    if (err) return cb(Error('Failed to verify inner msg', { cause: err }), null)

                    return cb(null, null)
                  })
                } else {
                  return cb(null, null)
                }
              } else {
                return cb(null, null)
              }
            }

            // Account tangle related validations
            if (rec.msg.metadata.account === ACCOUNT_SELF) {
              const validAccountTangle = /** @type {Tangle} */ (accountTangle)
              validateAccountMsg(rec.msg, validAccountTangle, (err) => {
                if (err)
                  return cb(Error('Invalid account msg', { cause: err }), null)
                return verifyInner(cb)
              })
            } else {
              return verifyInner(cb)
            }
          }
        )
      })
    })
  }

  /**
   * @param {Pick<RecPresent, 'id' | 'msg'>} rec
   * @returns {MsgID}
   */
  function inferTangleID(rec) {
    if (MsgV4.isRoot(rec.msg)) return rec.id
    let tangleID = /**@type {string | null}*/ (null)
    for (const id in rec.msg.metadata.tangles) {
      if (tangleID) {
        // prettier-ignore
        throw new Error('Cannot infer tangleID in msg because it has more than one tangle', { cause: JSON.stringify(rec.msg) })
      } else {
        tangleID = id
      }
    }
    if (!tangleID) {
      throw new Error('Cannot infer tangleID in msg because it has no tangles')
    }
    return tangleID
  }

  /**
   * @param {string} msgID
   * @param {CB<void>} cb
   */
  function bypassPredelete(msgID, cb) {
    cb()
  }

  /**
   * @param {Msg} msg
   * @param {MsgID | null} tangleID
   * @param {CB<RecPresent>} cb
   */
  function add(msg, tangleID, cb) {
    const msgID = MsgV4.getMsgID(msg)

    if (msgsBeingAdded.has(msgID)) {
      msgsBeingAdded.get(msgID)?.onDone(cb)
      return
    }
    msgsBeingAdded.set(msgID, new Doneable())

    // TODO: optimize this. Perhaps have a Map() of msgID -> record
    // Or even better, a bloom filter. If you just want to answer no/perhaps.
    let maybePredelete = bypassPredelete
    getRecord(msgID, (err, gotRec) => {
      if (err) return cb(Error('getRecord() failed in add()', { cause: err }))
      let rec
      if (gotRec) {
        // If existing record is dataless but new is dataful, then delete
        if (gotRec.msg.data === null && msg.data !== null) {
          maybePredelete = del
          rec = { msg, id: msgID }
        } else {
          return cb(null, gotRec)
        }
      } else rec = { msg, id: msgID }

      const actualTangleID = tangleID ?? inferTangleID(rec)

      verifyRec(rec, actualTangleID, (err) => {
        if (err) {
          return cb(new Error('add() failed to verify msg', { cause: err }))
        }

        maybePredelete(msgID, (err) => {
          if (err)
            return cb(new Error('add() failed to predelete', { cause: err }))
          // The majority of cases don't have ghosts to be removed, but this
          // operation is silent and cheap if there are no ghosts.
          removeGhost(actualTangleID, msgID, (err) => {
            // prettier-ignore
            if (err) return cb(new Error('add() failed to remove ghost', { cause: err }))
            logAppend(msgID, msg, (err, rec) => {
              // prettier-ignore
              if (err) return cb(new Error('add() failed in the log', { cause: err }))
              const doneable = msgsBeingAdded.get(msgID)
              msgsBeingAdded.delete(msgID)
              queueMicrotask(() => {
                doneable?.done([null, rec])
                onRecordAdded.set(rec)
              })
              cb(null, rec)
            })
          })
        })
      })
    })
  }

  /**
   * @param {Msg} msg
   * @param {Tangle} accountTangle
   * @param {(err: Error | null, val: null) => void} cb
   */
  function validateAccountMsg(msg, accountTangle, cb) {
    if (!MsgV4.isRoot(msg)) {
      /** @type {AccountData} */
      const data = msg.data
      if (data.action === 'add') {
        // Does this msg.sigkey have the "add" power?
        const keypair = {
          curve: /** @type {const} */ ('ed25519'),
          public: msg.sigkey,
        }
        getAccountPowers(accountTangle, keypair, (err, powers) => {
          if (err) return cb(err, null)

          if (!powers.has('add')) {
            // prettier-ignore
            return cb(Error(`invalid account msg: sigkey "${msg.sigkey}" does not have "add" power`), null)
          }

          return cb(null, null)
        })
      } else {
        return cb(null, null)
      }
      // TODO validate 'del'
    } else {
      return cb(null, null)
    }
  }

  /**
   * @param {{ keypair?: Keypair; account: string; domain: string; }} opts
   * @param {CB<MsgID>} cb
   */
  function initializeFeed(opts, cb) {
    const keypair = opts.keypair ?? config.global.keypair
    const { account, domain } = opts

    findMoot(account, domain, (err, m) => {
      if (err) return cb(err)
      const mootID = m?.id
      if (mootID) return cb(null, mootID)

      const moot = MsgV4.createMoot(account, domain, keypair)
      add(moot, MsgV4.getMsgID(moot), (err, rec) => {
        // prettier-ignore
        if (err) return cb(new Error('initializeFeed() failed to add root', { cause: err }));
        cb(null, rec.id)
      })
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
   * config.global.keypair) under the given `subdomain` (will be converted to
   * an actual msg domain).
   *
   * @public
   * @param {{
   *   keypair?: KeypairPublicSlice;
   *   subdomain: string;
   * }} opts
   * @param {CB<string>} cb
   */
  function findAccount(opts, cb) {
    // prettier-ignore
    if (!opts.subdomain) return cb(new Error('account.find() requires a `subdomain`'))
    const keypair = opts?.keypair ?? config.global.keypair
    const domain = ACCOUNT_DOMAIN_PREFIX + opts.subdomain

    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i]
      if (!rec) continue
      if (!rec.msg) continue
      if (!rec.msg.data) continue
      if (rec.msg.metadata.account !== ACCOUNT_SELF) continue
      if (rec.msg.metadata.domain !== domain) continue
      const data = /** @type {AccountData} */ (rec.msg.data)
      if (data.action === 'add' && data.key.bytes === keypair.public) {
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
    const err = new Error(`account.find() failed for sigkey=${keypair.public} subdomain=${opts.subdomain}`, { cause: 'ENOENT' });
    cb(err)
  }

  /**
   * Does this `account` have this `keypair` (or the implicit
   * config.global.keypair)?
   *
   * @public
   * @param {{
   *   keypair?: KeypairPublicSlice;
   *   account: string;
   * }} opts
   * @param {(err: Error | null, has: boolean | null) => void} cb
   */
  function accountHas(opts, cb) {
    const keypair = opts?.keypair ?? config.global.keypair

    DBTangle.init(opts.account, records(), get).then((accountTangle) => {
      pull(
        pull.values(accountTangle.topoSort()),
        pull.asyncMap((msgID, cb) => {
          get(msgID, (err, msg) => {
            // prettier-ignore
            if (err) return cb(Error("db.account.has() failed to get() account tangle message", { cause: err }), null)

            if (!msg?.data) return cb(null, false)
            /** @type {AccountData} */
            const data = msg.data
            if (data.action !== 'add') return cb(null, false)
            if (data.key.algorithm !== keypair.curve) return cb(null, false)
            if (data.key.bytes === keypair.public) {
              return cb(null, true)
            }
            return cb(null, false)
          })
        }),
        pull.collect((err, results) => {
          // prettier-ignore
          if (err) return cb(Error('db.account.has() failed to calculate', { cause: err }), null)

          return cb(
            null,
            results.some((res) => res === true)
          )
        })
      )
    })
  }

  /**
   * Create an account (root msg) for the given `keypair` (or the implicit
   * config.global.keypair) under the given `subdomain` (will be converted to an
   * actual msg domain).
   *
   * @public
   * @param {{
   *   keypair?: Keypair,
   *   subdomain: string,
   *   _nonce?: string
   * }} opts
   * @param {CB<string>} cb
   */
  function createAccount(opts, cb) {
    // prettier-ignore
    if (!opts.subdomain) return cb(new Error('account.create() requires a `subdomain`'))
    const keypair = opts?.keypair ?? config.global.keypair
    const domain = ACCOUNT_DOMAIN_PREFIX + opts.subdomain

    let msg
    try {
      msg = MsgV4.createAccount(keypair, domain, opts?._nonce)
    } catch (err) {
      return cb(new Error('account.create() failed', { cause: err }))
    }
    const msgID = MsgV4.getMsgID(msg)

    logAppend(msgID, msg, (err, rec) => {
      // prettier-ignore
      if (err) return cb(new Error('account.create() failed in the log', { cause: err }))
      queueMicrotask(() => onRecordAdded.set(rec))
      cb(null, rec.id)
    })
  }

  /**
   * Find or create an account (root msg) for the given `keypair` (or the
   * implicit config.global.keypair) under the given `domain` (will be converted
   * to an actual msg domain).
   *
   * @public
   * @param {{
   *   keypair?: Keypair,
   *   subdomain: string,
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

  //* @param {(err: Error | null, val: Set<any> | null) => void} cb
  /**
   * @param {Tangle} accountTangle
   * @param {KeypairPublicSlice} keypair
   * @param {CB<Set<AccountPower>>} cb
   */
  function getAccountPowers(accountTangle, keypair, cb) {
    const powers = new Set()
    pull(
      pull.values(accountTangle.topoSort()),
      pull.asyncMap((msgID, cb) => {
        get(msgID, (err, msg) => {
          // prettier-ignore
          if (err) return cb(Error("getAccountPowers() failed to get() account tangle message", { cause: err }))
          if (!msg?.data) return cb(null, null)
          /** @type {AccountData} */
          const data = msg.data
          if (data.action !== 'add') return cb(null, null)
          if (data.key.algorithm !== keypair.curve) return cb(null, null)
          if (data.key.bytes !== keypair.public) return cb(null, null)
          if (data.powers) {
            for (const power of data.powers) {
              powers.add(power)
            }
          }
          cb(null, null)
        })
      }),
      pull.drain(
        () => {},
        (err) => {
          if (err)
            return cb(Error('Failed getting account powers', { cause: err }))
          cb(null, powers)
        }
      )
    )
  }

  /**
   * Create a consent signature for the given `keypair` (or the implicit
   * config.global.keypair) to be added to the given `account`.
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
    const keypair = opts?.keypair ?? config.global.keypair

    const signableBuf = b4a.from(
      SIGNATURE_TAG_ACCOUNT_ADD + base58.decode(opts.account),
      'utf8'
    )
    return Keypair.sign(keypair, signableBuf)
  }

  /**
   * Add the given `keypair` to the
   * given `account`, authorized by the given `consent` (or implicitly created
   * on the fly if the `keypair` contains the private key) with the specified
   * `powers` (defaulting to no powers).
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
    const signingKeypair = config.global.keypair

    // Verify consent:
    const signableBuf = b4a.from(
      SIGNATURE_TAG_ACCOUNT_ADD + base58.decode(opts.account)
    )
    if (obeying && !Keypair.verify(addedKeypair, signableBuf, consent)) {
      // prettier-ignore
      return cb(new Error('account.add() failed because the consent is invalid'))
    }

    // Verify powers of the signingKeypair:
    DBTangle.init(opts.account, records(), get).then((accountTangle) => {
      getAccountPowers(accountTangle, signingKeypair, (err, signingPowers) => {
        if (err) return cb(err)

        if (obeying && !signingPowers.has('add')) {
          // prettier-ignore
          return cb(new Error('account.add() failed because the signing keypair does not have the "add" power'))
        }

        // Verify input powers for the addedKeypair:
        if (obeying && opts.powers) {
          if (!Array.isArray(opts.powers)) {
            // prettier-ignore
            return cb(new Error('account.add() failed because opts.powers is not an array'))
          }
          for (const power of opts.powers) {
            if (
              power !== 'add' &&
              power !== 'del' &&
              power !== 'external-encryption' &&
              power !== 'internal-encryption'
            ) {
              // prettier-ignore
              return cb(new Error(`account.add() failed because opts.powers contains an unknown power "${power}"`))
            }
            // TODO check against duplicates
          }
        }

        get(opts.account, (err, accountRoot) => {
          // prettier-ginore
          if (err)
            return cb(
              Error('account.add() failed to get() account root', {
                cause: err,
              })
            )

          if (!accountRoot) {
            // prettier-ignore
            return cb(new Error(`account.add() failed because the account root "${opts.account}" is unknown`))
          }

          /** @type {AccountData} */
          const data = {
            action: 'add',
            key: {
              purpose: 'sig',
              algorithm: 'ed25519',
              bytes: addedKeypair.public,
            },
            consent,
          }
          if (opts.powers) data.powers = opts.powers

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
            msg = MsgV4.create(fullOpts)
          } catch (err) {
            return cb(new Error('account.add() failed', { cause: err }))
          }
          const msgID = MsgV4.getMsgID(msg)

          logAppend(msgID, msg, (err, rec) => {
            // prettier-ignore
            if (err) return cb(new Error('account.add() failed to append the log', { cause: err }))
            queueMicrotask(() => onRecordAdded.set(rec))
            cb(null, rec)
          })
        })
      })
    })
  }

  /**
   * Remove the given `keypair` from
   * the given `account`.
   *
   * @param {{
   *   account: string;
   *   keypair: KeypairPublicSlice;
   * }} opts
   * @param {CB<RecPresent>} cb
   */
  function delFromAccount(opts, cb) {
    if (!opts) return cb(new Error('account.del() requires an `opts`'))
    // prettier-ignore
    if (!opts.account) return cb(new Error('account.del() requires a `account`'))
    // prettier-ignore
    if (!opts.keypair) return cb(new Error('account.del() requires a `keypair`'))
    // prettier-ignore
    if (!opts.keypair.public) return cb(new Error('account.del() requires a `keypair` with `public`'))

    const deldKeypair = opts.keypair
    const signingKeypair = config.global.keypair

    // Verify powers of the signingKeypair:
    DBTangle.init(opts.account, records(), get).then((accountTangle) => {
      getAccountPowers(accountTangle, signingKeypair, (err, signingPowers) => {
        if (err) return cb(err)

        if (!signingPowers.has('del')) {
          // prettier-ignore
          return cb(new Error('account.del() failed because the signing keypair does not have the "del" power'))
        }

        get(opts.account, (err, accountRoot) => {
          if (err)
            return cb(
              Error('account.del() failed to get() account root', {
                cause: err,
              })
            )
          if (!accountRoot) {
            // prettier-ignore
            return cb(new Error(`account.del() failed because the account root "${opts.account}" is unknown`))
          }

          let msg
          try {
            msg = MsgV4.create({
              account: ACCOUNT_SELF,
              accountTips: null,
              domain: accountRoot.metadata.domain,
              keypair: signingKeypair,
              tangles: {
                [opts.account]: accountTangle,
              },
              data: {
                action: 'del',
                key: {
                  purpose: 'sig',
                  algorithm: 'ed25519',
                  bytes: deldKeypair.public,
                },
              },
            })
          } catch (err) {
            return cb(new Error('account.del() failed', { cause: err }))
          }
          const msgID = MsgV4.getMsgID(msg)

          logAppend(msgID, msg, (err, rec) => {
            // prettier-ignore
            if (err) return cb(new Error('account.del() failed to append the log', { cause: err }))
            queueMicrotask(() => onRecordAdded.set(rec))
            cb(null, rec)
          })
        })
      })
    })
  }

  /**
   * @param {{
   *   keypair?: Keypair;
   *   encryptionFormat?: string;
   *   data: Record<string, any>;
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

    const keypair = opts.keypair ?? config.global.keypair
    initializeFeed(opts, (err, mootID) => {
      // prettier-ignore
      if (err) return cb(new Error('feed.publish() failed to initialize feed', { cause: err }));

      // Fill-in tangle opts:
      const tangleTemplates = opts.tangles ?? []
      tangleTemplates.push(mootID)
      populateTangles(tangleTemplates, (err, tangles) => {
        if (err) return cb(err)
        DBTangle.init(opts.account, records(), get).then((accountTangle) => {
          const accountTips = [...accountTangle.tips]
          /**@type {MsgV4.CreateOpts}*/
          const fullOpts = { ...opts, tangles, accountTips, keypair }

          // If opts ask for encryption, encrypt and put ciphertext in opts.data
          const recps = fullOpts.data.recps
          if (Array.isArray(recps) && recps.length > 0) {
            const plaintext = MsgV4.toPlaintextBuffer(fullOpts)
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
            msg = MsgV4.create(fullOpts)
          } catch (err) {
            // prettier-ignore
            return cb(new Error('feed.publish() failed to create message', { cause: err }))
          }
          const msgID = MsgV4.getMsgID(msg)

          // Encode the native message and append it to the log:
          logAppend(msgID, msg, (err, rec) => {
            // prettier-ignore
            if (err) return cb(new Error('feed.publish() failed to append the log', { cause: err }))
            queueMicrotask(() => onRecordAdded.set(rec))
            cb(null, rec)
          })
        })
      })
    })
  }

  /**
   * @param {string} accountId
   * @param {string} domain
   * @param {(err: Error | null, rec: RecPresent | null) => void} cb
   */
  function findMoot(accountId, domain, cb) {
    const findAccount = MsgV4.stripAccount(accountId)

    new Promise(async (res) => {
      for await (const rec of records()) {
        if (rec.msg && MsgV4.isMoot(rec.msg, findAccount, domain)) {
          return res(rec)
        }
      }
      return res(null)
    }).then((value) => cb(null, value))
  }

  /**
   * @param {MsgID} msgID
   * @param {(err: Error | null, rec: RecPresent | null) => void} cb
   */
  function getRecord(msgID, cb) {
    // TODO: improve performance of this when getting many messages, the arg
    // could be an array of hashes, so we can do a single pass over the records.
    rescanning.onDone(() => {
      const isUri = msgID.startsWith('ppppp:')
      for (let i = 0; i < recs.length; i++) {
        const rec = recs[i]
        if (!rec) continue
        if (isUri && rec.id && msgID.endsWith(rec.id)) return cb(null, rec)
        else if (!isUri && rec.id === msgID) return cb(null, rec)
      }
      return cb(null, null)
    })
  }

  /**
   * @param {MsgID} msgID
   * @param {(err: Error | null, msg?: Msg) => void} cb
   */
  function get(msgID, cb) {
    getRecord(msgID, (err, rec) => {
      // prettier-ignore
      if (err) return cb(Error("Failed to getRecord() when get()ting message", { cause: err }))
      return cb(null, rec?.msg)
    })
  }

  /**
   * @param {MsgID} msgID
   * @param {CB<void>} cb
   */
  function del(msgID, cb) {
    getRecord(msgID, (err, rec) => {
      // prettier-ignore
      if (err) return cb(Error("Couldn't getRecord when del()eting it", { cause: err }))
      if (!rec) return cb()
      if (!rec.msg) return cb()
      rescanning.onDone(() => {
        const misc = miscRegistry.get(rec)
        const seq = misc?.seq ?? -1
        const offset = misc?.offset ?? -1
        if (seq === -1) {
          return cb(new Error('del() failed to find record in miscRegistry'))
        }
        recs[seq] = null
        log.onDrain(() => {
          log.del(offset, (err) => {
            // prettier-ignore
            if (err) return cb(new Error('del() failed to write to disk', { cause: err }))
            queueMicrotask(() => onRecordDeletedOrErased.set(msgID))
            cb()
          })
        })
      })
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
    const { tangleID, msgID, span } = opts
    getRecord(msgID, (err, rec) => {
      if (err)
        return cb(
          Error('Failed to getRecord() in ghosts.add()', { cause: err })
        )
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
    getRecord(msgID, (err, rec) => {
      if (err) return cb(Error('erase() failed to getRecord()', { cause: err }))
      if (!rec) return cb()
      if (!rec.msg) return cb()
      if (!rec.msg.data) return cb()
      rec.msg = MsgV4.erase(rec.msg)
      const misc = miscRegistry.get(rec)
      const seq = misc?.seq ?? -1
      const offset = misc?.offset ?? -1
      if (seq === -1) {
        return cb(new Error('erase() failed to find record in miscRegistry'))
      }
      recs[seq] = rec
      log.onDrain(() => {
        log.overwrite(offset, rec, (err) => {
          // prettier-ignore
          if (err) return cb(new Error('erase() failed to write to disk', { cause: err }))
          queueMicrotask(() => onRecordDeletedOrErased.set(msgID))
          cb()
        })
      })
    })
  }

  /**
   * @param {MsgID} tangleID
   * @param {(err: Error | null, tangle: DBTangle | null) => void} cb
   */
  function getTangle(tangleID, cb) {
    DBTangle.init(tangleID, records(), get).then((tangle) => {
      if (tangle.size > 0) {
        return cb(null, tangle)
      } else {
        return cb(null, null)
      }
    })
  }

  async function* msgs() {
    await p(rescanning.onDone).bind(rescanning)()

    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i]
      if (rec?.msg) yield rec.msg
    }
  }

  async function* records() {
    await p(rescanning.onDone).bind(rescanning)()

    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i]
      if (rec) yield rec
    }
  }

  /** @type {CB<void>} */
  function logError(err) {
    if (err) console.error(err)
  }

  /**
   * @param {CB<void>} cb
   */
  function compact(cb) {
    cb ??= logError
    log.compact((err) => {
      // prettier-ignore
      if (err) return cb?.(err)
      rescanLogPostCompaction(cb)
    })
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
      del: delFromAccount,
      consent: consentToAccount,
      has: accountHas,
    },
    feed: {
      publish: publishToFeed,
      getID: MsgV4.getMootID,
      findMoot,
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
    onRecordDeletedOrErased,
    getTangle,
    msgs,
    records,
    log: {
      stats: log.stats.bind(log),
      compact,
    },

    // internal
    findEncryptionFormatFor,

    // used by tests
    _getLog: () => log,
  }
}

exports.name = 'db'
exports.init = initDB
