const b4a = require('b4a')

/**
 * @typedef {Buffer | Uint8Array} B4A
 */

/*
Binary format for a Record:

<record>
  <dataLength: UInt16LE>
  <dataBuf: Arbitrary Bytes>
</record>

The "Header" is the first two bytes for the dataLength.
*/

const HEADER_SIZE = 2 // uint16

/**
 * @param {B4A} dataBuf
 */
function size(dataBuf) {
  return HEADER_SIZE + dataBuf.length
}

/**
 * @param {B4A} blockBuf
 * @param {number} offsetInBlock
 */
function readDataLength(blockBuf, offsetInBlock) {
  const view = new DataView(
    blockBuf.buffer,
    blockBuf.byteOffset,
    blockBuf.byteLength
  )
  return view.getUint16(offsetInBlock, true)
}

/**
 * @param {B4A} blockBuf
 * @param {number} offsetInBlock
 */
function readSize(blockBuf, offsetInBlock) {
  const dataLength = readDataLength(blockBuf, offsetInBlock)
  return HEADER_SIZE + dataLength
}

/**
 * @param {B4A} blockBuf
 * @param {number} offsetInBlock
 * @returns {[B4A, number]}
 */
function read(blockBuf, offsetInBlock) {
  const dataLength = readDataLength(blockBuf, offsetInBlock)
  const dataStart = offsetInBlock + HEADER_SIZE
  const dataBuf = blockBuf.slice(dataStart, dataStart + dataLength)
  const size = HEADER_SIZE + dataLength
  return [dataBuf, size]
}

/**
 * @param {B4A} blockBuf
 * @param {number} offsetInBlock
 * @param {B4A} dataBuf
 */
function write(blockBuf, offsetInBlock, dataBuf) {
  // write dataLength
  const view = new DataView(blockBuf.buffer, blockBuf.byteOffset, blockBuf.byteLength)
  view.setUint16(offsetInBlock, dataBuf.length, true)
  // write dataBuf
  b4a.copy(dataBuf, blockBuf, offsetInBlock + HEADER_SIZE)
}

/**
 * @param {B4A} blockBuf
 * @param {number} offsetInBlock
 */
function overwriteWithZeroes(blockBuf, offsetInBlock) {
  const dataLength = readDataLength(blockBuf, offsetInBlock)
  const dataStart = offsetInBlock + HEADER_SIZE
  const dataEnd = dataStart + dataLength
  blockBuf.fill(0, dataStart, dataEnd)
}

module.exports = {
  HEADER_SIZE,
  size,
  readDataLength,
  readSize,
  read,
  write,
  overwriteWithZeroes,
}
