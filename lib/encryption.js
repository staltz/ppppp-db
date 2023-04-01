function ciphertextStrToBuffer(str) {
  const dot = str.indexOf('.')
  return Buffer.from(str.slice(0, dot), 'base64')
}

function decrypt(msg, ssb, config) {
  const { author, previous, content } = msg.value
  if (typeof content !== 'string') return msg

  const encryptionFormat = ssb.db.findEncryptionFormatFor(content)
  if (!encryptionFormat) return msg

  const feedFormat = ssb.db.findFeedFormatForAuthor(author)
  if (!feedFormat) return msg

  // Decrypt
  const ciphertextBuf = ciphertextStrToBuffer(content)
  const opts = { keys: config.keys, author, previous }
  const plaintextBuf = encryptionFormat.decrypt(ciphertextBuf, opts)
  if (!plaintextBuf) return msg

  // Reconstruct KVT in JS encoding
  const nativeMsg = feedFormat.toNativeMsg(msg.value, 'js')
  // TODO: feedFormat.fromDecryptedNativeMsg() should NOT mutate nativeMsg
  // but in the case of ssb-classic, it is
  const msgVal = feedFormat.fromDecryptedNativeMsg(
    plaintextBuf,
    { ...nativeMsg, value: { ...nativeMsg.value } }, // TODO revert this
    'js'
  )

  return {
    key: msg.key,
    value: msgVal,
    timestamp: msg.timestamp,
    meta: {
      private: true,
      originalContent: content,
      encryptionFormat: encryptionFormat.name,
    },
  }
}

function reEncrypt(msg) {
  return {
    key: msg.key,
    value: { ...msg.value, content: msg.meta.originalContent },
    timestamp: msg.timestamp,
    ...(msg.meta.size
      ? {
          meta: {
            offset: msg.meta.offset,
            size: msg.meta.size,
          },
        }
      : null),
  }
}

module.exports = {
  decrypt,
  reEncrypt,
}
