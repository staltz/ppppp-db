const FeedV1 = require('./feed-v1')

/**
 * @typedef {import('./index').Rec} Rec
 */

function ciphertextStrToBuffer(str) {
  const dot = str.indexOf('.')
  return Buffer.from(str.slice(0, dot), 'base64')
}

/**
 * @param {Rec} rec
 * @param {any} peer
 * @param {any} config
 * @returns {Rec}
 */
function decrypt(rec, peer, config) {
  const msgEncrypted = rec.msg
  const { content } = msgEncrypted
  if (typeof content !== 'string') return rec

  const encryptionFormat = peer.db.findEncryptionFormatFor(content)
  if (!encryptionFormat) return rec

  // Decrypt
  const ciphertextBuf = ciphertextStrToBuffer(content)
  const opts = { keys: config.keys }
  const plaintextBuf = encryptionFormat.decrypt(ciphertextBuf, opts)
  if (!plaintextBuf) return rec

  // Reconstruct KVT in JS encoding
  const msgDecrypted = FeedV1.fromPlaintextBuffer(plaintextBuf, msgEncrypted)

  return {
    hash: rec.hash,
    msg: msgDecrypted,
    received: rec.received,
    misc: {
      ...rec.misc,
      private: true,
      originalContent: content,
      encryptionFormat: encryptionFormat.name,
    },
  }
}

function reEncrypt(rec) {
  return {
    hash: rec.hash,
    msg: { ...rec.msg, content: rec.misc.originalContent },
    received: rec.received,
    ...(rec.misc.size
      ? {
          misc: {
            offset: rec.misc.offset,
            size: rec.misc.size,
          },
        }
      : null),
  }
}

module.exports = {
  decrypt,
  reEncrypt,
}
