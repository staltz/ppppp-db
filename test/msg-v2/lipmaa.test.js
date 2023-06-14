const tape = require('tape')
const Keypair = require('ppppp-keypair')
const MsgV2 = require('../../lib/msg-v2')

tape('lipmaa prevs', (t) => {
  const keypair = Keypair.generate('ed25519', 'alice')
  const group = MsgV2.getMsgHash(MsgV2.createGroup(keypair, 'MYNONCE'))
  const data = { text: 'Hello world!' }

  const rootMsg = MsgV2.createRoot(group, 'post', keypair)
  const rootHash = MsgV2.getMsgHash(rootMsg)
  const tangle = new MsgV2.Tangle(rootHash)
  tangle.add(rootHash, rootMsg)

  const msg1 = MsgV2.create({
    group,
    groupTips: [group],
    type: 'post',
    data,
    tangles: {
      [rootHash]: tangle,
    },
    keypair,
  })
  const msgHash1 = MsgV2.getMsgHash(msg1)
  tangle.add(msgHash1, msg1)
  t.equals(msg1.metadata.tangles[rootHash].depth, 1, 'msg1 depth')
  t.deepEquals(msg1.metadata.tangles[rootHash].prev, [rootHash], 'msg1 prev')

  const msg2 = MsgV2.create({
    group,
    groupTips: [group],
    type: 'post',
    data,
    tangles: {
      [rootHash]: tangle,
    },
    keypair,
  })
  const msgHash2 = MsgV2.getMsgHash(msg2)
  tangle.add(msgHash2, msg2)
  t.equals(msg2.metadata.tangles[rootHash].depth, 2, 'msg2 depth')
  t.deepEquals(msg2.metadata.tangles[rootHash].prev, [msgHash1], 'msg2 prev')

  const msg3 = MsgV2.create({
    group,
    groupTips: [group],
    type: 'post',
    data,
    tangles: {
      [rootHash]: tangle,
    },
    keypair,
  })
  const msgHash3 = MsgV2.getMsgHash(msg3)
  tangle.add(msgHash3, msg3)
  t.equals(msg3.metadata.tangles[rootHash].depth, 3, 'msg3 depth')
  t.deepEquals(
    msg3.metadata.tangles[rootHash].prev,
    [rootHash, msgHash2].sort(),
    'msg3 prev (has lipmaa!)'
  )

  const msg4 = MsgV2.create({
    group,
    groupTips: [group],
    type: 'post',
    keypair,
    tangles: {
      [rootHash]: tangle,
    },
    data,
  })
  const msgHash4 = MsgV2.getMsgHash(msg4)
  tangle.add(msgHash4, msg4)
  t.equals(msg4.metadata.tangles[rootHash].depth, 4, 'msg4 depth')
  t.deepEquals(msg4.metadata.tangles[rootHash].prev, [msgHash3], 'msg4 prev')

  const msg5 = MsgV2.create({
    group,
    groupTips: [group],
    type: 'post',
    data,
    tangles: {
      [rootHash]: tangle,
    },
    keypair,
  })
  const msgHash5 = MsgV2.getMsgHash(msg5)
  tangle.add(msgHash5, msg5)
  t.equals(msg5.metadata.tangles[rootHash].depth, 5, 'msg5 depth')
  t.deepEquals(msg5.metadata.tangles[rootHash].prev, [msgHash4], 'msg5 prev')

  const msg6 = MsgV2.create({
    group,
    groupTips: [group],
    type: 'post',
    data,
    tangles: {
      [rootHash]: tangle,
    },
    keypair,
  })
  const msgHash6 = MsgV2.getMsgHash(msg6)
  tangle.add(msgHash6, msg6)
  t.equals(msg6.metadata.tangles[rootHash].depth, 6, 'msg6 depth')
  t.deepEquals(msg6.metadata.tangles[rootHash].prev, [msgHash5], 'msg6 prev')

  const msg7 = MsgV2.create({
    group,
    groupTips: [group],
    type: 'post',
    data,
    tangles: {
      [rootHash]: tangle,
    },
    keypair,
  })
  const msgHash7 = MsgV2.getMsgHash(msg7)
  tangle.add(msgHash7, msg7)
  t.equals(msg7.metadata.tangles[rootHash].depth, 7, 'msg7 depth')
  t.deepEquals(
    msg7.metadata.tangles[rootHash].prev,
    [msgHash3, msgHash6].sort(),
    'msg7 prev (has lipmaa!)'
  )

  t.end()
})
