const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const p = require('node:util').promisify
const os = require('node:os')
const rimraf = require('rimraf')
const Keypair = require('ppppp-keypair')
const { createPeer } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-sigkeys')
const DIR2 = path.join(os.tmpdir(), 'ppppp-db-sigkeys2')
rimraf.sync(DIR)
rimraf.sync(DIR2)

test('sigkeys', async (t) => {
  await t.test(
    "Can't add msg that is signed by key newer than what accountTips points to",
    async (t) => {
      const keypair1 = Keypair.generate('ed25519', 'alice')
      const keypair2 = Keypair.generate('ed25519', 'alice2')
      const keypairOther = Keypair.generate('ed25519', 'bob')

      const peer = createPeer({ keypair: keypair1, path: DIR })
      const peerOther = createPeer({ keypair: keypairOther, path: DIR2 })

      await peer.db.loaded()
      await peerOther.db.loaded()

      const account = await p(peer.db.account.create)({
        keypair: keypair1,
        subdomain: 'person',
      })

      assert.equal(peer.db.account.has({ account, keypair: keypair2 }), false)

      const consent = peer.db.account.consent({ account, keypair: keypair2 })

      await p(peer.db.account.add)({
        account,
        keypair: keypair2,
        consent,
        powers: ['external-encryption'],
      })

      assert.equal(peer.db.account.has({ account, keypair: keypair2 }), true)

      // you're allowed to self-publish bad msgs
      const badMsg = await p(peer.db.feed.publish)({
        account,
        domain: 'post',
        data: { text: 'potato' },
        keypair: keypair2,
      })

      await p(peerOther.db.add)(
        badMsg.msg,
        peer.db.feed.getID(badMsg.msg.metadata.account, 'post')
      )
        .then(() => {
          throw "Shouldn't be able to add() bad msg"
        })
        .catch((err) => {
          assert.match(
            err.message,
            /add\(\) failed to verify msg/,
            "Couldn't add() bad msg"
          )
        })

      await p(peer.close)()
      await p(peerOther.close)()
    }
  )
})
