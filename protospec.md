# Feed V1

JSON

```typescript
interface Msg {
  content: any | null, // any object, or null
  metadata: {
    hash: ContentHash, // blake3 hash of the `content` object serialized
    size: number, // byte size (unsigned integer) of the `content` object serialized
    tangles: {
      // for each tangle this msg belongs to, identified by the tangle's root
      [rootMsgHash: string]: {
        depth: number, // maximum distance (positive integer) from this msg to the root
        prev: Array<MsgHash>, // list of msg hashes of existing msgs
      },
    },
    type: string, // alphanumeric string, at least 3 chars, max 100 chars
    v: 1, // hard-coded at 1, indicates the version of the feed format
    who: Pubkey, // base58 encoded string for the author's public key
  },
  sig: Signature, // Signs the `metadata` object
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

Whenever we need to serialize any JSON in the context of creating a Feed V1 message, we use the following rules:

- Object fields are ordered alphabetically by field key
- No whitespace nor newliners are added
- No trailing commas are added
- UTF-8 encoding
