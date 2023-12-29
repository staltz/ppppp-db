function createPeer(globalConfig) {
  return require('secret-stack/bare')()
    .use(require('secret-stack/plugins/net'))
    .use(require('secret-handshake-ext/secret-stack'))
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { shse: { caps: require('ppppp-caps') }, global: globalConfig })
}

module.exports = {
  createPeer,
}
