// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const stringify = require('fast-json-stable-stringify')
const ed25519 = require('ssb-keys/sodium')
const base58 = require('bs58')
const { stripAuthor } = require('./strip')
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
 * @typedef {Object} CreateOpts
 * @property {*} content
 * @property {string} type
 * @property {number} when
 * @property {Object} keys
 * @property {string} keys.id
 * @property {string} keys.private
 * @property {Iterator<Msg> & {values: () => Iterator<Msg>}} existing
 * @property {Iterator<Msg> & {values: () => Iterator<Msg>}} tips
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

function calculateDepth(tips) {
  let max = -1
  for (const p of tips.values()) {
    if (p.metadata.depth > max) {
      max = p.metadata.depth
    }
  }
  return max + 1
}

function lipmaa(n) {
  let m = 1
  let po3 = 3
  let u = n

  // find k such that (3^k - 1)/2 >= n
  while (m < n) {
    po3 *= 3
    m = (po3 - 1) / 2
  }

  // find longest possible backjump
  po3 /= 3
  if (m !== n) {
    while (u !== 0) {
      m = (po3 - 1) / 2
      po3 /= 3
      u %= m
    }

    if (m !== po3) {
      po3 = m
    }
  }

  return n - po3
}

function calculatePrev(existing, depth, lipmaaDepth) {
  const prev = []
  for (const msg of existing.values()) {
    const msgDepth = msg.metadata.depth
    if (msgDepth === lipmaaDepth || msgDepth === depth - 1) {
      prev.push(getMsgHash(msg))
    }
  }
  return prev
}

function prevalidatePrevious(prev, name) {
  if (!prev?.[Symbol.iterator]) {
    // prettier-ignore
    throw new Error(`opts.${name} must be an iterator, but got ${typeof prev}`)
  }
  if (typeof prev?.values !== 'function') {
    // prettier-ignore
    throw new Error(`opts.${name} must be a Map, Set, or Array, but got ${prev}`)
  }
  for (const p of prev.values()) {
    if (!p.metadata) {
      throw new Error(`opts.${name} must contain messages, but got ${typeof p}`)
    }
  }
}

/**
 * @param {CreateOpts} opts
 * @returns {Msg}
 */
function create(opts) {
  let err
  if ((err = validateType(opts.type))) throw err
  prevalidatePrevious(opts.existing, 'existing')
  prevalidatePrevious(opts.tips, 'tips')

  const [proof, size] = representContent(opts.content)
  const depth = calculateDepth(opts.tips)
  const lipmaaDepth = lipmaa(depth + 1) - 1
  const prev = calculatePrev(opts.existing, depth, lipmaaDepth)
  const msg = {
    content: opts.content,
    metadata: {
      depth,
      prev,
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
