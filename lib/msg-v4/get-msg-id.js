const b4a = require('b4a')
const crypto = require('crypto')
const base58 = require('bs58')
// @ts-ignore
const stringify = require('json-canon')

/**
 * @typedef {import('./index').Msg} Msg
 * @typedef {Buffer | Uint8Array} B4A
 */

/**
 * @param {Msg} msg
 * @returns {B4A}
 */
function getMsgHashBuf(msg) {
  const metadataBuf = b4a.from(stringify(msg.metadata), 'utf8')
  const metadataHash = crypto.createHash('sha512').update(metadataBuf).digest()
  return b4a.from(metadataHash.subarray(0, 32))
}

/**
 * @param {Msg | string} x
 * @returns {string}
 */
function getMsgID(x) {
  if (typeof x === 'string') {
    if (x.startsWith('ppppp:message/v4/')) {
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
function getMsgURI(msg) {
  const { account, domain } = msg.metadata
  const msgHash = getMsgID(msg)
  if (domain) {
    return `ppppp:message/v4/${account}/${domain}/${msgHash}`
  } else {
    return `ppppp:message/v4/${account}/${msgHash}`
  }
}

module.exports = { getMsgURI, getMsgID }
