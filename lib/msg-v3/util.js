
/**
 * @param {any} obj
 */
function isEmptyObject(obj) {
  for (const _key in obj) {
    return false
  }
  return true
}

module.exports = {
  isEmptyObject,
}