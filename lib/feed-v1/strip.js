const { getMsgHash } = require('./get-msg-id')

function stripMsgKey(msgKey) {
  if (typeof msgKey === 'object') {
    if (msgKey.key) return stripMsgKey(msgKey.key)
    else return getMsgHash(msgKey)
  }
  if (msgKey.startsWith('ppppp:message/v1/')) {
    const parts = msgKey.split('/')
    return parts[parts.length - 1]
  } else {
    return msgKey
  }
}

function stripAuthor(id) {
  const withoutPrefix = id.replace('ppppp:feed/v1/', '')
  return withoutPrefix.split('/')[0]
}

module.exports = {
  stripMsgKey,
  stripAuthor,
}
