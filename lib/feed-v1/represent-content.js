const blake3 = require('blake3')
const base58 = require('bs58')
const stringify = require('fast-json-stable-stringify')

function representContent(content) {
  const contentBuf = Buffer.from(stringify(content), 'utf8')
  const hash = base58.encode(blake3.hash(contentBuf).subarray(0, 16))
  const size = contentBuf.length
  return [hash, size]
}

module.exports = representContent
