const { stripAccount } = require('./strip')
const { isEmptyObject } = require('./util')

/**
 * @typedef {import('.').Msg} Msg
 */

/**
 * @param {Msg} msg
 * @param {string | 0} id
 * @param {string | 0} findDomain
 */
function isMoot(msg, id = 0, findDomain = 0) {
  const { dataHash, dataSize, account, accountTips, tangles, domain } =
    msg.metadata
  if (msg.data !== null) return false
  if (dataHash !== null) return false
  if (dataSize !== 0) return false
  if (account === 'self') return false
  if (id !== 0 && account !== stripAccount(id)) return false
  if (accountTips !== null) return false
  if (!isEmptyObject(tangles)) return false
  if (findDomain !== 0 && domain !== findDomain) return false
  return true
}

module.exports = isMoot
