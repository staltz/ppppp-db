const MsgV2 = require('./msg-v2')

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
  const { data } = msgEncrypted
  if (typeof data !== 'string') return rec

  const encryptionFormat = peer.db.findEncryptionFormatFor(data)
  if (!encryptionFormat) return rec

  // Decrypt
  const ciphertextBuf = ciphertextStrToBuffer(data)
  const opts = { keys: config.keys }
  const plaintextBuf = encryptionFormat.decrypt(ciphertextBuf, opts)
  if (!plaintextBuf) return rec

  // Reconstruct KVT in JS encoding
  const msgDecrypted = MsgV2.fromPlaintextBuffer(plaintextBuf, msgEncrypted)

  return {
    hash: rec.hash,
    msg: msgDecrypted,
    received: rec.received,
    misc: {
      ...rec.misc,
      private: true,
      originalData: data,
      encryptionFormat: encryptionFormat.name,
    },
  }
}

function reEncrypt(rec) {
  return {
    hash: rec.hash,
    msg: { ...rec.msg, data: rec.misc.originalData },
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
