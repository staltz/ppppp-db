const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const p = require('node:util').promisify
const os = require('node:os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ppppp-caps')
const Keypair = require('ppppp-keypair')

const DIR = path.join(os.tmpdir(), 'ppppp-db-account-add')
rimraf.sync(DIR)

test('account.add()', async (t) => {
  await t.test('Basic usage', async (t) => {
    const keypair1 = Keypair.generate('ed25519', 'alice')
    const keypair2 = Keypair.generate('ed25519', 'bob')

    const peer = SecretStack({ appKey: caps.shse })
      .use(require('../lib'))
      .use(require('ssb-box'))
      .call(null, { keypair: keypair1, path: DIR })

    await peer.db.loaded()
    const account = await p(peer.db.account.create)({
      keypair: keypair1,
      domain: 'person',
    })

    assert.equal(peer.db.account.has({ account, keypair: keypair2 }), false)

    const consent = peer.db.account.consent({ account, keypair: keypair2 })

    const accountRec1 = await p(peer.db.account.add)({
      account,
      keypair: keypair2,
      consent,
      powers: ['box'],
    })
    assert.ok(accountRec1, 'accountRec1 exists')
    const { id, msg } = accountRec1
    assert.ok(account, 'id exists')
    assert.deepEqual(
      msg.data,
      {
        action: 'add',
        key: {
          purpose: 'sig',
          algorithm: 'ed25519',
          bytes: keypair2.public,
        },
        consent,
        powers: ['box'],
      },
      'msg.data.add NEW KEY'
    )
    assert.equal(msg.metadata.account, 'self', 'msg.metadata.account')
    assert.equal(msg.metadata.accountTips, null, 'msg.metadata.accountTips')
    assert.equal(msg.metadata.domain, 'person', 'msg.metadata.domain')
    assert.deepEqual(
      msg.metadata.tangles,
      { [account]: { depth: 1, prev: [account] } },
      'msg.metadata.tangles'
    )
    assert.equal(msg.pubkey, keypair1.public, 'msg.pubkey OLD KEY')

    assert.equal(peer.db.account.has({ account, keypair: keypair2 }), true)

    await p(peer.close)()
  })

  await t.test('keypair with no "add" powers cannot add', async (t) => {
    rimraf.sync(DIR)
    const keypair1 = Keypair.generate('ed25519', 'alice')
    const keypair2 = Keypair.generate('ed25519', 'bob')
    const keypair3 = Keypair.generate('ed25519', 'carol')

    const peer1 = SecretStack({ appKey: caps.shse })
      .use(require('../lib'))
      .use(require('ssb-box'))
      .call(null, { keypair: keypair1, path: DIR })

    await peer1.db.loaded()
    const id = await p(peer1.db.account.create)({
      keypair: keypair1,
      domain: 'account',
    })
    const msg1 = peer1.db.get(id)

    const { msg: msg2 } = await p(peer1.db.account.add)({
      account: id,
      keypair: keypair2,
      powers: [],
    })
    assert.equal(msg2.data.key.bytes, keypair2.public)

    assert.equal(peer1.db.account.has({ account: id, keypair: keypair2 }), true)

    await p(peer1.close)()
    rimraf.sync(DIR)

    const peer2 = SecretStack({ appKey: caps.shse })
      .use(require('../lib'))
      .use(require('ssb-box'))
      .call(null, { keypair: keypair2, path: DIR })

    await peer2.db.loaded()
    await p(peer2.db.add)(msg1, id)
    await p(peer2.db.add)(msg2, id)

    // Test author-side power validation
    assert.rejects(
      p(peer2.db.account.add)({
        account: id,
        keypair: keypair3,
        powers: [],
      }),
      /signing keypair does not have the "add" power/
    )

    // Make the author disobey power validation
    const { msg: msg3 } = await p(peer2.db.account.add)({
      account: id,
      keypair: keypair3,
      powers: [],
      _disobey: true,
    })

    assert.equal(msg3.data.key.bytes, keypair3.public)

    await p(peer2.close)()
    rimraf.sync(DIR)

    const peer1again = SecretStack({ appKey: caps.shse })
      .use(require('../lib'))
      .use(require('ssb-box'))
      .call(null, { keypair: keypair1, path: DIR })

    await peer1again.db.loaded()
    await p(peer1again.db.add)(msg1, id) // re-add because lost during rimraf
    await p(peer1again.db.add)(msg2, id) // re-add because lost during rimraf

    // Test replicator-side power validation
    assert.rejects(
      p(peer1again.db.add)(msg3, id),
      /add\(\) failed to verify msg/
    )

    await p(peer1again.close)()
  })

  await t.test('publish with a key in the account', async (t) => {
    rimraf.sync(DIR)

    const keypair1 = Keypair.generate('ed25519', 'alice')
    const keypair2 = Keypair.generate('ed25519', 'bob')

    let peer = SecretStack({ appKey: caps.shse })
      .use(require('../lib'))
      .use(require('ssb-box'))
      .call(null, { keypair: keypair1, path: DIR })

    await peer.db.loaded()

    const account = await p(peer.db.account.create)({
      keypair: keypair1,
      domain: 'person',
    })
    const accountMsg0 = peer.db.get(account)

    // Consent is implicitly created because keypair2 has .private
    const accountRec1 = await p(peer.db.account.add)({
      account,
      keypair: keypair2,
    })

    const postRec = await p(peer.db.feed.publish)({
      account,
      domain: 'post',
      data: { text: 'hello' },
      keypair: keypair2,
    })
    assert.equal(postRec.msg.data.text, 'hello', 'post text correct')
    const postsID = peer.db.feed.getID(account, 'post')
    assert.ok(postsID, 'postsID exists')

    const recs = [...peer.db.records()]
    assert.equal(recs.length, 4, '4 records')
    const [_accountRec0, _accountRec1, postsRoot, _post] = recs
    assert.deepEqual(_accountRec0.msg, accountMsg0, 'accountMsg0')
    assert.deepEqual(_accountRec1.msg, accountRec1.msg, 'accountMsg1')
    assert.deepEqual(
      postsRoot.msg.metadata,
      {
        dataHash: null,
        dataSize: 0,
        account,
        accountTips: null,
        tangles: {},
        domain: 'post',
        v: 3,
      },
      'postsRoot'
    )
    assert.deepEqual(_post.msg, postRec.msg, 'postMsg')

    await p(peer.close)()

    // Re-load as Carol, add the msgs to validate them
    rimraf.sync(DIR)
    const keypair3 = Keypair.generate('ed25519', 'carol')

    const carol = SecretStack({ appKey: caps.shse })
      .use(require('../lib'))
      .use(require('ssb-box'))
      .call(null, { keypair: keypair3, path: DIR })

    await carol.db.loaded()

    await p(carol.db.add)(accountMsg0, account)
    await p(carol.db.add)(accountRec1.msg, account)
    await p(carol.db.add)(postsRoot.msg, postsID)
    await p(carol.db.add)(postRec.msg, postsID)
    // t.pass('carol added all msgs successfully')

    await p(carol.close)()
  })
})
