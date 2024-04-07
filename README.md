# ppppp-db

The message database for ppppp.

## Installation

We're not on npm yet. In your package.json, include this as

```js
"ppppp-db": "github:staltz/ppppp-db"
```

## Usage

It's a secret-stack plugin much like ssb-db2. Other than that, you can also use
the feed format `const FeedV1 = require('ppppp-db/feed-v1')`.

You can use it like

```js
const p = require('node:util').promisify

const keypair = Keypair.generate('ed25519', 'alice')
const DIR = path.join(os.tmpdir(), 'ppppp-db-temp')

const peer = require('secret-stack/bare')()
  .use(require('secret-stack/plugins/net'))
  .use(require('secret-handshake-ext/secret-stack'))
  .use(require('ppppp-db'))
  .use(require('ssb-box'))
  .call(null, {
    shse: { caps: require('ppppp-caps')
    },
    global: {
      keypair,
      path: DIR
      }
    })


await peer.db.loaded()

const account = await p(peer.db.account.create)({
  keypair,
  subdomain: 'person',
})

const record = await p(peer.db.feed.publish)({
  account,
  domain: 'post',
  data: { text: 'I am 1st post' },
})

console.log("account:", account, "record:", JSON.stringify(record, null, 2))

//account: 8VLSqiWCX26w1173212RBRvY8N7MEbY3ar8fv22cGx6b record: {
//  "id": "H8dQH6LzeW2He7oRVXKP6u6WbC1GQ8EABh3PgS587L3w",
//  "msg": {
//    "data": {
//      "text": "I am 1st post"
//    },
//    "metadata": {
//      "dataHash": "39FJFLNXj7L83nFJbrrbADdKCeFe2vP2ikuNZXVKYSXP",
//      "dataSize": 24,
//      "account": "8VLSqiWCX26w1173212RBRvY8N7MEbY3ar8fv22cGx6b",
//      "accountTips": [
//        "8VLSqiWCX26w1173212RBRvY8N7MEbY3ar8fv22cGx6b"
//      ],
//      "tangles": {
//        "9HdQRpQNHgxiuxRy8eSEvEDG3nAL4EAYYkYHiHbU7Xqo": {
//          "depth": 1,
//          "prev": [
//            "9HdQRpQNHgxiuxRy8eSEvEDG3nAL4EAYYkYHiHbU7Xqo"
//          ]
//        }
//      },
//      "domain": "post",
//      "v": 4
//    },
//    "sigkey": "4mjQ5aJu378cEu6TksRG3uXAiKFiwGjYQtWAjfVjDAJW",
//    "sig": "WNY4WZiT3SLQKFn4J6ESLn8WqPfLRh5fPdTiZTkvDNf5u79wFmXv367UV93XjyzACi6C3fgwZkstq5JczCk3YPH"
//  },
//  "received": 1712503926457
//}
```

## API



## License

TODO
