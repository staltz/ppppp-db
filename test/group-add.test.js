const test = require('tape')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const p = require('util').promisify
const { generateKeypair } = require('./util')

const DIR = path.join(os.tmpdir(), 'ppppp-db-group-add')
rimraf.sync(DIR)

test('group.add()', async (t) => {
  const keys1 = generateKeypair('alice')
  const keys2 = generateKeypair('bob')

  const peer = SecretStack({ appKey: caps.shs })
    .use(require('../lib'))
    .use(require('ssb-box'))
    .call(null, { keys: keys1, path: DIR })

  await peer.db.loaded()
  const groupRec0 = await p(peer.db.group.create)({ keys: keys1 })
  const group = groupRec0.hash

  const groupRec1 = await p(peer.db.group.add)({ group, keys: keys2 })
  t.ok(groupRec1, 'groupRec1 exists')
  const { hash, msg } = groupRec1
  t.ok(hash, 'hash exists')
  t.equals(msg.data.add, keys2.id, 'msg.data.add NEW KEY')
  t.equals(msg.metadata.group, null, 'msg.metadata.group')
  t.equals(msg.metadata.groupTips, null, 'msg.metadata.groupTips')
  t.deepEquals(
    msg.metadata.tangles,
    { [group]: { depth: 1, prev: [group] } },
    'msg.metadata.tangles'
  )
  t.equals(msg.pubkey, keys1.id, 'msg.pubkey OLD KEY')

  await p(peer.close)()
})
