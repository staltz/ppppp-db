const crypto = require('node:crypto')
const base58 = require('bs58')
const b4a = require('b4a')
const stringify = require('json-canon')
const Keypair = require('ppppp-keypair')
const union = require('set.prototype.union')
const { stripIdentity } = require('./strip')
const isFeedRoot = require('./is-feed-root')
const { getMsgId, getMsgHash } = require('./get-msg-id')
const representData = require('./represent-data')
const {
  validateDomain,
  validateData,
  validate,
  validateBatch,
  validateMsgHash,
} = require('./validation')
const Tangle = require('./tangle')

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
 *     identity: string | null;
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
 *   data: any;
 *   domain: string;
 *   keypair: Keypair;
 *   identity: string | null;
 *   identityTips: Array<string> | null;
 *   tangles: Record<string, Tangle>;
 * }} CreateOpts
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

  const tangles = {}
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

  // TODO: add a label prefix to the metadata before signing
  const metadataBuf = b4a.from(stringify(msg.metadata), 'utf8')
  msg.sig = Keypair.sign(opts.keypair, metadataBuf)

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

  // TODO: add a label prefix to the metadata before signing
  const metadataBuf = b4a.from(stringify(msg.metadata), 'utf8')
  msg.sig = Keypair.sign(keypair, metadataBuf)

  return msg
}

/**
 * @param {Keypair} keypair
 * @param {string} nonce
 * @returns {Msg}
 */
function createIdentity(
  keypair,
  nonce = () => base58.encode(crypto.randomBytes(32))
) {
  const actualNonce = typeof nonce === 'function' ? nonce() : nonce
  return create({
    data: { add: keypair.public, nonce: actualNonce },
    identity: null,
    identityTips: null,
    keypair,
    tangles: {},
    domain: 'identity',
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
  validateBatch,
}
