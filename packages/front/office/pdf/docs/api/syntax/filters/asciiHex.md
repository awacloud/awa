---
module: pdfAsciiHex
category: pdf/syntax/filters
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfAsciiHex

> `ASCIIHexDecode` ISO 32000-2 §7.4.2 — pairs of hex digits → bytes.

**Module** `pdfAsciiHex` | **Source** `packages/front/office/pdf/src/syntax/filters/asciiHex.js` | **Deps** `pdfErrors` | **Worker-safe** yes

Each ASCII hex pair decodes to one byte. Whitespace (`SP`, `HT`, `LF`, `CR`,
`FF`, `NUL`) is ignored. The `>` terminator stops the stream. An odd number of
digits is treated as if a trailing `0` were present (spec §7.4.2). Mixed case is
tolerated on decode; the encoder emits uppercase hex with a line break every 32
bytes and a final `>`.

## Resolve

```js
const ahx = runtime.resolve('pdfAsciiHex');
// Returns: { decode, encode }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `decode` | `(bytes: Uint8Array) => Uint8Array` | Binary bytes. |
| `encode` | `(bytes: Uint8Array) => Uint8Array` | ASCII hex plus the `>` EOD. |

## Examples

### Decode

```js
const ahx = runtime.resolve('pdfAsciiHex');
const src = new TextEncoder().encode('48 65 6C 6C 6F>');
const out = ahx.decode(src);
new TextDecoder().decode(out);   // 'Hello'
```

### Trailing odd digit (implicit `0`)

```js
ahx.decode(new TextEncoder().encode('A>'));   // [0xA0]
```

### Encode round trip

```js
const bin = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
const enc = ahx.encode(bin);                  // 'DEADBEEF>'
const back = ahx.decode(enc);
// back equals bin.
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/asciiHex/bad-input` | `ParseError` | Argument is not a `Uint8Array`. |
| `pdf/asciiHex/bad-digit` | `ParseError` | Byte outside `0-9`, `A-F`, `a-f`, whitespace, or `>`. |

## See also

- [`pdfAscii85`](./ascii85.md) — denser 5-for-4 encoding.
- [`pdfFilterDispatch`](./dispatch.md)
- [Filters index](./README.md)
