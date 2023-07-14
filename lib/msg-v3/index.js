const crypto = require('node:crypto')
const base58 = require('bs58')
const b4a = require('b4a')
// @ts-ignore
const stringify = require('json-canon')
const Keypair = require('ppppp-keypair')
// @ts-ignore
const union = require('set.prototype.union')
const { stripIdentity } = require('./strip')
const isFeedRoot = require('./is-feed-root')
const { getMsgId, getMsgHash } = require('./get-msg-id')
const representData = require('./represent-data')
const {
  validateDomain,
  validateData,
  validate,
  validateMsgHash,
} = require('./validation')
const Tangle = require('./tangle')
const { IDENTITY_SELF, SIGNATURE_TAG_MSG_V3 } = require('./constants')

/**
 * @typedef {import('ppppp-keypair').Keypair} Keypair
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
 * @typedef {{
 *   data: any;
 *   metadata: {
 *     dataHash: string | null;
 *     dataSize: number;
 *     identity: string | (typeof IDENTITY_SELF) | null;
 *     identityTips: Array<string> | null;
 *     tangles: Record<string, TangleMetadata>;
 *     domain: string;
 *     v: 3;
 *   };
 *   pubkey: string;
 *   sig: string;
 * }} Msg
 *
 * @typedef {{
 *   action: 'add', add: IdentityAdd
 * } | {
 *   action: 'del', del: IdentityDel
 * }} IdentityData
 *
 * @typedef {{
 *   key: IdentityKey;
 *   nonce?: string;
 *   consent?: string;
 * }} IdentityAdd
 *
 * @typedef {{
 *   key: IdentityKey;
 * }} IdentityDel
 *
 * @typedef {{
 *   purpose: 'sig';
 *   algorithm: 'ed25519';
 *   bytes: string;
 * }} SigKey
 *
 * @typedef {{
 *   purpose: 'subidentity';
 *   algorithm: 'tangle';
 *   bytes: string;
 * }} SubidentityKey;
 *
 * @typedef {{
 *   purpose: 'box';
 *   algorithm: 'x25519-xsalsa20-poly1305';
 *   bytes: string;
 * }} BoxKey;
 *
 * @typedef {SigKey | SubidentityKey | BoxKey} IdentityKey
 *
 * @typedef {{
 *   data: any;
 *   domain: string;
 *   keypair: Keypair;
 *   identity: string | null;
 *   identityTips: Array<string> | null;
 *   tangles: Record<string, Tangle>;
 * }} CreateOpts
 */

/**
 * @param {string} id
 * @param {string} domain
 * @returns {string}
 */
function getFeedRootHash(id, domain) {
  /** @type {Msg} */
  const msg = {
    data: null,
    metadata: {
      dataHash: null,
      dataSize: 0,
      identity: stripIdentity(id),
      identityTips: null,
      tangles: {},
      domain,
      v: 3,
    },
    pubkey: '',
    sig: '',
  }

  return getMsgHash(msg)
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
  const identity = opts.identity ? stripIdentity(opts.identity) : null
  const identityTips = opts.identityTips ? opts.identityTips.sort() : null

  const tangles = /** @type {Msg['metadata']['tangles']} */ ({})
  if (opts.tangles) {
    for (const rootId in opts.tangles) {
      if ((err = validateMsgHash(rootId))) throw err
      const tangle = opts.tangles[rootId]
      const depth = tangle.getMaxDepth() + 1
      const tips = tangle.getTips()
      const lipmaaSet = tangle.getLipmaaSet(depth)
      const prev = [...union(lipmaaSet, tips)].sort()
      tangles[rootId] = { depth, prev }
    }
  } else {
    // prettier-ignore
    throw new Error(`cannot create msg without tangles, that's the case for createRoot()`)
  }

  /** @type {Msg} */
  const msg = {
    data: opts.data,
    metadata: {
      dataHash,
      dataSize,
      identity,
      identityTips,
      tangles,
      domain: opts.domain,
      v: 3,
    },
    pubkey: opts.keypair.public,
    sig: '',
  }
  if ((err = validateData(msg))) throw err

  const signableBuf = b4a.from(
    SIGNATURE_TAG_MSG_V3 + stringify(msg.metadata),
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
function createRoot(id, domain, keypair) {
  let err
  if ((err = validateDomain(domain))) throw err

  /** @type {Msg} */
  const msg = {
    data: null,
    metadata: {
      dataHash: null,
      dataSize: 0,
      identity: id,
      identityTips: null,
      tangles: {},
      domain,
      v: 3,
    },
    pubkey: keypair.public,
    sig: '',
  }

  const signableBuf = b4a.from(
    SIGNATURE_TAG_MSG_V3 + stringify(msg.metadata),
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
function createIdentity(keypair, domain, nonce = getRandomNonce) {
  /** @type {IdentityData} */
  const data = {
    action: 'add',
    add: {
      key: {
        purpose: 'sig',
        algorithm: 'ed25519',
        bytes: keypair.public,
      },
      nonce: typeof nonce === 'function' ? nonce() : nonce,
    },
  }

  return create({
    data,
    identity: IDENTITY_SELF,
    identityTips: null,
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

module.exports = {
  getMsgHash,
  getMsgId,
  isFeedRoot,
  getFeedRootHash,
  create,
  createRoot,
  createIdentity,
  erase,
  stripIdentity,
  toPlaintextBuffer,
  fromPlaintextBuffer,
  Tangle,
  validate,
}
