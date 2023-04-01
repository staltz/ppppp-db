// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const stringify = require('fast-json-stable-stringify')
const ed25519 = require('ssb-keys/sodium')
const base58 = require('bs58')
const {
  stripAuthor,
  stripMsgKey,
  unstripMsgKey,
  unstripAuthor,
} = require('./strip')
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

const name = 'dag'
const encodings = ['js']

function getFeedId(nativeMsg) {
  return nativeMsg.metadata.author + nativeMsg.metadata.type
}

function getSequence(nativeMsg) {
  throw new Error('getSequence not supported for dagfeed')
}

function isNativeMsg(x) {
  return (
    typeof x === 'object' &&
    !!x &&
    typeof x.metadata.author === 'string' &&
    x.metadata.author &&
    typeof x.metadata.type === 'string' &&
    x.metadata.type
  )
}

function isAuthor(author) {
  if (typeof author !== 'string') return false
  return author.startsWith('ssb:feed/dag/')
}

function toPlaintextBuffer(opts) {
  return Buffer.from(stringify(opts.content), 'utf8')
}

function newNativeMsg(opts) {
  let err
  if ((err = validateType(opts.type))) throw err
  if (opts.previous && !Array.isArray(opts.previous)) {
    // prettier-ignore
    throw new Error('opts.previous must be an array, but got ' + typeof opts.previous)
  }

  const [contentHash, contentSize] = representContent(opts.content)
  const nativeMsg = {
    metadata: {
      author: stripAuthor(opts.keys.id),
      type: opts.type,
      previous: (opts.previous ?? []).map(stripMsgKey),
      timestamp: +opts.timestamp,
      contentHash,
      contentSize,
    },
    content: opts.content,
    signature: '',
  }
  if ((err = validateContent(nativeMsg))) throw err

  const metadataBuf = Buffer.from(stringify(nativeMsg.metadata), 'utf8')
  // FIXME: this should allow using hmacKey
  const privateKey = Buffer.from(opts.keys.private, 'base64')
  const signature = ed25519.sign(privateKey, metadataBuf)
  nativeMsg.signature = base58.encode(signature)
  return nativeMsg
}

function fromNativeMsg(nativeMsg, encoding = 'js') {
  if (encoding === 'js') {
    const msgVal = {
      // traditional:
      previous: nativeMsg.metadata.previous.map((id) =>
        unstripMsgKey(nativeMsg, id)
      ),
      sequence: 0,
      author: unstripAuthor(nativeMsg),
      timestamp: nativeMsg.metadata.timestamp,
      content: nativeMsg.content,
      signature: nativeMsg.signature,
      // unusual:
      contentHash: nativeMsg.metadata.contentHash,
      contentSize: nativeMsg.metadata.contentSize,
      type: nativeMsg.metadata.type,
    }
    if (typeof msgVal.content === 'object') {
      msgVal.content.type = nativeMsg.metadata.type
    }
    return msgVal
  } else {
    // prettier-ignore
    throw new Error(`Feed format "${name}" does not support encoding "${encoding}"`)
  }
}

function fromDecryptedNativeMsg(plaintextBuf, nativeMsg, encoding = 'js') {
  if (encoding === 'js') {
    const msgVal = fromNativeMsg(nativeMsg, 'js')
    const content = JSON.parse(plaintextBuf.toString('utf8'))
    msgVal.content = content
    msgVal.content.type = nativeMsg.metadata.type
    return msgVal
  } else {
    // prettier-ignore
    throw new Error(`Feed format "${name}" does not support encoding "${encoding}"`)
  }
}

function toNativeMsg(msgVal, encoding = 'js') {
  if (encoding === 'js') {
    return {
      metadata: {
        author: stripAuthor(msgVal.author),
        type: msgVal.type ?? '',
        previous: (msgVal.previous ?? []).map(stripMsgKey),
        timestamp: msgVal.timestamp,
        contentHash: msgVal.contentHash,
        contentSize: msgVal.contentSize,
      },
      content: msgVal.content,
      signature: msgVal.signature,
    }
  } else {
    // prettier-ignore
    throw new Error(`Feed format "${name}" does not support encoding "${encoding}"`)
  }
}

module.exports = {
  name,
  encodings,
  getMsgId,
  getFeedId,
  getSequence,
  isAuthor,
  isNativeMsg,
  toPlaintextBuffer,
  newNativeMsg,
  fromNativeMsg,
  fromDecryptedNativeMsg,
  toNativeMsg,
  validate,
  validateOOO,
  validateBatch,
  validateOOOBatch,

  // custom APIs:
  getMsgHash,
}
