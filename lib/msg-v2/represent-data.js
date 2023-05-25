const blake3 = require('blake3')
const base58 = require('bs58')
const stringify = require('json-canon')

/**
 * @param {any} data
 * @returns {[string, number]}
 */
function representData(data) {
  const dataBuf = Buffer.from(stringify(data), 'utf8')
  const dataHash = base58.encode(blake3.hash(dataBuf).subarray(0, 16))
  const dataSize = dataBuf.length
  return [dataHash, dataSize]
}

module.exports = representData
