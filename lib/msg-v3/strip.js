const { getMsgHash } = require('./get-msg-id')

/**
 * @typedef {import('.').Msg} Msg
 */

/**
 * @param {any} msgKey
 */
function stripMsgKey(msgKey) {
  if (typeof msgKey === 'object') {
    if (msgKey.key) return stripMsgKey(msgKey.key)
    else return getMsgHash(msgKey)
  }
  if (msgKey.startsWith('ppppp:message/v3/')) {
    const parts = msgKey.split('/')
    return parts[parts.length - 1]
  } else {
    return msgKey
  }
}

/**
 * @param {string} id
 * @returns {string}
 */
function stripIdentity(id) {
  if (id.startsWith('ppppp:identity/v3/') === false) return id
  const withoutPrefix = id.replace('ppppp:identity/v3/', '')
  return withoutPrefix.split('/')[0]
}

module.exports = {
  stripMsgKey,
  stripIdentity,
}
