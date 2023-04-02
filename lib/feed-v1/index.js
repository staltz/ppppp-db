// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const stringify = require('fast-json-stable-stringify')
const ed25519 = require('ssb-keys/sodium')
const base58 = require('bs58')
const { stripAuthor, stripMsgKey } = require('./strip')
const { getMsgId, getMsgHash } = require('./get-msg-id')
const representContent = require('./represent-content')
const {
  validateType,
  validateContent,
  validate,
  validateOOO,
  validateBatch,
  validateOOOBatch,
} = require('./validation')

/**
 * @typedef {Object} Msg
 * @property {*} content
 * @property {Object} metadata
 * @property {number} metadata.depth
 * @property {Array<string>} metadata.prev
 * @property {string} metadata.proof
 * @property {number} metadata.size
 * @property {string=} metadata.type
 * @property {string} metadata.who
 * @property {number=} metadata.when
 * @property {string} sig
 */

/**
 * @param {Msg} msg
 */
function getFeedId(msg) {
  if (msg.metadata.type) {
    return `ppppp:feed/v1/${msg.metadata.who}/${msg.metadata.type}`
  } else {
    return `ppppp:feed/v1/${msg.metadata.who}`
  }
}

function isMsg(x) {
  return (
    typeof x === 'object' &&
    !!x &&
    typeof x.metadata.author === 'string' &&
    x.metadata.author &&
    typeof x.metadata.type === 'string' &&
    x.metadata.type
  )
}

function isFeedId(author) {
  if (typeof author !== 'string') return false
  return author.startsWith('ppppp:feed/v1/')
}

function toPlaintextBuffer(opts) {
  return Buffer.from(stringify(opts.content), 'utf8')
}

function calculateDepth(prev) {
  let max = -1;
  for (const p of prev) {
    if (p.metadata.depth > max) {
      max = p.metadata.depth;
    }
  }
  return max + 1
}

function summarizePrev(prev) {
  return Array.from(prev).map(getMsgHash)
}

function prevalidatePrev(prev) {
  if (prev && !prev[Symbol.iterator]) {
    // prettier-ignore
    throw new Error('opts.prev must be an iterator, but got ' + typeof prev)
  }
  for (const p of prev) {
    if (!p.metadata) {
      throw new Error('opts.prev must contain messages, but got ' + typeof p)
    }
  }
}
/**
 * @param {*} opts
 * @returns {Msg}
 */
function create(opts) {
  let err
  if ((err = validateType(opts.type))) throw err
  prevalidatePrev(opts.prev)

  const [proof, size] = representContent(opts.content)
  const depth = calculateDepth(opts.prev)
  const msg = {
    content: opts.content,
    metadata: {
      depth,
      prev: summarizePrev(opts.prev),
      proof,
      size,
      type: opts.type,
      who: stripAuthor(opts.keys.id),
      when: +opts.when,
    },
    sig: '',
  }
  if ((err = validateContent(msg))) throw err

  const privateKey = Buffer.from(opts.keys.private, 'base64')
  const metadataBuf = Buffer.from(stringify(msg.metadata), 'utf8')
  // TODO: when signing, what's the point of a customizable hmac?
  const sigBuf = ed25519.sign(privateKey, metadataBuf)
  msg.sig = base58.encode(sigBuf)

  return msg
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
  getMsgId,
  getFeedId,
  isFeedId,
  isMsg,
  create,
  toPlaintextBuffer,
  fromPlaintextBuffer,
  validate,
  validateOOO,
  validateBatch,
  validateOOOBatch,

  // custom APIs:
  getMsgHash,
}
