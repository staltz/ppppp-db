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
  validateBatch,
  validateMsgHash,
} = require('./validation')

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
 * @property {string} metadata.proof
 * @property {number} metadata.size
 * @property {Record<string, TangleMetadata>} metadata.tangles
 * @property {string} metadata.type
 * @property {string} metadata.who
 * @property {number} metadata.when
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
 * @property {number} when
 * @property {Keys} keys
 * @property {Record<string, MsgIter>} tangles
 */

/**
 * @typedef {Object} CreateRootOpts
 * @property {string} type
 * @property {Keys} keys
 * @property {string} keys.id
 * @property {string} keys.private
 */

/**
 * @param {Msg} msg
 */
// function getFeedId(msg) {
//   if (msg.metadata.type) {
//     return `ppppp:feed/v1/${msg.metadata.who}/${msg.metadata.type}`
//   } else {
//     return `ppppp:feed/v1/${msg.metadata.who}`
//   }
// }

// function isMsg(x) {
//   return (
//     typeof x === 'object' &&
//     !!x &&
//     typeof x.metadata.author === 'string' &&
//     x.metadata.author &&
//     typeof x.metadata.type === 'string' &&
//     x.metadata.type
//   )
// }

// function isFeedId(author) {
//   if (typeof author !== 'string') return false
//   return author.startsWith('ppppp:feed/v1/')
// }

function toPlaintextBuffer(opts) {
  return Buffer.from(stringify(opts.content), 'utf8')
}

function calculateDepth(existing, tangleId = null) {
  let max = -1
  for (const msg of existing.values()) {
    const depth = msg.metadata.tangles[tangleId]?.depth ?? 0
    if (depth > max) {
      max = depth
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

function determineTips(existing, tangleId = null) {
  const tips = new Set()
  for (const msg of existing.values()) {
    tips.add(getMsgHash(msg))
  }

  for (const msg of existing.values()) {
    const prev = msg.metadata.tangles[tangleId]?.prev ?? []
    for (const p of prev) {
      tips.delete(p)
    }
  }
  return tips
}

function calculatePrev(existing, depth, lipmaaDepth, tangleId = null) {
  const prev = []
  const tips = determineTips(existing, tangleId)
  for (const msg of existing.values()) {
    const msgDepth = msg.metadata.tangles[tangleId]?.depth ?? 0
    const msgHash = getMsgHash(msg)
    if (
      msgDepth === depth - 1 ||
      msgDepth === lipmaaDepth ||
      tips.has(msgHash)
    ) {
      prev.push(msgHash)
    }
  }
  return prev
}

/**
 * @param {MsgIter} existing
 * @param {string} tangleId
 * @returns
 */
function prevalidateExisting(existing, tangleId) {
  if (!existing?.[Symbol.iterator]) {
    // prettier-ignore
    return new Error(`existing must be an iterator, but got ${typeof existing}`)
  }
  if (typeof existing?.values !== 'function') {
    // prettier-ignore
    return new Error(`existing must be a Map, Set, or Array, but got ${existing}`)
  }
  if (!tangleId) {
    // prettier-ignore
    return new Error(`tangleId must be a string, but got ${typeof tangleId}`)
  }
  let isEmpty = true
  let hasDepthZeroMsg = false
  for (const p of existing.values()) {
    isEmpty = false
    if (!p.metadata) {
      // prettier-ignore
      return new Error(`existing must contain messages, but got ${typeof p}`)
    }

    if (!p.metadata.tangles[tangleId] && getMsgHash(p) === tangleId) {
      if (hasDepthZeroMsg) {
        // prettier-ignore
        return new Error(`existing must contain only 1 message with depth 0`)
      } else {
        hasDepthZeroMsg = true
      }
    } else if (!p.metadata.tangles[tangleId]) {
      // prettier-ignore
      return new Error(`existing must refer to the tangleId ${tangleId}`)
    }
  }
  if (!isEmpty && !hasDepthZeroMsg) {
    // prettier-ignore
    return new Error(`opts.existing must contain the message with depth 0`)
  }
}

/**
 * @param {CreateOpts} opts
 * @returns {Msg}
 */
function create(opts) {
  let err
  if ((err = validateType(opts.type))) throw err
  if (!opts.tangles) throw new Error('opts.tangles is required')

  const [proof, size] = representContent(opts.content)

  const tangles = {}
  if (opts.tangles) {
    for (const rootId in opts.tangles) {
      if ((err = validateMsgHash(rootId))) throw err
      const existing = opts.tangles[rootId]
      if ((err = prevalidateExisting(existing, rootId))) throw err

      const depth = calculateDepth(existing, rootId)
      const lipmaaDepth = lipmaa(depth + 1) - 1
      const prev = calculatePrev(existing, depth, lipmaaDepth, rootId)
      tangles[rootId] = { depth, prev }
    }
  } else {
    // prettier-ignore
    throw new Error(`cannot create msg without tangles, that's the case for createRoot()`)
  }

  const msg = {
    content: opts.content,
    metadata: {
      proof,
      size,
      tangles,
      type: opts.type,
      who: stripAuthor(opts.keys.id),
      when: +opts.when,
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
      proof: '',
      size: 0,
      tangles: {},
      type,
      who: stripAuthor(keys.id),
      when: 0,
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
  // getFeedId,
  // isFeedId,
  // isMsg,
  create,
  createRoot,
  stripAuthor,
  toPlaintextBuffer,
  fromPlaintextBuffer,
  validate,
  validateBatch,
}
