# Msg V3

Background: https://github.com/ssbc/ssb2-discussion-forum/issues/24

## Terminology

- **Msg** = published data that is signed and shareable
- **Msg hash** = hash(msg.metadata)
- **Tangle** = any single-root DAG of msgs that can be replicated by peers
- **Tangle Root** = the origin msg of a tangle
- **Tangle Tips** = tangle msgs that are not yet referenced by any other msg in the tangle
- **Tangle ID** = Msg hash of the tangle's root msg
- **Identity tangle** = tangle with msgs that add (or remove?) asymmetric-crypto public keys
- **ID** = tangle ID of the identity tangle, refers to the "identity" of a person or a group
- **Feed** = tangle with msgs authored by (any pubkey in) an identity
- **Feed root** = a msg that is deterministically predictable and empty, so to allow others to pre-know its hash
- **Feed ID** = ID of a feed (Msg ID of the feed's root msg)

JSON

```typescript
interface Msg {
  data: any | null // any object, or null
  metadata: {
    dataHash: ContentHash | null // blake3 hash of the `content` object serialized
    dataSize: number // byte size (unsigned integer) of the `content` object serialized
    identity: string | 'self' | null // blake3 hash of an identity tangle root msg, or the string 'self', or null
    identityTips: Array<string> | null // list of blake3 hashes of identity tangle tips, or null
    tangles: {
      // for each tangle this msg belongs to, identified by the tangle's root
      [rootMsgHash: string]: {
        depth: number // maximum distance (positive integer) from this msg to the root
        prev: Array<MsgHash> // list of msg hashes of existing msgs, unique set and ordered alphabetically
      }
    }
    domain: string // alphanumeric string, at least 3 chars, max 100 chars
    v: 2 // hard-coded at 2, indicates the version of the feed format
  }
  pubkey: Pubkey // base58 encoded string for the author's public key
  sig: Signature // Signs the `metadata` object
}
```

## Identity tangle msgs

Msgs in an identity tangle are special because they have empty `identity` and `identityTips` fields.

```typescript
interface Msg {
  data: IdentityData
  metadata: {
    dataHash: ContentHash
    dataSize: number
    identity: 'self' // MUST be the string 'self'
    identityTips: null // MUST be null
    tangles: {
      [identityTangleId: string]: {
        depth: number // maximum distance (positive integer) from this msg to the root
        prev: Array<MsgHash> // list of msg hashes of existing msgs, unique set and ordered alphabetically
      }
    }
    domain: string // alphanumeric string, at least 3 chars, max 100 chars
    v: 2
  }
  pubkey: Pubkey
  sig: Signature
}

type IdentityData =
  | { action: 'add' add: IdentityAdd }
  | { action: 'del' del: IdentityDel }

type IdentityAdd = {
  key: Key
  nonce?: string // nonce required only on the identity tangle's root
  consent?: string // base58 encoded signature of the string `:identity-add:<ID>` where `<ID>` is the identity's ID, required only on non-root msgs
}

type IdentityDel = {
  key: Key
}

type Key =
  | {
      purpose: 'sig' // digital signatures
      algorithm: 'ed25519' // libsodium crypto_sign_detached
      bytes: string // base58 encoded string for the public key being added
    }
  | {
      purpose: 'subidentity'
      algorithm: 'tangle' // PPPPP tangle
      bytes: string // subidentity ID
    }
  | {
      // WIP!!
      purpose: 'box' // asymmetric encryption
      algorithm: 'x25519-xsalsa20-poly1305' // libsodium crypto_box_easy
      bytes: string // base58 encoded string of the public key
    }
```

Examples of `IdentityData`:

- Registering the first signing pubkey:
  ```json
  {
    "action": "add",
    "add": {
      "key": {
        "purpose": "sig",
        "algorithm": "ed25519",
        "bytes": "3JrJiHEQzRFMzEqWawfBgq2DSZDyihP1NHXshqcL8pB9"
      },
      "nonce": "6GHR1ZFFSB3C5qAGwmSwVH8f7byNo8Cqwn5PcyG3qDvS"
    }
  }
  ```
- Registering a subidentity:
  ```json
  {
    "action": "add",
    "add": {
      "key": {
        "purpose": "subidentity",
        "algorithm": "tangle",
        "bytes": "6yqq7iwyJEKdofJ3xpRLEq"
      }
    }
  }
  ```
- Revoking a signing pubkey:
  ```json
  {
    "action": "del",
    "del": {
      "key": {
        "purpose": "sig",
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
    identity: string // MUST be an ID
    identityTips: null // MUST be null
    tangles: {} // MUST be empty object
    domain: string
    v: 2
  }
  pubkey: Pubkey
  sig: Signature
}
```

Thus, given a `identity` and a `domain`, any peer can construct the `metadata` part of the feed root msg, and thus can derive the "msg ID" for the root based on that `metadata`.

Given the root msg ID, any peer can thus refer to the feed tangle, because the root msg ID is the tangle ID for the feed tangle.

Note also that _any peer_ can construct the root msg and sign it! Which renders the signatures for feed roots meaningless and ignorable.

## Prev links

A msg can refer to 0 or more prev msgs. The prev links are used to build the tangle.

The `prev` array for a tangle should list:

- All current "tips" (msgs that are not yet listed inside any `prev`) of this tangle
- All msgs that are at the previous "lipmaa" depth relative to this `depth`

## JSON serialization

Whenever we need to serialize any JSON in the context of creating a Feed V1 message, we follow the "JSON Canonicalization Scheme" (JSC) defined by [RFC 8785](https://tools.ietf.org/html/rfc8785).

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
