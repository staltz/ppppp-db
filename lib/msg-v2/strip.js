const { getMsgHash } = require('./get-msg-id')

function stripMsgKey(msgKey) {
  if (typeof msgKey === 'object') {
    if (msgKey.key) return stripMsgKey(msgKey.key)
    else return getMsgHash(msgKey)
  }
  if (msgKey.startsWith('ppppp:message/v2/')) {
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
function stripGroup(id) {
  if (id.startsWith('ppppp:group/v2/') === false) return id
  const withoutPrefix = id.replace('ppppp:group/v2/', '')
  return withoutPrefix.split('/')[0]
}

module.exports = {
  stripMsgKey,
  stripGroup,
}
