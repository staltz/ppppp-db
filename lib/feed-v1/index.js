// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const stringify = require('fast-json-stable-stringify')
const ed25519 = require('ssb-keys/sodium')
const base58 = require('bs58')
const union = require('set.prototype.union')
const { stripAuthor } = require('./strip')
const { getMsgId, getMsgHash } = require('./get-msg-id')
const representContent = require('./represent-content')
const {
  validateType,
  validateContent,
  validate,
  validateBatch,
  validateMsgHash,
} = require('./validation')
const Tangle = require('./tangle')

function isEmptyObject(obj) {
  for (const _key in obj) {
    return false
  }
  return true
}

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
 * @property {*} content
 * @property {Object} metadata
 * @property {string} metadata.hash
 * @property {number} metadata.size
 * @property {Record<string, TangleMetadata>} metadata.tangles
 * @property {string} metadata.type
 * @property {1} metadata.v
 * @property {string} metadata.who
 * @property {string} sig
 */

/**
 * @typedef {Object} Keys
 * @property {string} keys.id
 * @property {string} keys.private
 */

/**
 * @typedef {Object} CreateOpts
 * @property {*} content
 * @property {string} type
 * @property {Keys} keys
 * @property {Record<string, Tangle>} tangles
 */

/**
 * @typedef {Object} CreateRootOpts
 * @property {string} type
 * @property {Keys} keys
 * @property {string} keys.id
 * @property {string} keys.private
 */

function isFeedRoot(msg, authorId, findType) {
  const findWho = stripAuthor(authorId)
  const { who, type, tangles } = msg.metadata
  return who === findWho && type === findType && isEmptyObject(tangles)
}

function getFeedRootHash(authorId, type) {
  const who = stripAuthor(authorId)

  const msg = {
    content: null,
    metadata: {
      hash: null,
      size: 0,
      tangles: {},
      type,
      v: 1,
      who,
    },
    sig: '',
  }

  return getMsgHash(msg)
}

function toPlaintextBuffer(opts) {
  return Buffer.from(stringify(opts.content), 'utf8')
}

/**
 * @param {CreateOpts} opts
 * @returns {Msg}
 */
function create(opts) {
  let err
  if ((err = validateType(opts.type))) throw err
  if (!opts.tangles) throw new Error('opts.tangles is required')

  const [hash, size] = representContent(opts.content)

  const tangles = {}
  if (opts.tangles) {
    for (const rootId in opts.tangles) {
      if ((err = validateMsgHash(rootId))) throw err
      const tangle = opts.tangles[rootId]
      const depth = tangle.getMaxDepth() + 1
      const tips = tangle.getTips()
      const lipmaaSet = tangle.getLipmaaSet(depth)
      const prev = ([...union(lipmaaSet, tips)]).sort()
      tangles[rootId] = { depth, prev }
    }
  } else {
    // prettier-ignore
    throw new Error(`cannot create msg without tangles, that's the case for createRoot()`)
  }

  const msg = {
    content: opts.content,
    metadata: {
      hash,
      size,
      tangles,
      type: opts.type,
      v: 1,
      who: stripAuthor(opts.keys.id),
    },
    sig: '',
  }
  if ((err = validateContent(msg))) throw err

  const privateKey = Buffer.from(opts.keys.private, 'base64')
  // TODO: add a label prefix to the metadata before signing
  const metadataBuf = Buffer.from(stringify(msg.metadata), 'utf8')
  // TODO: when signing, what's the point of a customizable hmac?
  const sigBuf = ed25519.sign(privateKey, metadataBuf)
  msg.sig = base58.encode(sigBuf)

  return msg
}

/**
 * @param {Keys} keys
 * @param {string} type
 * @returns {Msg}
 */
function createRoot(keys, type) {
  let err
  if ((err = validateType(type))) throw err

  const msg = {
    content: null,
    metadata: {
      hash: null,
      size: 0,
      tangles: {},
      type,
      v: 1,
      who: stripAuthor(keys.id),
    },
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
 * @param {Msg} msg
 * @returns {Msg}
 */
function erase(msg) {
  return { ...msg, content: null }
}

/**
 * @param {Buffer} plaintextBuf
 * @param {Msg} msg
 * @returns {Msg}
 */
function fromPlaintextBuffer(plaintextBuf, msg) {
  return { ...msg, content: JSON.parse(plaintextBuf.toString('utf-8')) }
}

module.exports = {
  getMsgHash,
  getMsgId,
  isFeedRoot,
  getFeedRootHash,
  create,
  createRoot,
  erase,
  stripAuthor,
  toPlaintextBuffer,
  fromPlaintextBuffer,
  Tangle,
  validate,
  validateBatch,
}
