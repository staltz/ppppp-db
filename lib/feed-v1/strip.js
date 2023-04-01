function stripMsgKey(msgKey) {
  if (typeof msgKey === 'object') return stripMsgKey(msgKey.key)
  if (msgKey.startsWith('ssb:message/dag/')) {
    const parts = msgKey.split('/')
    return parts[parts.length - 1]
  } else {
    return msgKey
  }
}

function unstripMsgKey(nativeMsg, msgId) {
  const { author, type } = nativeMsg.metadata
  return `ssb:message/dag/${author}/${type}/${msgId}`
}

function stripAuthor(id) {
  const withoutPrefix = id.replace('ssb:feed/dag/', '')
  return withoutPrefix.split('/')[0]
}

function unstripAuthor(nativeMsg) {
  const { author, type } = nativeMsg.metadata
  return `ssb:feed/dag/${author}/${type}`
}

module.exports = {
  stripMsgKey,
  unstripMsgKey,
  stripAuthor,
  unstripAuthor,
}
