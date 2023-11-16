const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')
const p = require('node:util').promisify
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ppppp-caps')
const Keypair = require('ppppp-keypair')

const DIR = path.join(os.tmpdir(), 'ppppp-db-account-create')
rimraf.sync(DIR)

test('account.create() ', async (t) => {
  await t.test('create with just "domain"', async (t) => {
    const keypair = Keypair.generate('ed25519', 'alice')
    const peer = SecretStack({ appKey: caps.shse })
      .use(require('../lib'))
      .use(require('ssb-box'))
      .call(null, { keypair, path: DIR })

    await peer.db.loaded()
    const account = await p(peer.db.account.create)({
      domain: 'person',
      _nonce: 'MYNONCE',
    })
    assert.ok(account, 'accountRec0 exists')
    const msg = peer.db.get(account)
    assert.deepEqual(
      msg.data,
      {
        action: 'add',
        key: {
          purpose: 'sig',
          algorithm: 'ed25519',
          bytes: keypair.public,
        },
        nonce: 'MYNONCE',
        powers: ['add', 'del', 'box'],
      },
      'msg.data'
    )
    assert.equal(msg.metadata.account, 'self', 'msg.metadata.account')
    assert.equal(msg.metadata.accountTips, null, 'msg.metadata.accountTips')
    assert.deepEqual(
      Object.keys(msg.metadata.tangles),
      [],
      'msg.metadata.tangles'
    )
    assert.equal(msg.pubkey, keypair.public, 'msg.pubkey')

    await p(peer.close)()
  })

  await t.test('create with "keypair" and "domain"', async (t) => {
    rimraf.sync(DIR)
    const keypair = Keypair.generate('ed25519', 'alice')

    const peer = SecretStack({ appKey: caps.shse })
      .use(require('../lib'))
      .use(require('ssb-box'))
      .call(null, { keypair, path: DIR })

    await peer.db.loaded()
    const account = await p(peer.db.account.create)({
      keypair,
      domain: 'person',
    })
    assert.ok(account, 'account created')
    const msg = peer.db.get(account)
    assert.equal(msg.data.key.bytes, keypair.public, 'msg.data')
    assert.equal(msg.metadata.account, 'self', 'msg.metadata.account')
    assert.equal(msg.metadata.accountTips, null, 'msg.metadata.accountTips')
    assert.deepEqual(
      Object.keys(msg.metadata.tangles),
      [],
      'msg.metadata.tangles'
    )
    assert.equal(msg.pubkey, keypair.public, 'msg.pubkey')

    await p(peer.close)()
  })

  await t.test('account.find() can find', async (t) => {
    rimraf.sync(DIR)
    const keypair = Keypair.generate('ed25519', 'alice')
    const domain = 'person'

    const peer = SecretStack({ appKey: caps.shse })
      .use(require('../lib'))
      .use(require('ssb-box'))
      .call(null, { keypair, path: DIR })

    await peer.db.loaded()
    const account = await p(peer.db.account.create)({ keypair, domain })
    assert.ok(account, 'account created')

    const found = await p(peer.db.account.find)({ keypair, domain })
    assert.equal(found, account, 'found')

    await p(peer.close)()
  })

  await t.test('account.findOrCreate() can find', async (t) => {
    rimraf.sync(DIR)
    const keypair = Keypair.generate('ed25519', 'alice')
    const domain = 'person'

    const peer = SecretStack({ appKey: caps.shse })
      .use(require('../lib'))
      .use(require('ssb-box'))
      .call(null, { keypair, path: DIR })

    await peer.db.loaded()
    const account = await p(peer.db.account.create)({ keypair, domain })
    assert.ok(account, 'account created')

    const found = await p(peer.db.account.findOrCreate)({ keypair, domain })
    assert.equal(found, account, 'found')

    await p(peer.close)()
  })

  await t.test('account.findOrCreate() can create', async (t) => {
    rimraf.sync(DIR)
    const keypair = Keypair.generate('ed25519', 'alice')
    const domain = 'person'

    const peer = SecretStack({ appKey: caps.shse })
      .use(require('../lib'))
      .use(require('ssb-box'))
      .call(null, { keypair, path: DIR })

    await peer.db.loaded()

    let gotError = false
    await p(peer.db.account.find)({ keypair, domain }).catch((err) => {
      assert.equal(err.cause, 'ENOENT')
      gotError = true
    })
    assert.ok(gotError, 'account not found')

    const account = await p(peer.db.account.findOrCreate)({ keypair, domain })
    assert.ok(account, 'account created')
    const msg = peer.db.get(account)
    assert.equal(msg.data.key.bytes, keypair.public, 'msg.data')
    assert.equal(msg.metadata.account, 'self', 'msg.metadata.account')
    assert.equal(msg.metadata.accountTips, null, 'msg.metadata.accountTips')
    assert.deepEqual(
      Object.keys(msg.metadata.tangles),
      [],
      'msg.metadata.tangles'
    )
    assert.equal(msg.pubkey, keypair.public, 'msg.pubkey')

    await p(peer.close)()
  })
})
