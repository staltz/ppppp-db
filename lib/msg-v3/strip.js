/**
 * @typedef {import('.').Msg} Msg
 */

/**
 * @param {string} id
 * @returns {string}
 */
function stripAccount(id) {
  if (id.startsWith('ppppp:account/v3/') === false) return id
  const withoutPrefix = id.replace('ppppp:account/v3/', '')
  return withoutPrefix.split('/')[0]
}

module.exports = {
  stripAccount,
}
