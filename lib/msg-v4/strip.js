/**
 * @typedef {import('.').Msg} Msg
 */

/**
 * @param {string} accountId
 * @returns {string}
 */
function stripAccount(accountId) {
  if (accountId.startsWith('ppppp:account/v4/') === false) return accountId
  const withoutPrefix = accountId.replace('ppppp:account/v4/', '')
  return withoutPrefix.split('/')[0]
}

module.exports = {
  stripAccount,
}
