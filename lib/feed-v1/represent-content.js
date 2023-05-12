const blake3 = require('blake3')
const base58 = require('bs58')
const stringify = require('json-canon')

/**
 * @param {any} content
 * @returns {[string, number]}
 */
function representContent(content) {
  const contentBuf = Buffer.from(stringify(content), 'utf8')
  const hash = base58.encode(blake3.hash(contentBuf).subarray(0, 16))
  const size = contentBuf.length
  return [hash, size]
}

module.exports = representContent
