const { stripIdentity } = require('./strip')

/**
 * @typedef {import('.').Msg} Msg
 */

/**
 * @param {any} obj
 */
function isEmptyObject(obj) {
  for (const _key in obj) {
    return false
  }
  return true
}

/**
 * @param {Msg} msg
 * @param {string | 0} id
 * @param {string | 0} findDomain
 */
function isFeedRoot(msg, id = 0, findDomain = 0) {
  const { dataHash, dataSize, identity, identityTips, tangles, domain } =
    msg.metadata
  if (dataHash !== null) return false
  if (dataSize !== 0) return false
  if (id === 0 && !identity) return false
  if (id !== 0 && identity !== stripIdentity(id)) return false
  if (identityTips !== null) return false
  if (!isEmptyObject(tangles)) return false
  if (findDomain !== 0 && domain !== findDomain) return false
  return true
}

module.exports = isFeedRoot
