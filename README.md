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

const pzp = require('secret-stack/bare')()
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


await pzp.db.loaded()

const account = await p(pzp.db.account.create)({
  keypair,
  subdomain: 'person',
})

const record = await p(pzp.db.feed.publish)({
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

NOTE: All functions that take a callback (cb) return a promise instead if you omit the callback.

### `pzp.db.installEncryptionFormat(encryptionFormat)`

If `encryptionFormat` conforms to the [ssb-encryption-format](https://github.com/ssbc/ssb-encryption-format) spec, then this method will install the `encryptionFormat` in this database instance, meaning that you can now encrypt and decrypt messages using that encryption format.

### `pzp.db.loaded(cb)

Calls back when the database is ready to be used.

### `pzp.db.add(msg: Msg, tangleID: MsgId | null, cb: CB<RecPresent>)

Adds a message to the database. Usually performed automatically when you do other things like publishing messages or syncing from other peers.

### `pzp.db.account.find({ keypair?: KeypairPublicSlice, subdomain: string}, cb: CB<string>)`

Find the account that contains this `keypair` (or the implicit `config.global.keypair`) under the given `subdomain` (will be converted to an actual msg domain).

### `pzp.db.account.create({ keypair?: Keypair, subdomain: string }, cb: CB<string>)`

Create an account (root msg) for the given `keypair` (or the implicit `config.global.keypair`) under the given `subdomain` (will be converted to an actual msg domain).

### `pzp.db.account.findOrCreate({ keypair?: Keypair, subdomain: string }, cb: CB<string>)`

Find or create an account (root msg) for the given `keypair` (or the implicit `config.global.keypair`) under the given `domain` (will be converted to an actual msg domain).

### `pzp.db.account.add({ account: string, keypair: Keypair | KeypairPublicSlice, powers?: Array<AccountPower>, consent?: string }, cb: CB<RecPresent>)`

Add the given `keypair` to the given `account`, authorized by the given `consent` (or implicitly created on the fly if the `keypair` contains the private key) with the specified `powers` (defaulting to no powers).

### `pzp.db.account.del({ account: string, keypair: KeypairPublicSlice }, cb: CB<RecPresent>)`

Remove the given `keypair` from the given `account`.

### `pzp.db.account.consent({ keypair?: KeypairPrivateSlice, account: string }) => string`

Create a consent signature for the given `keypair` (or the implicit `config.global.keypair`) to be added to the given `account`.

### `pzp.db.account.has({ keypair?: KeypairPublicSlice, account: string }, cb: CB<boolean>)
    
Does this `account` have this `keypair` (or the implicit `config.global.keypair`)?

    feed: {
### `pzp.db.feed.publish({ keypair?: Keypair, encryptionFormat?: string, data: object, domain: string, account: string, tangles?: Array<MsgID> }, cb: CB<RecPresent>)`

Publishes a message to the feed of the given `domain`.

### `pzp.db.feed.getID(accountId: string, domain: string) => string`

Gets the moot ID (the ID of an account's domain's root message) for a given account and domain. That message is deterministic so you can calculate its ID even if you e.g. haven't been given it directly.

### `pzp.db.feed.findMoot(accountId: string, domain: string, cb: CB<RecPresent | null>)`

Gets the moot for the specified account and domain from the database. A moot is the root message for an account's domain.

### `pzp.db.getRecord(msgID: MsgID, cb: CB<RecPresent | null>)`

Gets a message's record using its message ID, if you have it in your database. The record has the shape `{ id: string, msg: Msg, received: number }`.

### `pzp.db.get(msgID: MsgID, cb: CB<Msg | null>)`

Gets a message using its message ID, if you have it in your database.

### `pzp.db.del(msgID: MsgID, cb: CB<void>)`

Deletes a specific message from your database.

### `pzp.db.erase(msgID: MsgID, cb: CB<void>)

Erases a specific message in your database. Erasing, as opposed to deleting, only removes a message's `data`. Metadata is kept and the message integrity can still be verified.

### `pzp.db.ghosts.add({ tangleID: MsgID, msgID: MsgID, span: number }, cb: CB<void>)`

Adds a [ghost][ghost] to the database.

### `pzp.db.ghosts.get(tangleID: MsgID) => Array<string>`

Gets a [ghost][ghost] from the database.

### `pzp.db.ghosts.getMinDepth(tangleID: MsgID) => number`

Gets the depth of the ghost in the tangle with the lowest depth.

### `pzp.db.onRecordAdded`

An [obz][obz] observable that triggers when a record is added to the database.

### `pzp.db.onRecordDeletedOrErased`

An [obz][obz] observable that triggers when a record is either deleted or erased. Erasing means that only the `data` field of the message has been cleared.

### `pzp.db.getTangle(tangleID: MsgID, cb: CB<DBTangle | null>)`

Tries to get a `DBTangle` object representing an entire tangle in the database.

### `pzp.db.msgs() => AsyncGenerator<Msg>`

Returns an async generator letting you iterate over all messages in the database.

### `pzp.db.records() => AsyncGenerator<Rec>`

Returns an async generator letting you iterate over all records in the database.  The records have the shape `{ id: string, msg: Msg, received: number }` if they exist but they might also be deleted.

### `pzp.db.log.stats(cb: CB<{ totalBytes: number; deletedBytes: number }>)`

Returns some size stats on the log file, where messages are stored.

### `pzp.db.log.compact(cb: CB<void>)`

Makes the log file (the message store) take up less space by compacting it into the space freed by messages that have been deleted.


## License

Copyright © 2023-2024 Andre 'Staltz' Medeiros <contact@staltz.com> and contributors. Licensed under the MIT license.

[ghost]: https://www.manyver.se/blog/2023-11-05
[obz]: https://www.npmjs.com/package/obz