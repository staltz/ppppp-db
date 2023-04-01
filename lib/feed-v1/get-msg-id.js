const blake3 = require('blake3')
const base58 = require('bs58')
const stringify = require('fast-json-stable-stringify')

function getMsgHashBuf(nativeMsg) {
  const { metadata, signature } = nativeMsg
  const metadataBuf = Buffer.from(stringify(metadata), 'utf8')
  const sigBuf = base58.decode(signature)
  return blake3
    .hash(Buffer.concat([metadataBuf, sigBuf]))
    .subarray(0, 16)
}

function getMsgHash(nativeMsg) {
  const msgHashBuf = getMsgHashBuf(nativeMsg)
  return base58.encode(msgHashBuf)
}

function getMsgId(nativeMsg) {
  const author = nativeMsg.metadata.author
  const type = nativeMsg.metadata.type
  const msgHash = getMsgHash(nativeMsg)
  return `ssb:message/dag/${author}/${type}/${msgHash}`
}

module.exports = { getMsgId, getMsgHash }
