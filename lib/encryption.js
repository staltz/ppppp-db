const base58 = require('bs58')
const b4a = require('b4a')
const MsgV4 = require('./msg-v4')

/**
 * @typedef {import('./index').Msg} Msg
 * @typedef {import('./index').RecPresent} RecPresent
 * @typedef {import('./index').Rec} Rec
 * @typedef {import('./index').Misc} Misc
 * @typedef {import('ppppp-keypair').Keypair} Keypair
 *
 * @typedef {Buffer | Uint8Array} B4A
 *
 * @typedef {{
 *   name: string;
 *   setup?: (config: any, cb: any) => void;
 *   onReady?: (cb: any) => void;
 *   encrypt: (plaintext: B4A, opts: any) => B4A;
 *   decrypt: (ciphertext: B4A, opts: any) => B4A | null;
 * }} EncryptionFormat
 */

/**
 * @param {string} str
 */
function ciphertextStrToBuffer(str) {
  const dot = str.indexOf('.')
  return b4a.from(str.slice(0, dot), 'base64')
}

/**
 * TODO: eventually get rid of this
 * @param {Keypair} keypair
 */
function keypairToSSBKeys(keypair) {
  const _public = b4a.from(base58.decode(keypair.public)).toString('base64')
  const _private = b4a.from(base58.decode(keypair.private)).toString('base64')
  return {
    id: `@${_public}.ed25519`,
    curve: keypair.curve,
    public: _public,
    private: _private,
  }
}

const decryptCache = new WeakMap()

/**
 * @template {{msg: Msg}} T
 * @param {T} rec
 * @param {any} peer
 * @param {any} config
 * @returns {T}
 */
function decrypt(rec, peer, config) {
  if (decryptCache.has(rec)) return decryptCache.get(rec)
  const msgEncrypted = rec.msg
  const { data } = msgEncrypted
  if (typeof data !== 'string') return rec

  const encryptionFormat = peer.db.findEncryptionFormatFor(data)
  if (!encryptionFormat) return rec

  // Decrypt
  const ciphertextBuf = ciphertextStrToBuffer(data)
  const opts = { keys: keypairToSSBKeys(config.keypair) }
  const plaintextBuf = encryptionFormat.decrypt(ciphertextBuf, opts)
  if (!plaintextBuf) return rec

  // Reconstruct KVT in JS encoding
  const msgDecrypted = MsgV4.fromPlaintextBuffer(plaintextBuf, msgEncrypted)

  const recDecrypted = {
    ...rec,
    msg: msgDecrypted,
    misc: {
      // ...rec.misc,
      private: true,
      originalData: data,
      encryptionFormat: encryptionFormat.name,
    },
  }
  decryptCache.set(rec, recDecrypted)
  return recDecrypted
}

/**
 * @param {RecPresent} rec
 * @returns {RecPresent}
 */
// function reEncrypt(rec) {
//   return {
//     id: rec.id,
//     msg: { ...rec.msg, data: rec.misc.originalData },
//     received: rec.received,
//     misc: {
//       seq: rec.misc.seq,
//       offset: rec.misc.offset,
//       size: rec.misc.size,
//     },
//   }
// }

module.exports = {
  decrypt,
  // reEncrypt,
}
