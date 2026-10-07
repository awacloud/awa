---
module: pdfAscii85
category: pdf/syntax/filters
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfAscii85

> `ASCII85Decode` ISO 32000-2 §7.4.3 — base 85, 5 chars ↔ 4 bytes.

**Module** `pdfAscii85` | **Source** `packages/front/office/pdf/src/syntax/filters/ascii85.js` | **Deps** `pdfErrors` | **Worker-safe** yes

Five ASCII characters in the `!`..`u` range decode to 4 binary bytes,
interpreted as a big-endian 32-bit integer in base 85. The special character `z`
stands for 4 zero bytes and may appear only at a group boundary. The stream is
terminated by `~>`. The final group may be 2..4 characters, decoding to 1..3
trailing bytes (padded with `u` = 84, keeping `count - 1` bytes). Whitespace is
ignored.

## Resolve

```js
const a85 = runtime.resolve('pdfAscii85');
// Returns: { decode, encode }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `decode` | `(bytes: Uint8Array) => Uint8Array` | Binary bytes. |
| `encode` | `(bytes: Uint8Array) => Uint8Array` | ASCII85 plus the `~>` EOD. |

## Examples

### Decode

```js
const a85 = runtime.resolve('pdfAscii85');
const src = new TextEncoder().encode('87cURD]j~>');
const out = a85.decode(src);
new TextDecoder().decode(out);   // 'Hello'
```

### Zero group (`z`)

```js
a85.decode(new TextEncoder().encode('z~>'));   // [0,0,0,0]
```

### Round trip with a tail

```js
const bin = new Uint8Array([1, 2, 3]);         // 3 bytes → 4 chars + ~>
const enc = a85.encode(bin);
const back = a85.decode(enc);
// back equals bin.
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/ascii85/bad-input` | `ParseError` | Argument is not a `Uint8Array`. |
| `pdf/ascii85/bad-eod` | `ParseError` | `~` not followed by `>`. |
| `pdf/ascii85/bad-z` | `ParseError` | `z` inside a group (`count !== 0`). |
| `pdf/ascii85/bad-digit` | `ParseError` | Character outside `!`..`u`, not whitespace, not `z`/`~`. |

## See also

- [`pdfAsciiHex`](./asciiHex.md) — simpler alternative, 2 chars per byte.
- [`pdfFilterDispatch`](./dispatch.md)
- [Filters index](./README.md)
