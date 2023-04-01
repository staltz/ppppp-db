const test = require('tape')
const ssbKeys = require('ssb-keys')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const classic = require('ssb-classic/format')
const p = require('util').promisify

const DIR = path.join(os.tmpdir(), 'ppppp-db-add')
rimraf.sync(DIR)

test('add() classic', async (t) => {
  const ssb = SecretStack({ appKey: caps.shs })
    .use(require('../'))
    .use(require('ssb-classic'))
    .use(require('ssb-box'))
    .call(null, {
      keys: ssbKeys.generate('ed25519', 'alice'),
      path: DIR,
    })

  await ssb.db.loaded()

  const nativeMsg = classic.toNativeMsg(
    {
      previous: null,
      author: '@FCX/tsDLpubCPKKfIrw4gc+SQkHcaD17s7GI6i/ziWY=.ed25519',
      sequence: 1,
      timestamp: 1514517067954,
      hash: 'sha256',
      content: {
        type: 'post',
        text: 'This is the first post!',
      },
      signature:
        'QYOR/zU9dxE1aKBaxc3C0DJ4gRyZtlMfPLt+CGJcY73sv5abKKKxr1SqhOvnm8TY784VHE8kZHCD8RdzFl1tBA==.sig.ed25519',
    },
    'js'
  )

  const msg = await p(ssb.db.add)(nativeMsg)
  t.equal(msg.value.content.text, 'This is the first post!')

  await p(ssb.close)(true)
})

test('add() some classic message starting from non-first', async (t) => {
  const ssb = SecretStack({ appKey: caps.shs })
    .use(require('../'))
    .use(require('ssb-classic'))
    .use(require('ssb-box'))
    .call(null, {
      keys: ssbKeys.generate('ed25519', 'alice'),
      path: DIR,
    })

  await ssb.db.loaded()

  const nativeMsg1 = classic.toNativeMsg({
    previous: '%6jh0kDakv0EIu5v9QwDhz9Lz2jEVRTCwyh5sWWzSvSo=.sha256',
    sequence: 1711,
    author: '@qeVe7SSpEZxL2Q0sE2jX+TXtMuAgcS889oBZYFDc5WU=.ed25519',
    timestamp: 1457240385000,
    hash: 'sha256',
    content: {
      type: 'post',
      text: 'Nulla ullamco laboris proident eu sint cillum. Est proident veniam deserunt quis enim sint reprehenderit voluptate consectetur adipisicing.',
      root: '%uH8IpYmw6uV1M4uhezcHq1v0xyeJ8J8bQqR/FVm0csM=.sha256',
      branch: '%SiM9aUnQSk01m0EStBHXD4HLf773OJm998IReSLO1So=.sha256',
      mentions: [
        {
          link: '&bGFib3J1bWRvbG9yYWxpcXVhY29tbW9kb2N1bHBhcGE=.sha256',
          type: 'image/jpeg',
          size: 1367352,
          name: 'commodo cillum',
        },
        {
          link: '@zRr3265aLU/T1/DfB8+Rm+IPDZJnuuRgfurOztIYBi4=.ed25519',
          name: 'laborum aliquip',
        },
      ],
    },
    signature:
      'ypQ+4ubHo/zcUakMzN4dHqd9qmx06VEADAZPjK0OXbseaEg9s0AWccKgn+WFI0XSO1y7TIphFOA6Dyn6kDzXAg==.sig.ed25519',
  })

  const nativeMsg2 = classic.toNativeMsg({
    previous: '%l8drxQMuxpOjUb3RK9rGJl6oPKF4QPHchGvRyqL+IZ4=.sha256',
    sequence: 1712,
    author: '@qeVe7SSpEZxL2Q0sE2jX+TXtMuAgcS889oBZYFDc5WU=.ed25519',
    timestamp: 1457253345000,
    hash: 'sha256',
    content: {
      type: 'post',
      text: 'Commodo duis eiusmod est tempor eu fugiat commodo sint excepteur non est mollit est exercitation. Sit velit eu quis aute reprehenderit id sit labore quis mollit fugiat magna. Proident eu et proident duis labore irure laboris dolor. Cupidatat aute occaecat proident ut cillum sunt ullamco laborum labore cillum eu ut excepteur laborum aliqua. Magna adipisicing in occaecat adipisicing duis mollit esse. Reprehenderit excepteur labore excepteur qui elit labore velit officia non consectetur id labore ullamco excepteur. Laborum cillum anim ex irure ex proident consequat aute ipsum quis id esse. Exercitation mollit deserunt labore ut eu ea eu consectetur ullamco ex.\nEiusmod qui in proident irure consequat enim duis elit culpa minim dolore nisi aute. Qui anim Lorem consectetur ad do dolore laborum enim aute ex velit eu dolor et incididunt. Nisi nulla aliquip anim irure proident deserunt nostrud in anim elit veniam exercitation aliquip sint. Culpa excepteur sit et eu quis reprehenderit sunt. Id velit reprehenderit nostrud incididunt dolore sint consequat officia pariatur dolore ipsum. Nisi incididunt tempor voluptate fugiat esse. Amet ut elit eu nulla adipisicing non veniam nulla ut culpa.\nDolor adipisicing anim id anim eiusmod laboris aliquip. Anim sint deserunt exercitation nostrud adipisicing amet enim adipisicing Lorem voluptate anim. Sunt pariatur cupidatat culpa dolore ullamco anim. Minim laborum excepteur commodo et aliqua duis reprehenderit exercitation.',
      root: '%0AwZP5C5aFwzCV5OCxG/2D6Qx70N6ZVIoZ0ZgIu0pPw=.sha256',
      branch: '%oZF1M4cKj6t2LHloUiegWD1qZ2IIvcLvOPIiVHbQudI=.sha256',
    },
    signature:
      'uWYwWtG2zTmdfpaSTmOghW3QsNCgYNGh5d3VKOFtp2MNQopSCAxjDDER/yfj3k8Bu+NKEnAy5eJ2ylWuxeuEDQ==.sig.ed25519',
  })

  const msg1 = await p(ssb.db.add)(nativeMsg1)
  t.equal(msg1.value.sequence, 1711)

  const msg2 = await p(ssb.db.add)(nativeMsg2)
  t.equal(msg2.value.sequence, 1712)

  await p(ssb.close)(true)
})
