const crypto = require('crypto')
const stringify = require('json-canon')
const ed25519 = require('ssb-keys/sodium')
const base58 = require('bs58')
const union = require('set.prototype.union')
const { stripGroup } = require('./strip')
const isFeedRoot = require('./is-feed-root')
const { getMsgId, getMsgHash } = require('./get-msg-id')
const representData = require('./represent-data')
const {
  validateType,
  validateData,
  validate,
  validateBatch,
  validateMsgHash,
} = require('./validation')
const Tangle = require('./tangle')

/**
 * @typedef {Iterator<Msg> & {values: () => Iterator<Msg>}} MsgIter
 */

/**
 * @typedef {Object} TangleMetadata
 * @property {number} depth
 * @property {Array<string>} prev
 */

/**
 * @typedef {Object} Msg
 * @property {*} data
 * @property {Object} metadata
 * @property {string} metadata.dataHash
 * @property {number} metadata.dataSize
 * @property {string | null} metadata.group
 * @property {Array<string> | null} metadata.groupTips
 * @property {Record<string, TangleMetadata>} metadata.tangles
 * @property {string} metadata.type
 * @property {2} metadata.v
 * @property {string} pubkey
 * @property {string} sig
 */

/**
 * @typedef {Object} Keys
 * @property {string} keys.id
 * @property {string} keys.private
 */

/**
 * @typedef {Object} CreateOpts
 * @property {*} data
 * @property {string} type
 * @property {Keys} keys
 * @property {string | null} group
 * @property {Array<string> | null} groupTips
 * @property {Record<string, Tangle>} tangles
 */

function getFeedRootHash(groupId, type) {
  const group = stripGroup(groupId)

  const msg = {
    data: null,
    metadata: {
      dataHash: null,
      dataSize: 0,
      group,
      groupTips: null,
      tangles: {},
      type,
      v: 2,
    },
    pubkey: '',
    sig: '',
  }

  return getMsgHash(msg)
}

function toPlaintextBuffer(opts) {
  return Buffer.from(stringify(opts.data), 'utf8')
}

/**
 * @param {CreateOpts} opts
 * @returns {Msg}
 */
function create(opts) {
  let err
  if ((err = validateType(opts.type))) throw err
  if (!opts.tangles) throw new Error('opts.tangles is required')

  const [dataHash, dataSize] = representData(opts.data)
  const group = opts.group ? stripGroup(opts.group) : null
  const groupTips = opts.groupTips ? opts.groupTips.sort() : null

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

  const msg = {
    data: opts.data,
    metadata: {
      dataHash,
      dataSize,
      group,
      groupTips,
      tangles,
      type: opts.type,
      v: 2,
    },
    pubkey: opts.keys.id,
    sig: '',
  }
  if ((err = validateData(msg))) throw err

  const privateKey = Buffer.from(opts.keys.private, 'base64')
  // TODO: add a label prefix to the metadata before signing
  const metadataBuf = Buffer.from(stringify(msg.metadata), 'utf8')
  // TODO: when signing, what's the point of a customizable hmac?
  const sigBuf = ed25519.sign(privateKey, metadataBuf)
  msg.sig = base58.encode(sigBuf)

  return msg
}

/**
 * @param {string} group
 * @param {string} type
 * @param {Keys} keys
 * @returns {Msg}
 */
function createRoot(group, type, keys) {
  let err
  if ((err = validateType(type))) throw err

  const msg = {
    data: null,
    metadata: {
      dataHash: null,
      dataSize: 0,
      group,
      groupTips: null,
      tangles: {},
      type,
      v: 2,
    },
    pubkey: keys.id,
    sig: '',
  }

  const privateKey = Buffer.from(keys.private, 'base64')
  // TODO: add a label prefix to the metadata before signing
  const metadataBuf = Buffer.from(stringify(msg.metadata), 'utf8')
  // TODO: when signing, what's the point of a customizable hmac?
  const sigBuf = ed25519.sign(privateKey, metadataBuf)
  msg.sig = base58.encode(sigBuf)

  return msg
}

/**
 * @param {Keys} keys
 * @param {string} nonce
 * @returns {Msg}
 */
function createGroup(keys, nonce = base58.encode(crypto.randomBytes(32))) {
  return create({
    data: { add: keys.id, nonce },
    group: null,
    groupTips: null,
    keys,
    tangles: {},
    type: 'group',
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
 * @param {Buffer} plaintextBuf
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
  createGroup,
  erase,
  stripGroup,
  toPlaintextBuffer,
  fromPlaintextBuffer,
  Tangle,
  validate,
  validateBatch,
}
