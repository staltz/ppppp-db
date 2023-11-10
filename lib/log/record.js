const b4a = require('b4a')

/**
 * @typedef {Buffer | Uint8Array} B4A
 */

/*
Binary format for a Record:

<record>
  <dataLength: UInt16LE><emptyLength: UInt16LE>
  <dataBuf: Arbitrary Bytes or empty Bytes>
</record>

The "Header" is the first two bytes for the dataLength.
*/

const HEADER_D = 2 // uint16
const HEADER_E = 2 // uint16
const HEADER_SIZE = HEADER_D + HEADER_E // uint16

/**
 * @param {B4A} dataBuf
 */
function size(dataBuf) {
  return HEADER_D + HEADER_E + dataBuf.length
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
function readEmptyLength(blockBuf, offsetInBlock) {
  const view = new DataView(
    blockBuf.buffer,
    blockBuf.byteOffset,
    blockBuf.byteLength
  )
  return view.getUint16(offsetInBlock + 2, true)
}

/**
 * @param {B4A} blockBuf
 * @param {number} offsetInBlock
 */
function isEmpty(blockBuf, offsetInBlock) {
  return (
    readDataLength(blockBuf, offsetInBlock) === 0 &&
    readEmptyLength(blockBuf, offsetInBlock) > 0
  )
}

// const EOB = {
//   SIZE: Record.HEADER_SIZE,
//   asNumber: 0,
// }

/**
 * The "End of Block" is a special field 4-bytes-long used to mark the end of a
 * block, and in practice it's like a Record header "dataLength" and
 * "emptyLength" fields both with the value 0.
 *
 * In most cases, the end region of a block will be much more than 4 bytes of
 * zero, but we want to guarantee there is at *least* 4 bytes at the end.
 * @param {B4A} blockBuf
 * @param {number} offsetInBlock
 */
function isEOB(blockBuf, offsetInBlock) {
  return (
    readDataLength(blockBuf, offsetInBlock) === 0 &&
    readEmptyLength(blockBuf, offsetInBlock) === 0
  )
}

/**
 * @param {B4A} blockBuf
 * @param {number} offsetInBlock
 */
function readSize(blockBuf, offsetInBlock) {
  const dataLength = readDataLength(blockBuf, offsetInBlock)
  const emptyLength = readEmptyLength(blockBuf, offsetInBlock)
  return HEADER_D + HEADER_E + dataLength + emptyLength
}

/**
 * @param {B4A} blockBuf
 * @param {number} offsetInBlock
 * @returns {[B4A, number, number, number]}
 */
function read(blockBuf, offsetInBlock) {
  const dataLength = readDataLength(blockBuf, offsetInBlock)
  const emptyLength = readEmptyLength(blockBuf, offsetInBlock)
  const dataStart = offsetInBlock + HEADER_D + HEADER_E
  const dataBuf = blockBuf.subarray(dataStart, dataStart + dataLength)
  const size = HEADER_D + HEADER_E + dataLength + emptyLength
  return [dataBuf, size, dataLength, emptyLength]
}

/**
 * @param {B4A} blockBuf
 * @param {number} offsetInBlock
 * @param {B4A} dataBuf
 * @param {number} emptySize
 */
function write(blockBuf, offsetInBlock, dataBuf, emptySize = 0) {
  const dataSize = dataBuf.length
  const dataHeaderPos = offsetInBlock
  const emptyHeaderPos = dataHeaderPos + HEADER_D
  const dataBodyPos = emptyHeaderPos + HEADER_E
  const emptyBodyPos = dataBodyPos + dataSize

  // write header
  {
    const view = new DataView(
      blockBuf.buffer,
      blockBuf.byteOffset,
      blockBuf.byteLength
    )
    view.setUint16(dataHeaderPos, dataSize, true)
    if (emptySize > 0) {
      view.setUint16(emptyHeaderPos, emptySize, true)
    }
  }

  // write body
  {
    if (dataSize > 0) {
      b4a.copy(dataBuf, blockBuf, dataBodyPos)
    }
    if (emptySize > 0) {
      b4a.fill(blockBuf, 0, emptyBodyPos, emptyBodyPos + emptySize)
    }
  }
}

/**
 * @param {B4A} blockBuf
 * @param {number} offsetInBlock
 */
function overwriteAsEmpty(blockBuf, offsetInBlock) {
  const dataLength = readDataLength(blockBuf, offsetInBlock)
  write(blockBuf, offsetInBlock, b4a.alloc(0), dataLength)
}

module.exports = {
  EOB_SIZE: HEADER_D + HEADER_E,
  size,
  readDataLength,
  readEmptyLength,
  readSize,
  read,
  write,
  overwriteAsEmpty,
  isEmpty,
  isEOB,
}
