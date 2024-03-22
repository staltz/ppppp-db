const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const p = require('node:util').promisify
const os = require('node:os')
const rimraf = require('rimraf')
const Keypair = require('ppppp-keypair')
const { createPeer } = require('./util')
const MsgV4 = require('../lib/msg-v4')

const DIR = path.join(os.tmpdir(), 'ppppp-db-account-add')
rimraf.sync(DIR)

test('account.add()', async (t) => {
  await t.test('Basic usage', async (t) => {
    const keypair1 = Keypair.generate('ed25519', 'alice')
    const keypair2 = Keypair.generate('ed25519', 'bob')

    const peer = createPeer({ keypair: keypair1, path: DIR })

    await peer.db.loaded()
    const account = await p(peer.db.account.create)({
      keypair: keypair1,
      subdomain: 'person',
    })

    assert.equal(peer.db.account.has({ account, keypair: keypair2 }), false)

    const consent = peer.db.account.consent({ account, keypair: keypair2 })

    const accountRec1 = await p(peer.db.account.add)({
      account,
      keypair: keypair2,
      consent,
      powers: ['external-encryption'],
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
        powers: ['external-encryption'],
      },
      'msg.data.add NEW KEY'
    )
    assert.equal(msg.metadata.account, 'self', 'msg.metadata.account')
    assert.equal(msg.metadata.accountTips, null, 'msg.metadata.accountTips')
    assert.equal(msg.metadata.domain, 'account__person', 'msg.metadata.domain')
    assert.deepEqual(
      msg.metadata.tangles,
      { [account]: { depth: 1, prev: [account] } },
      'msg.metadata.tangles'
    )
    assert.equal(msg.sigkey, keypair1.public, 'msg.sigkey OLD KEY')

    assert.equal(peer.db.account.has({ account, keypair: keypair2 }), true)

    await p(peer.close)()
  })

  await t.test('keypair with no "add" powers cannot add', async (t) => {
    rimraf.sync(DIR)
    const keypair1 = Keypair.generate('ed25519', 'alice')
    const keypair2 = Keypair.generate('ed25519', 'bob')
    const keypair3 = Keypair.generate('ed25519', 'carol')

    const peer1 = createPeer({ keypair: keypair1, path: DIR })

    await peer1.db.loaded()
    const id = await p(peer1.db.account.create)({
      keypair: keypair1,
      subdomain: 'account',
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

    const peer2 = createPeer({ keypair: keypair2, path: DIR })

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

    const peer1again = createPeer({ keypair: keypair1, path: DIR })

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

    let peer = createPeer({ keypair: keypair1, path: DIR })

    await peer.db.loaded()

    const account = await p(peer.db.account.create)({
      keypair: keypair1,
      subdomain: 'person',
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
    const mootRec = peer.db.feed.findMoot(account, 'post')
    assert.ok(mootRec, 'posts moot exists')

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
        v: 4,
      },
      'postsRoot'
    )
    assert.deepEqual(_post.msg, postRec.msg, 'postMsg')

    await p(peer.close)()

    // Re-load as Carol, add the msgs to validate them
    rimraf.sync(DIR)
    const keypair3 = Keypair.generate('ed25519', 'carol')

    const carol = createPeer({ keypair: keypair3, path: DIR })

    await carol.db.loaded()

    await p(carol.db.add)(accountMsg0, account)
    await p(carol.db.add)(accountRec1.msg, account)
    await p(carol.db.add)(postsRoot.msg, mootRec.id)
    await p(carol.db.add)(postRec.msg, mootRec.id)
    // t.pass('carol added all msgs successfully')

    await p(carol.close)()
  })

  await t.test(
    "Can't publish with a key if the key has been del'd",
    async (t) => {
      rimraf.sync(DIR)

      const keypair1 = Keypair.generate('ed25519', 'alice')
      const keypair2 = Keypair.generate('ed25519', 'bob')

      let peer = createPeer({ keypair: keypair1, path: DIR })

      await peer.db.loaded()

      const account = await p(peer.db.account.create)({
        keypair: keypair1,
        subdomain: 'person',
      })
      const accountMsg0 = peer.db.get(account)

      const consent = peer.db.account.consent({ account, keypair: keypair2 })

      const accountRec1 = await p(peer.db.account.add)({
        account,
        keypair: keypair2,
        consent,
        powers: ['external-encryption'],
      })

      const goodRec = await p(peer.db.feed.publish)({
        account,
        domain: 'post',
        data: { text: 'potato' },
        keypair: keypair2,
      })
      const postMootRec = peer.db.feed.findMoot(account, 'post')

      const accountRoot = peer.db.get(account)

      const tangle = new MsgV4.Tangle(account)
      tangle.add(account, accountRoot)
      // can't publish() account msgs. and creating this manually for now until we have a .del() fn
      const delMsg = MsgV4.create({
        account: 'self',
        accountTips: null,
        domain: accountRoot.metadata.domain,
        keypair: keypair1,
        tangles: {
          [account]: tangle,
        },
        data: {
          action: 'del',
          key: {
            purpose: 'sig',
            algorithm: 'ed25519',
            bytes: keypair2.public,
          },
        },
      })
      await p(peer.db.add)(delMsg, account)

      const badRec = await p(peer.db.feed.publish)({
        account,
        domain: 'post',
        data: { text: 'potato2' },
        keypair: keypair2,
      })

      // Re-load as Carol, add the msgs to validate them
      rimraf.sync(DIR)
      const keypair3 = Keypair.generate('ed25519', 'carol')

      const carol = createPeer({ keypair: keypair3, path: DIR })

      await carol.db.loaded()

      await p(carol.db.add)(accountMsg0, account)
      await p(carol.db.add)(accountRec1.msg, account)
      await p(carol.db.add)(postMootRec.msg, postMootRec.id)
      await p(carol.db.add)(goodRec.msg, postMootRec.id)
      await p(carol.db.add)(delMsg, account)
      await assert.rejects(
        p(carol.db.add)(badRec.msg, postMootRec.id),
        /add\(\) failed to verify msg/,
        "Adding msg with del'd keypair is supposed to fail"
      )

      await p(carol.close)()
    }
  )
})
