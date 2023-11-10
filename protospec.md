# Msg V3

Background: https://github.com/ssbc/ssb2-discussion-forum/issues/24

## Terminology

- **Msg** = published data that is signed and shareable
- **Msg hash** = hash(msg.metadata)
- **Tangle** = any single-root DAG of msgs that can be replicated by peers
- **Tangle Root** = the origin msg of a tangle
- **Tangle Tips** = tangle msgs that are not yet referenced by any other msg in the tangle
- **Tangle ID** = Msg hash of the tangle's root msg
- **Account tangle** = tangle with msgs that add (or remove?) asymmetric-crypto public keys
- **Account ID** = tangle ID of the account tangle
- **Feed** = tangle with msgs authored by (any pubkey in) an account
- **Feed root** = a msg that is deterministically predictable and empty, so to allow others to pre-know its hash
- **Feed ID** = ID of a feed (Msg ID of the feed's root msg)

JSON

```typescript
interface Msg {
  data: Record<string, any> | string | null // a plaintext object, or ciphertext string, or null
  metadata: {
    account: string | 'self' | 'any' // blake3 hash of an account tangle root msg, or the string 'self', or 'any'
    accountTips: Array<string> | null // list of blake3 hashes of account tangle tips, or null
    dataHash: DataHash | null // blake3 hash of the `content` object serialized
    dataSize: number // byte size (unsigned integer) of the `content` object serialized
    domain: string // alphanumeric string, at least 3 chars, max 100 chars
    tangles: {
      // for each tangle this msg belongs to, identified by the tangle's root
      [rootMsgHash: string]: {
        depth: number // maximum distance (positive integer) from this msg to the root
        prev: Array<MsgHash> // list of msg hashes of existing msgs, unique set and ordered alphabetically
      }
    }
    v: 3 // hard-coded at 3, indicates the version of the feed format
  }
  pubkey: Pubkey // base58 encoded string for the author's public key
  sig: Signature // Signs the `metadata` object
}
```

**Depth:** we NEED this field because it is the most reliable way of calculating lipmaa distances between msgs, in the face of sliced replication. For example, given that older messages (except the certificate pool) would be deleted, the "graph depth" calculation for a msg may change over time, but we need a way of keeping this calculation stable and deterministic.

## Account tangle msgs

Msgs in an account tangle are special because they have empty `account` and `accountTips` fields.

```typescript
interface Msg {
  data: AccountData
  metadata: {
    account: 'self' // MUST be the string 'self'
    accountTips: null // MUST be null
    dataHash: DataHash
    dataSize: number
    domain: string // alphanumeric string, at least 3 chars, max 100 chars
    tangles: {
      [accountTangleID: string]: {
        depth: number // maximum distance (positive integer) from this msg to the root
        prev: Array<MsgHash> // list of msg hashes of existing msgs, unique set and ordered alphabetically
      }
    }
    v: 3
  }
  pubkey: Pubkey
  sig: Signature
}

type AccountData =
  | { action: 'add', add: AccountAdd }
  | { action: 'del', del: AccountDel }

// "add" means this shs peer can validly add more keys to the account tangle
// "del" means this shs peer can validly revoke keys from the account tangle
// "internal-encryption" means this shs peer should get access to symmetric key
// "external-encryption" means this shs peer should get access to asymmetric key
type AccountPower = 'add' | 'del' | 'internal-encryption' | 'external-encryption'

type AccountAdd = {
  key: Key
  nonce?: string // nonce required only on the account tangle's root
  consent?: string // base58 encoded signature of the string `:account-add:<ID>` where `<ID>` is the account's ID, required only on non-root msgs
  accountPowers?: Array<AccountPower> // list of powers granted to this key, defaults to []
}

type AccountDel = {
  key: Key
}

type Key =
  | {
      purpose: 'shs-and-external-signature' // secret-handshake and digital signatures
      algorithm: 'ed25519' // libsodium crypto_sign_detached
      bytes: string // base58 encoded string for the public key
    }
  | {
      purpose: 'external-encryption' // asymmetric encryption
      algorithm: 'x25519-xsalsa20-poly1305' // libsodium crypto_box_easy
      bytes: string // base58 encoded string of the public key
    }
  | {
      purpose: 'internal-signature', // digital signatures of internal msgs
      algorithm: 'ed25519', // libsodium crypto_sign_detached
      bytes: string // base58 encoded string for the public key
    }
```

Examples of `AccountData`:

- Registering the first signing pubkey:
  ```json
  {
    "action": "add",
    "add": {
      "key": {
        "purpose": "shs-and-external-signature",
        "algorithm": "ed25519",
        "bytes": "3JrJiHEQzRFMzEqWawfBgq2DSZDyihP1NHXshqcL8pB9"
      },
      "nonce": "6GHR1ZFFSB3C5qAGwmSwVH8f7byNo8Cqwn5PcyG3qDvS"
    }
  }
  ```
- Revoking a signing pubkey:
  ```json
  {
    "action": "del",
    "del": {
      "key": {
        "purpose": "shs-and-external-signature",
        "algorithm": "ed25519",
        "bytes": "3JrJiHEQzRFMzEqWawfBgq2DSZDyihP1NHXshqcL8pB9"
      }
    }
  }
  ```

## Feed root

The root msg for a feed is special, its `metadata` is predictable and can be constructed by any peer. It is a data-less msg with the following shape:

```typescript
interface Msg {
  data: null // MUST be null
  metadata: {
    dataHash: null // MUST be null
    dataSize: 0 // MUST be 0
    account: string // MUST be an ID
    accountTips: null // MUST be null
    tangles: {} // MUST be empty object
    domain: string
    v: 2
  }
  pubkey: Pubkey
  sig: Signature
}
```

Thus, given a `account` and a `domain`, any peer can construct the `metadata` part of the feed root msg, and thus can derive the "msg ID" for the root based on that `metadata`.

Given the root msg ID, any peer can thus refer to the feed tangle, because the root msg ID is the tangle ID for the feed tangle.

Note also that _any peer_ can construct the root msg and sign it! Which renders the signatures for feed roots meaningless and ignorable.

## Prev links

A msg can refer to 0 or more prev msgs. The prev links are used to build the tangle.

The `prev` array for a tangle should list:

- All current "tips" (msgs that are not yet listed inside any `prev`) of this tangle
- All msgs that are at the previous "lipmaa" depth relative to this `depth`

## JSON serialization

Whenever we need to serialize any JSON in the context of creating a Feed V1 message, we follow the "JSON Canonicalization Scheme" (JSC) defined by [RFC 8785](https://tools.ietf.org/html/rfc8785).

A serialized msg must not be larger than 65535 UTF-8 bytes.

# Msg V2

Background: https://github.com/ssbc/ssb2-discussion-forum/issues/24

## Terminology

- **Msg** = published data that is signed and shareable
- **Msg ID** = hash(msg.metadata)
- **Tangle** = any single-root DAG of msgs that can be replicated by peers
- **Tangle Root** = the origin msg of a tangle
- **Tangle Tips** = tangle msgs that are not yet referenced by any other msg in the tangle
- **Tangle ID** = Msg ID of the tangle's root msg
- **Identity tangle** = tangle with msgs that add (or remove?) public keys used for signing msgs
- **Group** = (mutable) set of public keys, implemented by an identity tangle
- **Group ID** = ID of an identity tangle (Msg Id of the identity tangle's root msg)
- **Feed** = tangle with msgs authored by any pubkey in a group
- **Feed root** = a msg that is deterministically predictable and empty, so to allow others to pre-know its hash
- **Feed ID** = ID of a feed (Msg ID of the feed's root msg)

JSON

```typescript
interface Msg {
  data: any | null // any object, or null
  metadata: {
    dataHash: ContentHash | null // blake3 hash of the `content` object serialized
    dataSize: number // byte size (unsigned integer) of the `content` object serialized
    group: string | null // blake3 hash of a group tangle root msg, or null
    groupTips: Array<string> | null // list of blake3 hashes of group tangle tips, or null
    tangles: {
      // for each tangle this msg belongs to, identified by the tangle's root
      [rootMsgHash: string]: {
        depth: number // maximum distance (positive integer) from this msg to the root
        prev: Array<MsgHash> // list of msg hashes of existing msgs, unique set and ordered alphabetically
      }
    }
    type: string // alphanumeric string, at least 3 chars, max 100 chars
    v: 2 // hard-coded at 2, indicates the version of the feed format
  }
  pubkey: Pubkey // base58 encoded string for the author's public key
  sig: Signature // Signs the `metadata` object
}
```

## Identity tangle msgs

Msgs in an identity tangle are special because they have empty `group` and `groupTips` fields.

```typescript
interface Msg {
  data: {
    add: string // pubkey being added to the group
    nonce?: string // nonce required only on the identity tangle's root
  }
  metadata: {
    dataHash: ContentHash
    dataSize: number
    group: null // MUST be null
    groupTips: null // MUST be null
    tangles: {
      [identityTangleId: string]: {
        depth: number // maximum distance (positive integer) from this msg to the root
        prev: Array<MsgHash> // list of msg hashes of existing msgs, unique set and ordered alphabetically
      }
    }
    type: 'group' // MUST be 'group'
    v: 2
  }
  pubkey: Pubkey
  sig: Signature
}
```

## Feed root

The root msg for a feed is special, its `metadata` is predictable and can be constructed by any peer. It is a data-less msg with the following shape:

```typescript
interface Msg {
  data: null // MUST be null
  metadata: {
    dataHash: null // MUST be null
    dataSize: 0 // MUST be 0
    group: string // MUST be a group ID
    groupTips: null // MUST be null
    tangles: {} // MUST be empty object
    type: string
    v: 2
  }
  pubkey: Pubkey
  sig: Signature
}
```

Thus, given a `group` and a `type`, any peer can construct the `metadata` part of the feed root msg, and thus can derive the "msg ID" for the root based on that `metadata`.

Given the root msg ID, any peer can thus refer to the feed tangle, because the root msg ID is the tangle ID for the feed tangle.

Note also that _any peer_ can construct the root msg and sign it! Which renders the signatures for feed roots meaningless and ignorable.

## Prev links

A msg can refer to 0 or more prev msgs. The prev links are used to build the tangle.

The `prev` array for a tangle should list:

- All current "tips" (msgs that are not yet listed inside any `prev`) of this tangle
- All msgs that are at the previous "lipmaa" depth relative to this `depth`

## JSON serialization

Whenever we need to serialize any JSON in the context of creating a Feed V1 message, we follow the "JSON Canonicalization Scheme" (JSC) defined by [RFC 8785](https://tools.ietf.org/html/rfc8785).

# Feed V1

JSON

```typescript
interface Msg {
  content: any | null // any object, or null
  metadata: {
    hash: ContentHash // blake3 hash of the `content` object serialized
    size: number // byte size (unsigned integer) of the `content` object serialized
    tangles: {
      // for each tangle this msg belongs to, identified by the tangle's root
      [rootMsgHash: string]: {
        depth: number // maximum distance (positive integer) from this msg to the root
        prev: Array<MsgHash> // list of msg hashes of existing msgs, unique set and ordered alphabetically
      }
    }
    type: string // alphanumeric string, at least 3 chars, max 100 chars
    v: 1 // hard-coded at 1, indicates the version of the feed format
    who: Pubkey // base58 encoded string for the author's public key
  }
  sig: Signature // Signs the `metadata` object
}
```

## Msg ID

A "msg ID" or "msg hash" is the blake3 hash of the msg's `metadata` object serialized.

## Tangles

A msg can belong to 1 or more tangles. Every msg belongs at least to the "feed" tangle. Every tangle is identified by the msg hash of root msg of the tangle. There can only be one root msg per tangle.

## Prev links

A msg can refer to 0 or more prev msgs. The prev links are used to build the tangle.

The `prev` array for a tangle should list:

- All current "tips" (msgs that are not yet listed inside any `prev`) of this tangle
- All msgs that are at the previous "lipmaa" depth relative to this `depth`

## Feed root

The root msg for a feed is special, its `metadata` is predictable and can be constructed by any peer. It is a content-less msg with the following shape:

```typescript
{
  content: null,
  metadata: {
    hash: null,
    size: 0,
    tangles: {},
    type: string, // only flexible field, can be any string
    v: 1,
    who: Pubkey,
  },
  sig: Signature,
}
```

Thus, given a `who` and a `type`, any peer can construct the `metadata` part of the feed root msg, and thus can derive the "msg ID" for the root based on that `metadata`.

Given the root msg ID, any peer can thus refer to the feed tangle, because the root msg ID is the tangle ID for the feed tangle.

## JSON serialization

Whenever we need to serialize any JSON in the context of creating a Feed V1 message, we follow the "JSON Canonicalization Scheme" (JSC) defined by [RFC 8785](https://tools.ietf.org/html/rfc8785).
