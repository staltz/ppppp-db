const tape = require('tape')
const MsgV2 = require('../../lib/msg-v2')
const { generateKeypair } = require('../util')

tape('simple multi-author tangle', (t) => {
  const keysA = generateKeypair('alice')
  const keysB = generateKeypair('bob')
  const groupA = MsgV2.getMsgHash(MsgV2.createGroup(keysA, 'alice'))
  const groupB = MsgV2.getMsgHash(MsgV2.createGroup(keysB, 'bob'))

  const rootMsgA = MsgV2.createRoot(groupA, 'post', keysA)
  const rootHashA = MsgV2.getMsgHash(rootMsgA)
  const tangleA = new MsgV2.Tangle(rootHashA)
  tangleA.add(rootHashA, rootMsgA)

  const rootMsgB = MsgV2.createRoot(groupB, 'post', keysB)
  const rootHashB = MsgV2.getMsgHash(rootMsgB)
  const tangleB = new MsgV2.Tangle(rootHashB)
  tangleB.add(rootHashB, rootMsgB)

  const msg1 = MsgV2.create({
    group: groupA,
    groupTips: [groupA],
    type: 'post',
    data: { text: 'Hello world!' },
    tangles: {
      [rootHashA]: tangleA,
    },
    keys: keysA,
  })
  const msgHash1 = MsgV2.getMsgHash(msg1)
  t.deepEquals(
    Object.keys(msg1.metadata.tangles),
    [rootHashA],
    'msg1 has only feed tangle'
  )

  const tangleX = new MsgV2.Tangle(msgHash1)
  tangleX.add(msgHash1, msg1)

  const msg2 = MsgV2.create({
    group: groupB,
    groupTips: [groupB],
    type: 'post',
    data: { text: 'Hello world!' },
    tangles: {
      [rootHashB]: tangleB,
      [msgHash1]: tangleX,
    },
    keys: keysB,
  })

  t.deepEquals(
    Object.keys(msg2.metadata.tangles).sort(),
    [rootHashB, msgHash1].sort(),
    'msg2 has feed tangle and misc tangle'
  )
  t.equal(msg2.metadata.tangles[rootHashB].depth, 1, 'msg2 feed tangle depth')
  t.deepEquals(
    msg2.metadata.tangles[rootHashB].prev,
    [rootHashB],
    'msg2 feed tangle prev'
  )

  t.equal(msg2.metadata.tangles[msgHash1].depth, 1, 'msg2 has tangle depth 1')
  t.deepEquals(
    msg2.metadata.tangles[msgHash1].prev,
    [msgHash1],
    'msg2 has tangle prev'
  )

  t.end()
})

tape('lipmaa in multi-author tangle', (t) => {
  const keysA = generateKeypair('alice')
  const keysB = generateKeypair('bob')
  const groupA = MsgV2.getMsgHash(MsgV2.createGroup(keysA, 'alice'))
  const groupB = MsgV2.getMsgHash(MsgV2.createGroup(keysB, 'bob'))

  const data = { text: 'Hello world!' }

  const rootMsgA = MsgV2.createRoot(groupA, 'post', keysA)
  const rootHashA = MsgV2.getMsgHash(rootMsgA)
  const tangleA = new MsgV2.Tangle(rootHashA)
  tangleA.add(rootHashA, rootMsgA)

  const rootMsgB = MsgV2.createRoot(groupB, 'post', keysB)
  const rootHashB = MsgV2.getMsgHash(rootMsgB)
  const tangleB = new MsgV2.Tangle(rootHashB)
  tangleB.add(rootHashB, rootMsgB)

  const msg1 = MsgV2.create({
    group: groupA,
    groupTips: [groupA],
    type: 'post',
    data,
    tangles: {
      [rootHashA]: tangleA,
    },
    keys: keysA,
  })
  const msgHash1 = MsgV2.getMsgHash(msg1)
  tangleA.add(msgHash1, msg1)
  const tangleThread = new MsgV2.Tangle(msgHash1)
  tangleThread.add(msgHash1, msg1)

  t.deepEquals(
    Object.keys(msg1.metadata.tangles),
    [rootHashA],
    'A:msg1 has only feed tangle'
  )

  const msg2 = MsgV2.create({
    group: groupB,
    groupTips: [groupB],
    type: 'post',
    data,
    tangles: {
      [rootHashB]: tangleB,
      [msgHash1]: tangleThread,
    },
    keys: keysB,
  })
  const msgHash2 = MsgV2.getMsgHash(msg2)
  tangleB.add(msgHash2, msg2)
  tangleThread.add(msgHash2, msg2)

  t.deepEquals(
    msg2.metadata.tangles[msgHash1].prev,
    [msgHash1],
    'B:msg2 points to A:msg1'
  )

  const msg3 = MsgV2.create({
    group: groupB,
    groupTips: [groupB],
    type: 'post',
    data,
    tangles: {
      [rootHashB]: tangleB,
      [msgHash1]: tangleThread,
    },
    keys: keysB,
  })
  const msgHash3 = MsgV2.getMsgHash(msg3)
  tangleB.add(msgHash3, msg3)
  tangleThread.add(msgHash3, msg3)

  t.deepEquals(
    msg3.metadata.tangles[msgHash1].prev,
    [msgHash2],
    'B:msg3 points to B:msg2'
  )

  const msg4 = MsgV2.create({
    group: groupA,
    groupTips: [groupA],
    type: 'post',
    data,
    tangles: {
      [rootHashA]: tangleA,
      [msgHash1]: tangleThread,
    },
    keys: keysA,
  })
  const msgHash4 = MsgV2.getMsgHash(msg4)
  tangleB.add(msgHash4, msg4)
  tangleThread.add(msgHash4, msg4)

  t.deepEquals(
    msg4.metadata.tangles[msgHash1].prev,
    [msgHash1, msgHash3].sort(),
    'A:msg4 points to A:msg1,B:msg3'
  )

  t.end()
})
