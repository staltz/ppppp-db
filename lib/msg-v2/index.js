const crypto = require('node:crypto')
const base58 = require('bs58')
const b4a = require('b4a')
const stringify = require('json-canon')
const Keypair = require('ppppp-keypair')
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
 * @typedef {import('ppppp-keypair').Keypair} Keypair
 * @typedef {Buffer | Uint8Array} B4A
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
 * @typedef {Object} CreateOpts
 * @property {*} data
 * @property {string} type
 * @property {Keypair} keypair
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
  return b4a.from(stringify(opts.data), 'utf8')
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
 * @param {string} group
 * @param {string} type
 * @param {Keypair} keypair
 * @returns {Msg}
 */
function createRoot(group, type, keypair) {
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
function createGroup(keypair, nonce = base58.encode(crypto.randomBytes(32))) {
  return create({
    data: { add: keypair.public, nonce },
    group: null,
    groupTips: null,
    keypair,
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
  createGroup,
  erase,
  stripGroup,
  toPlaintextBuffer,
  fromPlaintextBuffer,
  Tangle,
  validate,
  validateBatch,
}
