const { stripGroup } = require('./strip')

function isEmptyObject(obj) {
  for (const _key in obj) {
    return false
  }
  return true
}

function isFeedRoot(msg, groupId = 0, findType = 0) {
  const { dataHash, dataSize, group, groupTips, tangles, type } = msg.metadata
  if (dataHash !== null) return false
  if (dataSize !== 0) return false
  if (groupId === 0 && !group) return false
  if (groupId !== 0 && group !== stripGroup(groupId)) return false
  if (groupTips !== null) return false
  if (!isEmptyObject(tangles)) return false
  if (findType !== 0 && type !== findType) return false
  return true
}

module.exports = isFeedRoot
