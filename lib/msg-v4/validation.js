const b4a = require('b4a')
const base58 = require('bs58')
const Keypair = require('ppppp-keypair')
// @ts-ignore
const stringify = require('json-canon')
const Tangle = require('./tangle')
const representData = require('./represent-data')
const isMoot = require('./is-moot')
const {
  SIGNATURE_TAG_MSG_V4,
  ACCOUNT_SELF,
  ACCOUNT_ANY,
} = require('./constants')

/**
 * @typedef {import('.').Msg} Msg
 * @typedef {import('.').AccountData} AccountData
 */

/**
 * @param {Msg} msg
 * @returns {string | undefined}
 */
function validateShape(msg) {
  if (!msg || typeof msg !== 'object') {
    return 'invalid msg: not an object\n' + JSON.stringify(msg)
  }
  if (!('data' in msg)) {
    return 'invalid msg: must have data\n' + JSON.stringify(msg)
  }
  if (!msg.metadata || typeof msg.metadata !== 'object') {
    return 'invalid msg: must have metadata\n' + JSON.stringify(msg)
  }
  if (!('dataHash' in msg.metadata)) {
    return 'invalid msg: must have metadata.dataHash\n' + JSON.stringify(msg)
  }
  if (!('dataSize' in msg.metadata)) {
    return 'invalid msg: must have metadata.dataSize\n' + JSON.stringify(msg)
  }
  if (!('account' in msg.metadata)) {
    return 'invalid msg: must have metadata.account\n' + JSON.stringify(msg)
  }
  if (!('accountTips' in msg.metadata)) {
    return 'invalid msg: must have metadata.accountTips\n' + JSON.stringify(msg)
  }
  if (!('tangles' in msg.metadata)) {
    return 'invalid msg: must have metadata.tangles\n' + JSON.stringify(msg)
  }
  if (!('domain' in msg.metadata)) {
    return 'invalid msg: must have metadata.domain\n' + JSON.stringify(msg)
  }
  if (msg.metadata.v !== 4) {
    return 'invalid msg: must have metadata.v=4\n' + JSON.stringify(msg)
  }
  if (typeof msg.sig !== 'string') {
    return 'invalid msg: must have sig\n' + JSON.stringify(msg)
  }
}

/**
 * @param {Msg} msg
 * @returns {string | undefined}
 */
function validateSigkey(msg) {
  const { sigkey } = msg
  if (typeof sigkey !== 'string') {
    // prettier-ignore
    return `invalid msg: sigkey "${sigkey}" should have been a string\n` + JSON.stringify(msg)
  }
  try {
    const sigkeyBuf = base58.decode(sigkey)
    if (sigkeyBuf.length !== 32) {
      // prettier-ignore
      return `invalid msg: decoded "sigkey" should be 32 bytes but was ${sigkeyBuf.length}\n` + JSON.stringify(msg)
    }
  } catch (err) {
    // prettier-ignore
    return `invalid msg: sigkey "${sigkey}" should have been a base58 string\n` + JSON.stringify(msg)
  }
}

/**
 *
 * @param {Msg} msg
 * @param {Tangle} tangle
 * @param {Set<string>} sigkeys
 * @returns {string | undefined}
 */
function validateSigkeyAndAccount(msg, tangle, sigkeys) {
  if (tangle.type === 'feed' || tangle.type === 'weave') {
    if (msg.metadata.account === ACCOUNT_SELF) {
      // prettier-ignore
      return `invalid msg: account "${msg.metadata.account}" cannot be "self" in a feed tangle\n` + JSON.stringify(msg)
    }
    if (msg.metadata.account !== ACCOUNT_ANY && !sigkeys.has(msg.sigkey)) {
      // prettier-ignore
      return `invalid msg: sigkey "${msg.sigkey}" should have been one of "${[...sigkeys]}" from the account "${msg.metadata.account}"\n` + JSON.stringify(msg)
    }
  } else if (tangle.type === 'account') {
    if (msg.metadata.account !== ACCOUNT_SELF) {
      // prettier-ignore
      return `invalid msg: account "${msg.metadata.account}" should have been "self" in an account tangle\n` + JSON.stringify(msg)
    }
    if (msg.metadata.accountTips !== null) {
      // prettier-ignore
      return `invalid msg: accountTips "${msg.metadata.accountTips}" should have been null in an account tangle\n` + JSON.stringify(msg)
    }
  }
}

/**
 * @param {string} str
 * @returns {string | undefined}
 */
function validateMsgID(str) {
  try {
    const hashBuf = b4a.from(base58.decode(str))
    if (hashBuf.length !== 32) {
      // prettier-ignore
      return `invalid msgID "${str}": should have 32 bytes but has ${hashBuf.length}`
    }
  } catch (err) {
    return `invalid msgID "${str}": should have been a base58 string`
  }
}

/**
 * @param {Msg} msg
 * @returns {string | undefined}
 */
function validateSignature(msg) {
  const { sig } = msg
  if (typeof sig !== 'string') {
    // prettier-ignore
    return `invalid msg: sig "${sig}" should have been a string\n` + JSON.stringify(msg)
  }
  let sigBuf
  try {
    sigBuf = b4a.from(base58.decode(sig))
    if (sigBuf.length !== 64) {
      // prettier-ignore
      return `invalid msg: sig should be 64 bytes but was ${sigBuf.length}\n` + JSON.stringify(msg)
    }
  } catch (err) {
    // prettier-ignore
    return `invalid msg: sig "${sig}" should have been a base58 string\n` + JSON.stringify(msg)
  }

  const signableBuf = b4a.from(
    SIGNATURE_TAG_MSG_V4 + stringify(msg.metadata),
    'utf8'
  )
  const keypair = {
    curve: /** @type {const} */ ('ed25519'),
    public: msg.sigkey,
  }
  const verified = Keypair.verify(keypair, signableBuf, sig)
  if (!verified) {
    return 'invalid msg: sig is invalid\n' + JSON.stringify(msg)
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
    return `invalid msg: must have metadata.tangles.${tangleID}\n` + JSON.stringify(msg)
  }
  const { depth, prev } = msg.metadata.tangles[tangleID]
  if (!prev || !Array.isArray(prev)) {
    // prettier-ignore
    return `invalid msg: prev "${prev}" should have been an array\n` + JSON.stringify(msg)
  }
  if (!Number.isSafeInteger(depth) || depth <= 0) {
    // prettier-ignore
    return `invalid msg: depth "${depth}" should have been a positive integer\n` + JSON.stringify(msg)
  }
  if (tangle.type === 'feed') {
    const { account, domain } = /** @type {MootDetails} */ (tangle.mootDetails)
    if (domain !== msg.metadata.domain) {
      // prettier-ignore
      return `invalid msg: domain "${msg.metadata.domain}" should have been feed domain "${domain}"\n` + JSON.stringify(msg)
    }
    if (account !== msg.metadata.account) {
      // prettier-ignore
      return `invalid msg: account "${msg.metadata.account}" should have been feed account "${account}"\n` + JSON.stringify(msg)
    }
  }
  let lastPrev = null
  let minDiff = Infinity
  let countPrevUnknown = 0
  for (const p of prev) {
    if (typeof p !== 'string') {
      // prettier-ignore
      return `invalid msg: prev item "${p}" should have been a string\n` + JSON.stringify(msg)
    }
    if (p.startsWith('ppppp:')) {
      // prettier-ignore
      return `invalid msg: prev item "${p}" is a URI, but should have been a hash\n` + JSON.stringify(msg)
    }
    if (lastPrev !== null) {
      if (p === lastPrev) {
        // prettier-ignore
        return `invalid msg: prev "${prev}" contains duplicates\n` + JSON.stringify(msg)
      }
      if (p < lastPrev) {
        // prettier-ignore
        return `invalid msg: prev "${prev}" should have been alphabetically sorted\n` + JSON.stringify(msg)
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
      return `invalid msg: depth of prev "${p}" should have been lower than this message's depth\n` + JSON.stringify(msg)
    }
    if (diff < minDiff) minDiff = diff
  }

  if (countPrevUnknown === prev.length) {
    return 'invalid msg: all prev are locally unknown\n' + JSON.stringify(msg)
  }

  if (countPrevUnknown === 0 && minDiff !== 1) {
    // prettier-ignore
    return `invalid msg: depth must be the largest prev depth plus one\n` + JSON.stringify(msg)
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
    return `invalid msg: tangle root "${msgID}" must match tangleID "${tangleID}"\n` + JSON.stringify(msg)
  }
  if (msg.metadata.tangles[tangleID]) {
    // prettier-ignore
    return `invalid msg: tangle root "${tangleID}" must not have self tangle data\n` + JSON.stringify(msg)
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
    return `invalid domain: "${domain}" is 100+ characters long`
  }
  if (domain.length < 3) {
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
    // prettier-ignore
    return `invalid msg: data "${data}" must not be an array\n` + JSON.stringify(msg)
  }
  if (typeof data !== 'object' && typeof data !== 'string') {
    // prettier-ignore
    return `invalid msg: data "${data}" must be an object or a string` + JSON.stringify(msg)
  }
}

/**
 * @param {Msg} msg
 */
function validateDataSizeHash(msg) {
  const { dataHash: actualHash, dataSize: actualSize } = msg.metadata
  if (!Number.isSafeInteger(actualSize) || actualSize < 0) {
    // prettier-ignore
    return `invalid msg: dataSize ${actualSize} should have been an unsigned integer\n` + JSON.stringify(msg)
  }

  if (msg.data === null) return
  const [expectedHash, expectedSize] = representData(msg.data)
  if (actualHash !== expectedHash) {
    // prettier-ignore
    return `invalid msg: metadata.dataHash "${actualHash}" should have been "${expectedHash}"\n` + JSON.stringify(msg)
  }
  if (expectedSize !== msg.metadata.dataSize) {
    // prettier-ignore
    return `invalid msg: metadata.dataSize ${actualSize} should have been "${expectedSize}"\n` + JSON.stringify(msg)
  }
}

/**
 * @param {Msg} msg
 * @param {Tangle} tangle
 * @param {Set<string>} sigkeys
 * @param {string} msgID
 * @param {string} rootID
 */
function validate(msg, tangle, sigkeys, msgID, rootID) {
  let err
  if ((err = validateShape(msg))) return err
  if ((err = validateSigkey(msg))) return err
  if ((err = validateData(msg))) return err

  if (tangle.type === 'feed' && isMoot(msg)) return // nothing else to check

  if ((err = validateDataSizeHash(msg))) return err
  if ((err = validateDomain(msg.metadata.domain))) return err
  if ((err = validateSigkeyAndAccount(msg, tangle, sigkeys))) return err
  if (msgID === rootID) {
    if ((err = validateTangleRoot(msg, msgID, rootID))) return err
  } else {
    if ((err = validateTangle(msg, tangle, rootID))) return err
  }
  if ((err = validateSignature(msg))) return err
}

module.exports = {
  validateDomain,
  validateData,
  validateShape,
  validate,
  validateMsgID,
}
