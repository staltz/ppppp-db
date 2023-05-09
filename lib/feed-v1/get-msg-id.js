const blake3 = require('blake3')
const base58 = require('bs58')
const stringify = require('canonicalize')

/**
 * @typedef {import('./index').Msg} Msg
 */

/**
 * @param {Msg} msg
 * @returns {Buffer}
 */
function getMsgHashBuf(msg) {
  const metadataBuf = Buffer.from(stringify(msg.metadata), 'utf8')
  return blake3.hash(metadataBuf).subarray(0, 16)
}

/**
 * @param {Msg | string} x
 * @returns {string}
 */
function getMsgHash(x) {
  if (typeof x === 'string') {
    if (x.startsWith('ppppp:message/v1/')) {
      const msgUri = x
      const parts = msgUri.split('/')
      return parts[parts.length - 1]
    } else {
      const msgHash = x
      return msgHash
    }
  } else {
    const msg = x
    const msgHashBuf = getMsgHashBuf(msg)
    return base58.encode(msgHashBuf)
  }
}

/**
 * @param {Msg} msg
 * @returns  {string}
 */
function getMsgId(msg) {
  const { who, type } = msg.metadata
  const msgHash = getMsgHash(msg)
  if (type) {
    return `ppppp:message/v1/${who}/${type}/${msgHash}`
  } else {
    return `ppppp:message/v1/${who}/${msgHash}`
  }
}

module.exports = { getMsgId, getMsgHash }
