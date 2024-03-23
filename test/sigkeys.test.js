const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const p = require('node:util').promisify
const os = require('node:os')
const rimraf = require('rimraf')
const Keypair = require('ppppp-keypair')
const { createPeer } = require('./util')
const MsgV4 = require('../lib/msg-v4')

const DIR = path.join(os.tmpdir(), 'ppppp-db-sigkeys')
const DIR2 = path.join(os.tmpdir(), 'ppppp-db-sigkeys2')
rimraf.sync(DIR)
rimraf.sync(DIR2)

test('sigkeys', async (t) => {
  await t.test(
    "Can't add msg that is signed by key newer than what accountTips points to",
    async () => {
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
        data: { text: 'potatoGood' },
        keypair: keypair2,
      })

      const postMootId = peer.db.feed.getID(account, 'post')
      const postMootMsg = peer.db.get(postMootId)

      const tangle = new MsgV4.Tangle(postMootId)
      tangle.add(postMootId, postMootMsg)
      tangle.add(goodRec.id, goodRec.msg)
      const badMsg = MsgV4.create({
        account,
        accountTips: [account], // intentionally excluding keypair2
        domain: 'post',
        keypair: keypair2, // intentionally using newer key than accountTips points to
        tangles: {
          [postMootId]: tangle,
        },
        data: { text: 'potato' },
      })
      await assert.rejects(
        p(peer.db.add)(badMsg, postMootId),
        /add\(\) failed to verify msg/,
        "Shouldn't be able to add() own bad msg"
      )

      await p(peerOther.db.add)(accountMsg0, account),
        await p(peerOther.db.add)(accountRec1.msg, account),
        await p(peerOther.db.add)(postMootMsg, postMootId),
        await p(peerOther.db.add)(goodRec.msg, postMootId),
        await assert.rejects(
          p(peerOther.db.add)(badMsg, postMootId),
          /add\(\) failed to verify msg/,
          "Shouldn't be able to add() someone else's bad msg"
        )

      await p(peer.close)()
      await p(peerOther.close)()
    }
  )
})
