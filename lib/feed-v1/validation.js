const base58 = require('bs58')
const ed25519 = require('ssb-keys/sodium')
const stringify = require('json-canon')
const Tangle = require('./tangle')
const representContent = require('./represent-content')

function validateShape(msg) {
  if (!msg || typeof msg !== 'object') {
    return new Error('invalid message: not an object')
  }
  if (!msg.metadata || typeof msg.metadata !== 'object') {
    return new Error('invalid message: must have metadata')
  }
  if (typeof msg.metadata.who === 'undefined') {
    return new Error('invalid message: must have metadata.who')
  }
  if (msg.metadata.v !== 1) {
    return new Error('invalid message: must have metadata.v 1')
  }
  if (typeof msg.metadata.tangles !== 'object') {
    return new Error('invalid message: must have metadata.tangles')
  }
  if (typeof msg.metadata.hash === 'undefined') {
    return new Error('invalid message: must have metadata.hash')
  }
  if (typeof msg.metadata.size === 'undefined') {
    return new Error('invalid message: must have metadata.size')
  }
  if (typeof msg.content === 'undefined') {
    return new Error('invalid message: must have content')
  }
  if (typeof msg.sig === 'undefined') {
    return new Error('invalid message: must have sig')
  }
}

function validateWho(msg) {
  try {
    const whoBuf = base58.decode(msg.metadata.who)
    if (whoBuf.length !== 32) {
      return new Error(
        `invalid message: decoded "who" should be 32 bytes but was ${whoBuf.length}`
      )
    }
  } catch (err) {
    return new Error('invalid message: must have "who" as base58 string')
  }
}

function validateMsgHash(str) {
  try {
    const hashBuf = Buffer.from(base58.decode(str))
    if (hashBuf.length !== 16) {
      return new Error(
        `invalid message: decoded hash should be 16 bytes but was ${hashBuf.length}`
      )
    }
  } catch (err) {
    return new Error(
      `invalid message: msgHash ${str} should have been a base58 string`
    )
  }
}

function validateSize(msg) {
  const {
    metadata: { size },
  } = msg
  if (!Number.isSafeInteger(size) || size < 0) {
    return new Error(`invalid message: "size" should be an unsigned integer`)
  }
}

function validateSignature(msg) {
  const { sig } = msg
  if (typeof sig !== 'string') {
    return new Error('invalid message: must have sig as a string')
  }
  let sigBuf
  try {
    sigBuf = Buffer.from(base58.decode(sig))
    if (sigBuf.length !== 64) {
      // prettier-ignore
      return new Error('invalid message: sig should be 64 bytes but was ' + sigBuf.length + ', on feed: ' + msg.metadata.who);
    }
  } catch (err) {
    return new Error('invalid message: sig must be a base58 string')
  }

  const publicKeyBuf = Buffer.from(base58.decode(msg.metadata.who))
  const signableBuf = Buffer.from(stringify(msg.metadata), 'utf8')
  const verified = ed25519.verify(publicKeyBuf, sigBuf, signableBuf)
  if (!verified) {
    // prettier-ignore
    return new Error('invalid message: sig does not match, on feed: ' + msg.metadata.who);
  }
}

/**
 *
 * @param {any} msg
 * @param {Tangle} tangle
 * @param {*} tangleId
 * @returns
 */
function validateTangle(msg, tangle, tangleId) {
  if (!msg.metadata.tangles[tangleId]) {
    return new Error('invalid message: must have metadata.tangles.' + tangleId)
  }
  const { depth, prev } = msg.metadata.tangles[tangleId]
  if (!prev || !Array.isArray(prev)) {
    // prettier-ignore
    return new Error('invalid message: prev must be an array, on feed: ' + msg.metadata.who);
  }
  if (!Number.isSafeInteger(depth) || depth <= 0) {
    // prettier-ignore
    return new Error('invalid message: depth must be a positive integer, on feed: ' + msg.metadata.who);
  }
  if (tangle.isFeed()) {
    const { type, who } = tangle.getFeed()
    if (type !== msg.metadata.type) {
      // prettier-ignore
      return new Error(`invalid message: type "${msg.metadata.type}" does not match feed type "${type}"`)
    }
    if (who !== msg.metadata.who) {
      // prettier-ignore
      return new Error(`invalid message: who "${msg.metadata.who}" does not match feed who "${who}"`)
    }
  }
  let lastPrev = null
  let minDiff = Infinity
  let countPrevUnknown = 0
  for (const p of prev) {
    if (typeof p !== 'string') {
      // prettier-ignore
      return new Error('invalid message: prev must contain strings but found ' + p + ', on feed: ' + msg.metadata.who);
    }
    if (p.startsWith('ppppp:')) {
      // prettier-ignore
      return new Error('invalid message: prev must not contain URIs, on feed: ' + msg.metadata.who);
    }
    if (lastPrev !== null) {
      if (p === lastPrev) {
        return new Error(`invalid message: prev must be unique set, on feed ${msg.metadata.who}`)
      }
      if (p < lastPrev) {
        return new Error(`invalid message: prev must be sorted in alphabetical order, on feed ${msg.metadata.who}`)
      }
    }
    lastPrev = p

    if (!tangle.has(p)) {
      countPrevUnknown += 1
      continue
    }
    const prevDepth = tangle.getDepth(p)

    const diff = depth - prevDepth
    if (diff <= 0) {
      // prettier-ignore
      return new Error('invalid message: depth of prev ' + p + ' is not lower, on feed: ' + msg.metadata.who);
    }
    if (diff < minDiff) minDiff = diff
  }

  if (countPrevUnknown === prev.length) {
    // prettier-ignore
    return new Error('invalid message: all prev are locally unknown, on feed: ' + msg.metadata.who)
  }

  if (countPrevUnknown === 0 && minDiff !== 1) {
    // prettier-ignore
    return new Error('invalid message: depth must be the largest prev depth plus one');
  }
}

function validateTangleRoot(msg, msgHash, tangleId) {
  if (msgHash !== tangleId) {
    // prettier-ignore
    return new Error('invalid message: tangle root hash must match tangleId, on feed: ' + msg.metadata.who);
  }
  if (msg.metadata.tangles[tangleId]) {
    // prettier-ignore
    return new Error('invalid message: tangle root must not have self tangle data, on feed: ' + msg.metadata.who);
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

function validateContent(msg) {
  const { content } = msg
  if (content === null) {
    return
  }
  if (Array.isArray(content)) {
    return new Error('invalid message: content must not be an array')
  }
  if (typeof content !== 'object' && typeof content !== 'string') {
    // prettier-ignore
    return new Error('invalid message: content must be an object or string, on feed: ' + msg.metadata.who);
  }
  const [hash, size] = representContent(content)
  if (hash !== msg.metadata.hash) {
    // prettier-ignore
    return new Error('invalid message: content hash does not match metadata.hash, on feed: ' + msg.metadata.who);
  }
  if (size !== msg.metadata.size) {
    // prettier-ignore
    return new Error('invalid message: content size does not match metadata.size, on feed: ' + msg.metadata.who);
  }
}

function validate(msg, tangle, msgHash, rootHash) {
  let err
  if ((err = validateShape(msg))) return err
  if ((err = validateWho(msg))) return err
  if ((err = validateSize(msg))) return err
  if (tangle.size() === 0) {
    if ((err = validateTangleRoot(msg, msgHash, rootHash))) return err
  } else {
    if ((err = validateTangle(msg, tangle, rootHash))) return err
  }
  if ((err = validateContent(msg))) return err
  if ((err = validateSignature(msg))) return err
}

module.exports = {
  validateType,
  validateContent,
  validate,
  validateMsgHash,
}
