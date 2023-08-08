const test = require('node:test')
const assert = require('node:assert')
const Keypair = require('ppppp-keypair')
const MsgV3 = require('../../lib/msg-v3')

let account
test('MsgV3.createAccount()', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  const accountMsg0 = MsgV3.createAccount(keypair, 'person', 'MYNONCE')
  console.log(JSON.stringify(accountMsg0, null, 2))

  assert.deepEqual(
    accountMsg0.data,
    {
      action: 'add',
      add: {
        key: {
          purpose: 'sig',
          algorithm: 'ed25519',
          bytes: keypair.public,
        },
        nonce: 'MYNONCE',
        powers: ['add', 'del', 'box'],
      },
    },
    'data'
  )
  assert.equal(accountMsg0.metadata.dataHash, 'R5az9nC1CB3Afd5Q57HYRQ', 'hash')
  assert.equal(accountMsg0.metadata.dataSize, 172, 'size')
  assert.equal(accountMsg0.metadata.account, 'self', 'account')
  assert.equal(accountMsg0.metadata.accountTips, null, 'accountTips')
  assert.deepEqual(accountMsg0.metadata.tangles, {}, 'tangles')
  assert.equal(accountMsg0.metadata.domain, 'person', 'domain')
  assert.equal(accountMsg0.metadata.v, 3, 'v')
  assert.equal(accountMsg0.pubkey, keypair.public, 'pubkey')

  account = MsgV3.getMsgHash(accountMsg0)
  assert.equal(account, 'J2SUr6XtJuFuTusNbagEW5', 'account ID')
})

let rootMsg = null
let rootHash = null
test('MsgV3.createRoot()', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')

  rootMsg = MsgV3.createRoot(account, 'post', keypair)
  console.log(JSON.stringify(rootMsg, null, 2))

  assert.equal(rootMsg.data, null, 'data')
  assert.equal(rootMsg.metadata.dataHash, null, 'hash')
  assert.equal(rootMsg.metadata.dataSize, 0, 'size')
  assert.equal(rootMsg.metadata.account, account, 'account')
  assert.equal(rootMsg.metadata.accountTips, null, 'accountTips')
  assert.deepEqual(rootMsg.metadata.tangles, {}, 'tangles')
  assert.equal(rootMsg.metadata.domain, 'post', 'domain')
  assert.equal(rootMsg.metadata.v, 3, 'v')
  assert.equal(rootMsg.pubkey, keypair.public, 'pubkey')

  rootHash = MsgV3.getMsgHash(rootMsg)
  assert.equal(rootHash, 'VsBFptgidvAspk4xTKZx6c', 'root hash')
})

test('MsgV3.create()', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const data = { text: 'Hello world!' }

  const tangle1 = new MsgV3.Tangle(rootHash)
  tangle1.add(rootHash, rootMsg)

  const msg1 = MsgV3.create({
    keypair,
    data,
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [rootHash]: tangle1,
    },
  })
  console.log(JSON.stringify(msg1, null, 2))

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
  assert.deepEqual(
    msg1.metadata.accountTips,
    [account],
    'metadata.accountTips'
  )
  assert.deepEqual(
    Object.keys(msg1.metadata.tangles),
    [rootHash],
    'metadata.tangles'
  )
  assert.equal(msg1.metadata.tangles[rootHash].depth, 1, 'tangle depth')
  assert.deepEqual(
    msg1.metadata.tangles[rootHash].prev,
    [rootHash],
    'tangle prev'
  )
  assert.equal(msg1.metadata.domain, 'post', 'metadata.domain')
  assert.deepEqual(msg1.metadata.v, 3, 'metadata.v')
  assert.equal(
    msg1.pubkey,
    '4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW',
    'pubkey'
  )
  assert.equal(
    msg1.sig,
    '46CjqZzC8RAanRHnUKs147PMNFvrQcc9Y7a8tMP3s4qQubCtgYsypgzNA7XkSxM6vqRCe2ZBSKM2WR9AoHN3VoDz',
    'sig'
  )

  const msgHash1 = 'R5G9WtDAQrco4FABRdvrUH'

  assert.equal(
    MsgV3.getMsgId(msg1),
    `ppppp:message/v3/${account}/post/${msgHash1}`,
    'getMsgId'
  )

  const tangle2 = new MsgV3.Tangle(rootHash)
  tangle2.add(rootHash, rootMsg)
  tangle2.add(msgHash1, msg1)

  const data2 = { text: 'Ola mundo!' }

  const msg2 = MsgV3.create({
    keypair,
    data: data2,
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [rootHash]: tangle2,
    },
  })
  console.log(JSON.stringify(msg2, null, 2))

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
  assert.deepEqual(
    msg2.metadata.accountTips,
    [account],
    'metadata.accountTips'
  )
  assert.deepEqual(
    Object.keys(msg2.metadata.tangles),
    [rootHash],
    'metadata.tangles'
  )
  assert.equal(msg2.metadata.tangles[rootHash].depth, 2, 'tangle depth')
  assert.deepEqual(
    msg2.metadata.tangles[rootHash].prev,
    [msgHash1],
    'tangle prev'
  )
  assert.equal(msg2.metadata.domain, 'post', 'metadata.domain')
  assert.deepEqual(msg2.metadata.v, 3, 'metadata.v')
  assert.equal(
    msg2.pubkey,
    '4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW',
    'pubkey'
  )
  assert.equal(
    msg2.sig,
    '31StEDDnoDoDtRi49L94XPTGXxNtDJa9QXSJTd4o3wBtFAJvfQA1RsHvunU4CxdY9iC69WnxnkaW6QryrztJZkiA',
    'sig'
  )

  assert.deepEqual(
    MsgV3.getMsgId(msg2),
    `ppppp:message/v3/${account}/post/LxWgRRr4wXd29sLDNGNTkr`,
    'getMsgId'
  )
})

test('create() handles DAG tips correctly', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const tangle = new MsgV3.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = MsgV3.create({
    keypair,
    data: { text: '1' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash1 = MsgV3.getMsgHash(msg1)
  assert.deepEqual(
    msg1.metadata.tangles[rootHash].prev,
    [MsgV3.getFeedRootHash(account, 'post')],
    'msg1.prev is root'
  )

  tangle.add(msgHash1, msg1)

  const msg2A = MsgV3.create({
    keypair,
    data: { text: '2A' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  assert.deepEqual(
    msg2A.metadata.tangles[rootHash].prev,
    [msgHash1],
    'msg2A.prev is msg1'
  )

  const msg2B = MsgV3.create({
    keypair,
    data: { text: '2B' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash2B = MsgV3.getMsgHash(msg2B)
  assert.deepEqual(
    msg2B.metadata.tangles[rootHash].prev,
    [msgHash1],
    'msg2B.prev is msg1'
  )

  tangle.add(msgHash2B, msg2B)

  const msg3 = MsgV3.create({
    keypair,
    data: { text: '3' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  const msgHash3 = MsgV3.getMsgHash(msg3)
  assert.deepEqual(
    msg3.metadata.tangles[rootHash].prev,
    [rootHash, msgHash2B].sort(),
    'msg3.prev is [root(lipmaa),msg2B(previous)], sorted'
  )
  tangle.add(msgHash3, msg3)

  const msgHash2A = MsgV3.getMsgHash(msg2A)
  tangle.add(msgHash2A, msg2A)
  // t.pass('msg2A comes into awareness')

  const msg4 = MsgV3.create({
    keypair,
    data: { text: '4' },
    account,
    accountTips: [account],
    domain: 'post',
    tangles: {
      [rootHash]: tangle,
    },
  })
  assert.deepEqual(
    msg4.metadata.tangles[rootHash].prev,
    [msgHash3, msgHash2A].sort(),
    'msg4.prev is [msg3(previous),msg2A(old fork as tip)], sorted'
  )
})
