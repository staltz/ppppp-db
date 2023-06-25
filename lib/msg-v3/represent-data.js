const blake3 = require('blake3')
const b4a = require('b4a')
const base58 = require('bs58')
// @ts-ignore
const stringify = require('json-canon')

/**
 * @typedef {Buffer | Uint8Array} B4A
 */

/**
 * @param {any} data
 * @returns {[string, number]}
 */
function representData(data) {
  const dataBuf = b4a.from(stringify(data), 'utf8')
  const fullHash = /** @type {B4A} */ (blake3.hash(dataBuf))
  const dataHash = base58.encode(fullHash.subarray(0, 16))
  const dataSize = dataBuf.length
  return [dataHash, dataSize]
}

module.exports = representData
