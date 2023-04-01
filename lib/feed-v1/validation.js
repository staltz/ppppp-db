const base58 = require('bs58')
const ed25519 = require('ssb-keys/sodium')
const stringify = require('fast-json-stable-stringify')
const { stripMsgKey } = require('./strip')
const { getMsgHash } = require('./get-msg-id')

function validateShape(nativeMsg) {
  if (!nativeMsg || typeof nativeMsg !== 'object') {
    return new Error('invalid message: not a dag msg')
  }
  if (!nativeMsg.metadata || typeof nativeMsg.metadata !== 'object') {
    return new Error('invalid message: must have metadata')
  }
  if (typeof nativeMsg.metadata.author === 'undefined') {
    return new Error('invalid message: must have metadata.author')
  }
  if (typeof nativeMsg.metadata.type === 'undefined') {
    return new Error('invalid message: must have metadata.sequence')
  }
  if (typeof nativeMsg.metadata.previous === 'undefined') {
    return new Error('invalid message: must have metadata.previous')
  }
  if (typeof nativeMsg.metadata.timestamp === 'undefined') {
    return new Error('invalid message: must have metadata.timestamp')
  }
  if (typeof nativeMsg.metadata.contentHash === 'undefined') {
    return new Error('invalid message: must have metadata.contentHash')
  }
  if (typeof nativeMsg.metadata.contentSize === 'undefined') {
    return new Error('invalid message: must have metadata.contentSize')
  }
  if (typeof nativeMsg.content === 'undefined') {
    return new Error('invalid message: must have content')
  }
  if (typeof nativeMsg.signature === 'undefined') {
    return new Error('invalid message: must have signature')
  }
}

function validateAuthor(nativeMsg) {
  try {
    base58.decode(nativeMsg.metadata.author)
  } catch (err) {
    return new Error('invalid message: must have author as base58 string')
  }
}

function validateSignature(nativeMsg, hmacKey) {
  const { signature } = nativeMsg
  if (typeof signature !== 'string') {
    return new Error('invalid message: must have signature as a string')
  }
  try {
    base58.decode(signature)
  } catch (err) {
    return new Error('invalid message: signature must be a base58 string')
  }
  const signatureBuf = Buffer.from(base58.decode(signature))
  if (signatureBuf.length !== 64) {
    // prettier-ignore
    return new Error('invalid message: signature should be 64 bytes but was ' + signatureBuf.length + ', on feed: ' + nativeMsg.metadata.author);
  }

  const publicKeyBuf = Buffer.from(base58.decode(nativeMsg.metadata.author))
  const signableBuf = Buffer.from(stringify(nativeMsg.metadata), 'utf8')
  const verified = ed25519.verify(publicKeyBuf, signatureBuf, signableBuf)
  if (!verified) {
    // prettier-ignore
    return new Error('invalid message: signature does not match, on feed: ' + nativeMsg.metadata.author);
  }
}

function validatePrevious(nativeMsg, existingNativeMsgs) {
  if (!Array.isArray(nativeMsg.metadata.previous)) {
    // prettier-ignore
    return new Error('invalid message: previous must be an array, on feed: ' + nativeMsg.metadata.author);
  }
  for (const prevId of nativeMsg.metadata.previous) {
    if (typeof prevId !== 'string') {
      // prettier-ignore
      return new Error('invalid message: previous must contain strings but found ' + prevId + ', on feed: ' + nativeMsg.metadata.author);
    }
    if (prevId.startsWith('ssb:')) {
      // prettier-ignore
      return new Error('invalid message: previous must not contain SSB URIs, on feed: ' + nativeMsg.metadata.author);
    }

    if (existingNativeMsgs instanceof Set) {
      if (!existingNativeMsgs.has(prevId)) {
        // prettier-ignore
        return new Error('invalid message: previous ' + prevId + ' is not a known message ID, on feed: ' + nativeMsg.metadata.author);
      }
      continue
    } else {
      let found = false
      for (const nmsg of existingNativeMsgs) {
        const existingId = nmsg.key
          ? stripMsgKey(nmsg.key)
          : typeof nmsg === 'string'
          ? stripMsgKey(nmsg)
          : getMsgHash(nmsg)
        if (existingId === prevId) {
          found = true
          break
        }
      }
      if (!found) {
        // prettier-ignore
        return new Error('invalid message: previous ' + prevId + ' is not a known message ID, on feed: ' + nativeMsg.metadata.author);
      }
    }
  }
}

function validateFirstPrevious(nativeMsg) {
  if (!Array.isArray(nativeMsg.metadata.previous)) {
    // prettier-ignore
    return new Error('invalid message: previous must be an array, on feed: ' + nativeMsg.metadata.author);
  }
  if (nativeMsg.metadata.previous.length !== 0) {
    // prettier-ignore
    return new Error('initial message: previous must be an empty array, on feed: ' + nativeMsg.metadata.author);
  }
}

function validateTimestamp(nativeMsg) {
  if (typeof nativeMsg.metadata.timestamp !== 'number') {
    // prettier-ignore
    return new Error('initial message must have timestamp, on feed: ' + nativeMsg.metadata.author);
  }
}

function validateType(type) {
  if (!type || typeof type !== 'string') {
    // prettier-ignore
    return new Error('type is not a string');
  }
  if (type.length > 100) {
    // prettier-ignore
    return new Error('invalid type ' + type + ' is 100+ characters long');
  }
  if (type.length < 3) {
    // prettier-ignore
    return new Error('invalid type ' + type + ' is shorter than 3 characters');
  }
  if (/[^a-zA-Z0-9_]/.test(type)) {
    // prettier-ignore
    return new Error('invalid type ' + type + ' contains characters other than a-z, A-Z, 0-9, or _');
  }
}

function validateContent(nativeMsg) {
  const { content } = nativeMsg
  if (!content) {
    return new Error('invalid message: must have content')
  }
  if (Array.isArray(content)) {
    return new Error('invalid message: content must not be an array')
  }
  if (typeof content !== 'object' && typeof content !== 'string') {
    // prettier-ignore
    return new Error('invalid message: content must be an object or string, on feed: ' + nativeMsg.metadata.author);
  }
}

function validateHmac(hmacKey) {
  if (!hmacKey) return
  if (typeof hmacKey !== 'string' && !Buffer.isBuffer(hmacKey)) {
    return new Error('invalid hmac key: must be a string or buffer')
  }
  const bytes = Buffer.isBuffer(hmacKey)
    ? hmacKey
    : Buffer.from(hmacKey, 'base64')

  if (typeof hmacKey === 'string' && bytes.toString('base64') !== hmacKey) {
    return new Error('invalid hmac')
  }

  if (bytes.length !== 32) {
    return new Error('invalid hmac, it should have 32 bytes')
  }
}

function emptyExisting(existingNativeMsgs) {
  if (existingNativeMsgs instanceof Set) {
    return existingNativeMsgs.size === 0
  } else if (Array.isArray(existingNativeMsgs)) {
    return existingNativeMsgs.length === 0
  } else {
    return !existingNativeMsgs
  }
}

function validateSync(nativeMsg, existingNativeMsgs, hmacKey) {
  let err
  if ((err = validateShape(nativeMsg))) return err
  if ((err = validateHmac(hmacKey))) return err
  if ((err = validateAuthor(nativeMsg))) return err
  if ((err = validateTimestamp(nativeMsg))) return err
  if (emptyExisting(existingNativeMsgs)) {
    if ((err = validateFirstPrevious(nativeMsg))) return err
  } else {
    if ((err = validatePrevious(nativeMsg, existingNativeMsgs))) return err
  }
  if ((err = validateContent(nativeMsg))) return err
  if ((err = validateSignature(nativeMsg, hmacKey))) return err
}

// function validateOOOSync(nativeMsg, hmacKey) {
//   let err
//   if ((err = validateShape(nativeMsg))) return err
//   if ((err = validateHmac(hmacKey))) return err
//   if ((err = validateAuthor(nativeMsg))) return err
//   if ((err = validateHash(nativeMsg))) return err
//   if ((err = validateTimestamp(nativeMsg))) return err
//   if ((err = validateOrder(nativeMsg))) return err
//   if ((err = validateContent(nativeMsg))) return err
//   if ((err = validateAsJSON(nativeMsg))) return err
//   if ((err = validateSignature(nativeMsg, hmacKey))) return err
// }

function validate(nativeMsg, prevNativeMsg, hmacKey, cb) {
  let err
  if ((err = validateSync(nativeMsg, prevNativeMsg, hmacKey))) {
    return cb(err)
  }
  cb()
}

// function validateOOO(nativeMsg, hmacKey, cb) {
//   let err
//   if ((err = validateOOOSync(nativeMsg, hmacKey))) {
//     return cb(err)
//   }
//   cb()
// }

// function validateBatch(nativeMsgs, prevNativeMsg, hmacKey, cb) {
//   let err
//   let prev = prevNativeMsg
//   for (const nativeMsg of nativeMsgs) {
//     err = validateSync(nativeMsg, prev, hmacKey)
//     if (err) return cb(err)
//     prev = nativeMsg
//   }
//   cb()
// }

// function validateOOOBatch(nativeMsgs, hmacKey, cb) {
//   let err
//   for (const nativeMsg of nativeMsgs) {
//     err = validateOOOSync(nativeMsg, hmacKey)
//     if (err) return cb(err)
//   }
//   cb()
// }

module.exports = {
  validateType,
  validateContent,

  validate,
  // validateBatch,
  // validateOOO,
  // validateOOOBatch,
}
