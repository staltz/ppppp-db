const b4a = require('b4a')
const base58 = require('bs58')
const Keypair = require('ppppp-keypair')
// @ts-ignore
const stringify = require('json-canon')
const Tangle = require('./tangle')
const representData = require('./represent-data')
const isMoot = require('./is-moot')
const { SIGNATURE_TAG_MSG_V3, ACCOUNT_SELF } = require('./constants')

/**
 * @typedef {import('.').Msg} Msg
 */

/**
 * @param {Msg} msg
 * @returns {string | undefined}
 */
function validateShape(msg) {
  if (!msg || typeof msg !== 'object') {
    return 'invalid message: not an object\n' + JSON.stringify(msg)
  }
  if (!('data' in msg)) {
    return 'invalid message: must have data\n' + JSON.stringify(msg)
  }
  if (!msg.metadata || typeof msg.metadata !== 'object') {
    return 'invalid message: must have metadata\n' + JSON.stringify(msg)
  }
  if (!('dataHash' in msg.metadata)) {
    // prettier-ignore
    return 'invalid message: must have metadata.dataHash\n' + JSON.stringify(msg)
  }
  if (!('dataSize' in msg.metadata)) {
    // prettier-ignore
    return 'invalid message: must have metadata.dataSize\n' + JSON.stringify(msg)
  }
  if (!('account' in msg.metadata)) {
    return 'invalid message: must have metadata.account\n' + JSON.stringify(msg)
  }
  if (!('accountTips' in msg.metadata)) {
    // prettier-ignore
    return 'invalid message: must have metadata.accountTips\n' + JSON.stringify(msg)
  }
  if (!('tangles' in msg.metadata)) {
    return 'invalid message: must have metadata.tangles\n' + JSON.stringify(msg)
  }
  if (!('domain' in msg.metadata)) {
    return 'invalid message: must have metadata.domain\n' + JSON.stringify(msg)
  }
  if (msg.metadata.v !== 3) {
    return 'invalid message: must have metadata.v=3\n' + JSON.stringify(msg)
  }
  if (typeof msg.sig !== 'string') {
    return 'invalid message: must have sig\n' + JSON.stringify(msg)
  }
}

/**
 * @param {Msg} msg
 * @returns {string | undefined}
 */
function validatePubkey(msg) {
  const { pubkey } = msg
  if (typeof pubkey !== 'string') {
    // prettier-ignore
    return `invalid message: pubkey "${pubkey}" should have been a string\n` + JSON.stringify(msg)
  }
  try {
    const pubkeyBuf = base58.decode(pubkey)
    if (pubkeyBuf.length !== 32) {
      // prettier-ignore
      return `invalid message: decoded "pubkey" should be 32 bytes but was ${pubkeyBuf.length}\n` + JSON.stringify(msg)
    }
  } catch (err) {
    // prettier-ignore
    return `invalid message: pubkey "${pubkey}" should have been a base58 string\n` + JSON.stringify(msg)
  }
}

/**
 *
 * @param {Msg} msg
 * @param {Set<string>} pubkeys
 * @returns {string | undefined}
 */
function validateAccountPubkey(msg, pubkeys) {
  // Unusual case: if the msg is a feed root, ignore the account and pubkey
  if (isMoot(msg)) return

  if (
    msg.metadata.account &&
    msg.metadata.account !== ACCOUNT_SELF &&
    !pubkeys.has(msg.pubkey)
  ) {
    // prettier-ignore
    return `invalid message: pubkey "${msg.pubkey}" should have been one of "${[...pubkeys]}" from the account "${msg.metadata.account}"\n` + JSON.stringify(msg)
  }
}

/**
 * @param {string} str
 * @returns {string | undefined}
 */
function validateMsgID(str) {
  try {
    const hashBuf = b4a.from(base58.decode(str))
    if (hashBuf.length !== 16) {
      // prettier-ignore
      return `invalid message: decoded hash should be 16 bytes but was ${hashBuf.length}`
    }
  } catch (err) {
    return `invalid message: msgID "${str}" should have been a base58 string`
  }
}

/**
 * @param {Msg} msg
 * @returns {string | undefined}
 */
function validateDataSize(msg) {
  const { dataSize } = msg.metadata
  if (!Number.isSafeInteger(dataSize) || dataSize < 0) {
    // prettier-ignore
    return `invalid message: dataSize ${dataSize} should have been an unsigned integer\n` + JSON.stringify(msg)
  }
}

/**
 * @param {Msg} msg
 * @returns {string | undefined}
 */
function validateSignature(msg) {
  const { sig } = msg
  if (typeof sig !== 'string') {
    return (
      `invalid message: sig "${sig}" should have been a string\n` +
      JSON.stringify(msg)
    )
  }
  let sigBuf
  try {
    sigBuf = b4a.from(base58.decode(sig))
    if (sigBuf.length !== 64) {
      // prettier-ignore
      return `invalid message: sig should be 64 bytes but was ${sigBuf.length}\n` + JSON.stringify(msg)
    }
  } catch (err) {
    // prettier-ignore
    return `invalid message: sig "${sig}" should have been a base58 string\n` + JSON.stringify(msg)
  }

  const signableBuf = b4a.from(
    SIGNATURE_TAG_MSG_V3 + stringify(msg.metadata),
    'utf8'
  )
  const keypair = { curve: 'ed25519', public: msg.pubkey }
  const verified = Keypair.verify(keypair, signableBuf, sig)
  if (!verified) {
    return 'invalid message: sig is invalid\n' + JSON.stringify(msg)
  }
}

/**
 * @typedef {NonNullable<Tangle['mootDetails']>} MootDetails
 */

/**
 * @param {Msg} msg
 * @param {Tangle} tangle
 * @param {string} tangleID
 * @returns
 */
function validateTangle(msg, tangle, tangleID) {
  if (!msg.metadata.tangles[tangleID]) {
    // prettier-ignore
    return `invalid message: must have metadata.tangles.${tangleID}\n` + JSON.stringify(msg)
  }
  const { depth, prev } = msg.metadata.tangles[tangleID]
  if (!prev || !Array.isArray(prev)) {
    // prettier-ignore
    return `invalid message: prev "${prev}" should have been an array\n` + JSON.stringify(msg)
  }
  if (!Number.isSafeInteger(depth) || depth <= 0) {
    // prettier-ignore
    return `invalid message: depth "${depth}" should have been a positive integer\n` + JSON.stringify(msg)
  }
  if (tangle.isFeed()) {
    const { account, domain } = /** @type {MootDetails} */ (tangle.mootDetails)
    if (domain !== msg.metadata.domain) {
      // prettier-ignore
      return `invalid message: domain "${msg.metadata.domain}" should have been feed domain "${domain}"\n` + JSON.stringify(msg)
    }
    if (account !== msg.metadata.account) {
      // prettier-ignore
      return `invalid message: account "${msg.metadata.account}" should have been feed account "${account}"\n` + JSON.stringify(msg)
    }
  }
  let lastPrev = null
  let minDiff = Infinity
  let countPrevUnknown = 0
  for (const p of prev) {
    if (typeof p !== 'string') {
      // prettier-ignore
      return `invalid message: prev item "${p}" should have been a string\n` + JSON.stringify(msg)
    }
    if (p.startsWith('ppppp:')) {
      // prettier-ignore
      return `invalid message: prev item "${p}" is a URI, but should have been a hash\n` + JSON.stringify(msg)
    }
    if (lastPrev !== null) {
      if (p === lastPrev) {
        // prettier-ignore
        return `invalid message: prev "${prev}" contains duplicates\n` + JSON.stringify(msg)
      }
      if (p < lastPrev) {
        // prettier-ignore
        return `invalid message: prev "${prev}" should have been alphabetically sorted\n` + JSON.stringify(msg)
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
      return `invalid message: depth of prev "${p}" should have been lower than this message's depth\n` + JSON.stringify(msg)
    }
    if (diff < minDiff) minDiff = diff
  }

  if (countPrevUnknown === prev.length) {
    // prettier-ignore
    return 'invalid message: all prev are locally unknown\n' + JSON.stringify(msg)
  }

  if (countPrevUnknown === 0 && minDiff !== 1) {
    // prettier-ignore
    return `invalid message: depth must be the largest prev depth plus one\n` + JSON.stringify(msg)
  }
}

/**
 * @param {Msg} msg
 * @param {string} msgID
 * @param {string} tangleID
 */
function validateTangleRoot(msg, msgID, tangleID) {
  if (msgID !== tangleID) {
    // prettier-ignore
    return `invalid message: tangle root "${msgID}" must match tangleID "${tangleID}"\n` + JSON.stringify(msg)
  }
  if (msg.metadata.tangles[tangleID]) {
    // prettier-ignore
    return `invalid message: tangle root "${tangleID}" must not have self tangle data\n` + JSON.stringify(msg)
  }
}

/**
 * @param {string} domain
 */
function validateDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    // prettier-ignore
    return `invalid domain: "${domain}" (${typeof domain}) should have been a string`
  }
  if (domain.length > 100) {
    // prettier-ignore
    return `invalid domain: "${domain}" is 100+ characters long`
  }
  if (domain.length < 3) {
    // prettier-ignore
    return `invalid domain: "${domain}" is shorter than 3 characters`
  }
  if (/[^a-zA-Z0-9_]/.test(domain)) {
    // prettier-ignore
    return `invalid domain: "${domain}" contains characters other than a-z, A-Z, 0-9, or _`
  }
}

/**
 * @param {Msg} msg
 */
function validateData(msg) {
  const { data } = msg
  if (data === null) {
    return
  }
  if (Array.isArray(data)) {
    return (
      `invalid message: data "${data}" must not be an array\n` +
      JSON.stringify(msg)
    )
  }
  if (typeof data !== 'object' && typeof data !== 'string') {
    return (
      `invalid message: data "${data}" must be an object or a string` +
      JSON.stringify(msg)
    )
  }
  const [dataHash, dataSize] = representData(data)
  if (dataHash !== msg.metadata.dataHash) {
    // prettier-ignore
    return `invalid message: data hash "${dataHash}" does not match metadata.dataHash "${msg.metadata.dataHash}"\n` + JSON.stringify(msg)
  }
  if (dataSize !== msg.metadata.dataSize) {
    // prettier-ignore
    return `invalid message: data size "${dataSize}" does not match metadata.dataSize "${msg.metadata.dataSize}"\n` + JSON.stringify(msg)
  }
}

/**
 * @param {Msg} msg
 * @param {Tangle} tangle
 * @param {Set<string>} pubkeys
 * @param {string} msgID
 * @param {string} rootID
 */
function validate(msg, tangle, pubkeys, msgID, rootID) {
  let err
  if ((err = validateShape(msg))) return err
  if ((err = validatePubkey(msg))) return err
  if ((err = validateDataSize(msg))) return err
  if ((err = validateData(msg))) return err
  if ((err = validateDomain(msg.metadata.domain))) return err
  if ((err = validateAccountPubkey(msg, pubkeys))) return err
  if (tangle.size() === 0) {
    if ((err = validateTangleRoot(msg, msgID, rootID))) return err
  } else {
    if ((err = validateTangle(msg, tangle, rootID))) return err
  }
  if ((err = validateSignature(msg))) return err
}

module.exports = {
  validateDomain,
  validateData,
  validate,
  validateMsgID,
}
