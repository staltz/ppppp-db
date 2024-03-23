const crypto = require('crypto')
const base58 = require('bs58')
const b4a = require('b4a')
// @ts-ignore
const stringify = require('json-canon')
const Keypair = require('ppppp-keypair')
// @ts-ignore
const union = require('set.prototype.union')
const { stripAccount } = require('./strip')
const isMoot = require('./is-moot')
const { getMsgID } = require('./get-msg-id')
const representData = require('./represent-data')
const {
  validateDomain,
  validateData,
  validate,
  validateShape,
  validateMsgID,
} = require('./validation')
const Tangle = require('./tangle')
const {
  ACCOUNT_SELF,
  ACCOUNT_ANY,
  SIGNATURE_TAG_MSG_V4,
} = require('./constants')
const { isEmptyObject } = require('./util')

/**
 * @typedef {import('ppppp-keypair').Keypair} Keypair
 */

/**
 * @template [T=any]
 * @typedef {{
 *   data: T;
 *   metadata: {
 *     dataHash: string | null;
 *     dataSize: number;
 *     account: string | (typeof ACCOUNT_SELF) | (typeof ACCOUNT_ANY);
 *     accountTips: Array<string> | null;
 *     tangles: {
 *       [tangleID in string]: TangleMetadata
 *     };
 *     domain: string;
 *     v: 4;
 *   };
 *   sigkey: string;
 *   sig: string;
 * }} Msg
 */

/**
 * @template [T=any]
 * @typedef {{
 *   data: T;
 *   metadata: {
 *     dataHash: string;
 *     dataSize: number;
 *     account: string;
 *     accountTips: Array<string>;
 *     tangles: {
 *       [tangleID in string]: TangleMetadata
 *     };
 *     domain: string;
 *     v: 4;
 *   };
 *   sigkey: string;
 *   sig: string;
 * }} FeedMsg
 */

/**
 * @typedef {Iterator<Msg> & {values: () => Iterator<Msg>}} MsgIter
 *
 * @typedef {Buffer | Uint8Array} B4A
 *
 * @typedef {{
 *   depth: number;
 *   prev: Array<string>;
 * }} TangleMetadata
 *
 * @typedef {AccountAdd | AccountDel} AccountData
 *
 * @typedef {'add' | 'del' | 'internal-encryption' | 'external-encryption'} AccountPower
 *
 * @typedef {{
 *   purpose: 'shs-and-sig';
 *   algorithm: 'ed25519';
 *   bytes: string;
 * }} ShsAndSigKey
 * @typedef {{
 *   purpose: 'sig';
 *   algorithm: 'ed25519';
 *   bytes: string;
 * }} SigKey
 * @typedef {{
 *   purpose: 'external-encryption';
 *   algorithm: 'x25519-xsalsa20-poly1305';
 *   bytes: string;
 * }} ExternalEncryptionKey;
 *
 * @typedef {ShsAndSigKey | SigKey | ExternalEncryptionKey} AccountKey
 *
 * @typedef {{
 *   action: 'add',
 *   key: AccountKey;
 *   nonce?: string;
 *   consent?: string;
 *   powers?: Array<AccountPower>;
 * }} AccountAdd
 *
 * @typedef {{
 *   action: 'del',
 *   key: AccountKey;
 * }} AccountDel
 *
 * @typedef {{
 *   data: any;
 *   domain: string;
 *   keypair: Keypair;
 *   account: string | (typeof ACCOUNT_SELF) | (typeof ACCOUNT_ANY);
 *   accountTips: Array<string> | null;
 *   tangles: {
 *     [tangleID in string]: Tangle
 *   };
 * }} CreateOpts
 */

/**
 * @param {string} id
 * @param {string} domain
 * @returns {string}
 */
function getMootID(id, domain) {
  /** @type {Msg} */
  const msg = {
    data: null,
    metadata: {
      dataHash: null,
      dataSize: 0,
      account: stripAccount(id),
      accountTips: null,
      tangles: {},
      domain,
      v: 4,
    },
    sigkey: '',
    sig: '',
  }

  return getMsgID(msg)
}

/**
 * @param {Pick<CreateOpts, 'data'>} opts
 * @returns {B4A}
 */
function toPlaintextBuffer(opts) {
  return b4a.from(stringify(opts.data), 'utf8')
}

/**
 * @param {CreateOpts} opts
 * @returns {Msg}
 */
function create(opts) {
  let err
  if ((err = validateDomain(opts.domain))) throw err
  if (!opts.tangles) throw new Error('opts.tangles is required')

  const [dataHash, dataSize] = representData(opts.data)
  const account = opts.account
  const accountTips = opts.accountTips ? opts.accountTips.sort() : null

  const tangles = /** @type {Msg['metadata']['tangles']} */ ({})
  for (const rootID in opts.tangles) {
    if ((err = validateMsgID(rootID))) throw err
    const tangle = opts.tangles[rootID]
    const depth = tangle.maxDepth + 1
    const lipmaaSet = tangle.getLipmaaSet(depth)
    const prev = [...union(lipmaaSet, tangle.tips)].sort()
    tangles[rootID] = { depth, prev }
  }

  /** @type {Msg} */
  const msg = {
    data: opts.data,
    metadata: {
      dataHash,
      dataSize,
      account,
      accountTips,
      tangles,
      domain: opts.domain,
      v: 4,
    },
    sigkey: opts.keypair.public,
    sig: '',
  }
  if ((err = validateData(msg))) throw err

  const signableBuf = b4a.from(
    SIGNATURE_TAG_MSG_V4 + stringify(msg.metadata),
    'utf8'
  )
  msg.sig = Keypair.sign(opts.keypair, signableBuf)

  return msg
}

/**
 * @param {string} id
 * @param {string} domain
 * @param {Keypair} keypair
 * @returns {Msg}
 */
function createMoot(id, domain, keypair) {
  let err
  if ((err = validateDomain(domain))) throw err

  /** @type {Msg} */
  const msg = {
    data: null,
    metadata: {
      dataHash: null,
      dataSize: 0,
      account: id,
      accountTips: null,
      tangles: {},
      domain,
      v: 4,
    },
    sigkey: keypair.public,
    sig: '',
  }

  const signableBuf = b4a.from(
    SIGNATURE_TAG_MSG_V4 + stringify(msg.metadata),
    'utf8'
  )
  msg.sig = Keypair.sign(keypair, signableBuf)

  return msg
}

function getRandomNonce() {
  return base58.encode(crypto.randomBytes(32))
}

/**
 * @param {Keypair} keypair
 * @param {string} domain
 * @param {string | (() => string)} nonce
 * @returns {Msg}
 */
function createAccount(keypair, domain, nonce = getRandomNonce) {
  /** @type {AccountData} */
  const data = {
    action: 'add',
    key: {
      purpose: 'shs-and-sig',
      algorithm: 'ed25519',
      bytes: keypair.public,
    },
    nonce: typeof nonce === 'function' ? nonce() : nonce,
    powers: ['add', 'del', 'external-encryption', 'internal-encryption'],
  }

  return create({
    data,
    account: ACCOUNT_SELF,
    accountTips: null,
    keypair,
    tangles: {},
    domain,
  })
}

/**
 * @param {Msg} msg
 * @returns {Msg}
 */
function erase(msg) {
  return { ...msg, data: null }
}

/**
 * @param {B4A} plaintextBuf
 * @param {Msg} msg
 * @returns {Msg}
 */
function fromPlaintextBuffer(plaintextBuf, msg) {
  return { ...msg, data: JSON.parse(plaintextBuf.toString('utf-8')) }
}

/**
 * @param {Msg} msg
 */
function isRoot(msg) {
  return isEmptyObject(msg.metadata.tangles)
}

/**
 * @template T
 * @param {Msg<T>} msg
 * @returns {msg is FeedMsg<T>}
 */
function isFeedMsg(msg) {
  const { account, accountTips } = msg.metadata
  return Array.isArray(accountTips) && account !== 'self' && account !== 'any'
}

/**
 * @param {any} x
 * @returns {x is Msg}
 */
function isMsg(x) {
  return !validateShape(x)
}

module.exports = {
  isMsg,
  isMoot,
  isRoot,
  isFeedMsg,
  getMsgID,
  getMootID,
  create,
  createMoot,
  createAccount,
  erase,
  stripAccount,
  toPlaintextBuffer,
  fromPlaintextBuffer,
  Tangle,
  validate,
}
