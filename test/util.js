const ssbKeys = require('ssb-keys')
const SSBURI = require('ssb-uri2')
const base58 = require('bs58')

function generateKeypair(seed) {
  const keys = ssbKeys.generate('ed25519', seed, 'buttwoo-v1')
  const { data } = SSBURI.decompose(keys.id)
  keys.id = `ssb:feed/dag/${base58.encode(Buffer.from(data, 'base64'))}`
  return keys
}

module.exports = {
  generateKeypair,
}
