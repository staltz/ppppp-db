const test = require('node:test')
const assert = require('node:assert')
const Keypair = require('ppppp-keypair')
const MsgV3 = require('../../lib/msg-v3')

let account
test('MsgV3.createAccount()', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const accountMsg0 = MsgV3.createAccount(keypair, 'person', 'MYNONCE')
  if (process.env.VERBOSE) console.log(JSON.stringify(accountMsg0, null, 2))

  assert.deepEqual(
    accountMsg0.data,
    {
      action: 'add',
      key: {
        purpose: 'shs-and-sig',
        algorithm: 'ed25519',
        bytes: keypair.public,
      },
      nonce: 'MYNONCE',
      powers: ['add', 'del', 'external-encryption', 'internal-encryption'],
    },
    'data'
  )
  assert.equal(accountMsg0.metadata.dataHash, 'NxJZecVcVUWmUkk6cAn9JV', 'hash')
  assert.equal(accountMsg0.metadata.dataSize, 210, 'size')
  assert.equal(accountMsg0.metadata.account, 'self', 'account')
  assert.equal(accountMsg0.metadata.accountTips, null, 'accountTips')
  assert.deepEqual(accountMsg0.metadata.tangles, {}, 'tangles')
  assert.equal(accountMsg0.metadata.domain, 'person', 'domain')
  assert.equal(accountMsg0.metadata.v, 3, 'v')
  assert.equal(accountMsg0.pubkey, keypair.public, 'pubkey')
  assert.equal(MsgV3.isFeedMsg(accountMsg0), false, 'not a feed msg')

  account = MsgV3.getMsgID(accountMsg0)
  assert.equal(account, 'UQN1Qmxr4rr9nCMQKs9u8P', 'account ID')
})

let moot = null
let mootID = null
test('MsgV3.createMoot()', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  moot = MsgV3.createMoot(account, 'post', keypair)
  if (process.env.VERBOSE) console.log(JSON.stringify(moot, null, 2))

  assert.equal(moot.data, null, 'data')
  assert.equal(moot.metadata.dataHash, null, 'hash')
  assert.equal(moot.metadata.dataSize, 0, 'size')
  assert.equal(moot.metadata.account, account, 'account')
  assert.equal(moot.metadata.accountTips, null, 'accountTips')
  assert.deepEqual(moot.metadata.tangles, {}, 'tangles')
  assert.equal(moot.metadata.domain, 'post', 'domain')
  assert.equal(moot.metadata.v, 3, 'v')
  assert.equal(moot.pubkey, keypair.public, 'pubkey')
  assert.equal(MsgV3.isFeedMsg(moot), false, 'not a feed msg')

  mootID = MsgV3.getMsgID(moot)
  assert.equal(mootID, 'AP2rJSfm9TwpNcMmbUsnRa', 'moot ID')
})

test('MsgV3.create()', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const data = { text: 'Hello world!' }

  const tangle1 = new MsgV3.Tangle(mootID)
  tangle1.add(mootID, moot)

  const msg1 = MsgV3.create({
    keypair,
    data,
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [mootID]: tangle1,
    },
  })
  if (process.env.VERBOSE) console.log(JSON.stringify(msg1, null, 2))

  assert.deepEqual(msg1.data, data, 'data')
  assert.deepEqual(
    Object.keys(msg1.metadata),
    [
      'dataHash',
      'dataSize',
      'account',
      'accountTips',
      'tangles',
      'domain',
      'v',
    ],
    'metadata shape'
  )
  assert.deepEqual(
    msg1.metadata.dataHash,
    '9R7XmBhHF5ooPg34j9TQcz',
    'metadata.dataHash'
  )
  assert.deepEqual(msg1.metadata.dataSize, 23, 'metadata.dataSize')
  assert.equal(msg1.metadata.account, account, 'metadata.account')
  assert.deepEqual(msg1.metadata.accountTips, [account], 'metadata.accountTips')
  assert.deepEqual(
    Object.keys(msg1.metadata.tangles),
    [mootID],
    'metadata.tangles'
  )
  assert.equal(msg1.metadata.tangles[mootID].depth, 1, 'tangle depth')
  assert.deepEqual(msg1.metadata.tangles[mootID].prev, [mootID], 'tangle prev')
  assert.equal(msg1.metadata.domain, 'post', 'metadata.domain')
  assert.deepEqual(msg1.metadata.v, 3, 'metadata.v')
  assert.equal(
    msg1.pubkey,
    '4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW',
    'pubkey'
  )
  assert.equal(
    msg1.sig,
    'rh8bc8QY7ju7yi4rt6y9njCyS3TVV1SBjn5dWGpKKRrC3XDMBc9KeNJgVCJLK8b8uiU5F49avAWt35P9kNaWZYH',
    'sig'
  )
  assert.equal(MsgV3.isFeedMsg(msg1), true, 'is a feed msg')

  const msgID1 = 'MUvfNDk3gMPRy9CpTDEuvW'

  assert.equal(MsgV3.getMsgID(msg1), msgID1, 'getMsgID')

  const tangle2 = new MsgV3.Tangle(mootID)
  tangle2.add(mootID, moot)
  tangle2.add(msgID1, msg1)

  const data2 = { text: 'Ola mundo!' }

  const msg2 = MsgV3.create({
    keypair,
    data: data2,
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [mootID]: tangle2,
    },
  })
  if (process.env.VERBOSE) console.log(JSON.stringify(msg2, null, 2))

  assert.deepEqual(msg2.data, data2, 'data')
  assert.deepEqual(
    Object.keys(msg2.metadata),
    [
      'dataHash',
      'dataSize',
      'account',
      'accountTips',
      'tangles',
      'domain',
      'v',
    ],
    'metadata shape'
  )
  assert.deepEqual(
    msg2.metadata.dataHash,
    'XuZEzH1Dhy1yuRMcviBBcN',
    'metadata.dataHash'
  )
  assert.deepEqual(msg2.metadata.dataSize, 21, 'metadata.dataSize')
  assert.equal(msg2.metadata.account, account, 'metadata.account')
  assert.deepEqual(msg2.metadata.accountTips, [account], 'metadata.accountTips')
  assert.deepEqual(
    Object.keys(msg2.metadata.tangles),
    [mootID],
    'metadata.tangles'
  )
  assert.equal(msg2.metadata.tangles[mootID].depth, 2, 'tangle depth')
  assert.deepEqual(msg2.metadata.tangles[mootID].prev, [msgID1], 'tangle prev')
  assert.equal(msg2.metadata.domain, 'post', 'metadata.domain')
  assert.deepEqual(msg2.metadata.v, 3, 'metadata.v')
  assert.equal(
    msg2.pubkey,
    '4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW',
    'pubkey'
  )
  assert.equal(
    msg2.sig,
    '3NscyRLJZP8mtq4DhhNPfwtw8yzoWsFytxGxD2QAqjW64RMeRLP5czN5mMYm4nCqRtXvzRgRhqgN1qtz9hWW14S4',
    'sig'
  )

  assert.deepEqual(MsgV3.getMsgID(msg2), 'XMeQ6sbW3mjLYRLR4dAmKD', 'getMsgID')
})

test('MsgV3.create() handles DAG tips correctly', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const tangle = new MsgV3.Tangle(mootID)
  tangle.add(mootID, moot)

  const msg1 = MsgV3.create({
    keypair,
    data: { text: '1' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [mootID]: tangle,
    },
  })
  const msgID1 = MsgV3.getMsgID(msg1)
  assert.deepEqual(
    msg1.metadata.tangles[mootID].prev,
    [MsgV3.getMootID(account, 'post')],
    'msg1.prev is root'
  )

  tangle.add(msgID1, msg1)

  const msg2A = MsgV3.create({
    keypair,
    data: { text: '2A' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [mootID]: tangle,
    },
  })
  assert.deepEqual(
    msg2A.metadata.tangles[mootID].prev,
    [msgID1],
    'msg2A.prev is msg1'
  )

  const msg2B = MsgV3.create({
    keypair,
    data: { text: '2B' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [mootID]: tangle,
    },
  })
  const msgID2B = MsgV3.getMsgID(msg2B)
  assert.deepEqual(
    msg2B.metadata.tangles[mootID].prev,
    [msgID1],
    'msg2B.prev is msg1'
  )

  tangle.add(msgID2B, msg2B)

  const msg3 = MsgV3.create({
    keypair,
    data: { text: '3' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [mootID]: tangle,
    },
  })
  const msgID3 = MsgV3.getMsgID(msg3)
  assert.deepEqual(
    msg3.metadata.tangles[mootID].prev,
    [mootID, msgID2B].sort(),
    'msg3.prev is [root(lipmaa),msg2B(previous)], sorted'
  )
  tangle.add(msgID3, msg3)

  const msgID2A = MsgV3.getMsgID(msg2A)
  tangle.add(msgID2A, msg2A)
  // t.pass('msg2A comes into awareness')

  const msg4 = MsgV3.create({
    keypair,
    data: { text: '4' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [mootID]: tangle,
    },
  })
  assert.deepEqual(
    msg4.metadata.tangles[mootID].prev,
    [msgID3, msgID2A].sort(),
    'msg4.prev is [msg3(previous),msg2A(old fork as tip)], sorted'
  )
})
