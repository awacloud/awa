---
module: pdfShared
category: _shared
dependencies: []
returns: object
worker-safe: true
status: complete
---

# pdfShared

> PDF byte-level constants and stateless helpers, shared across `@awacloud/pdf` factories.

**Module** `pdfShared` | **Source** `packages/front/office/pdf/src/_shared/index.js` | **Deps** _(none)_ | **Worker-safe** yes

Magic bytes, ASCII byte values, the ISO 32000-2 §7.2 character classes, a hex
lookup table, text codec instances and a few byte helpers. `pdfTokenizer` and
the top-level [`pdf`](../pdf.md) declare it as a dependency; other modules
(the filters, `pdfWriter`, `pdfSerializer`) still carry their own inline
copies of some of these helpers.

## Resolve

```js
const shared = runtime.resolve('pdfShared');
// → { HEADER_PREFIX, EOF_MARKER, BINARY_MARKER,
//     ASCII,
//     isWs, isEol, isDigit, isHex, isDelim, isRegular, hexNibble,
//     HEX_LO,
//     te, tdUtf8, tdUtf8Lenient, tdLatin1,
//     encodeAscii, decodeUtf8, decodeUtf8Lenient, decodeLatin1,
//     pad10, hexLit, bytesEqual, concatBytes }
```

`pdfShared` is exported by name from the package root (`import { pdfShared }
from '@awacloud/pdf'`); it has no sub-path of its own.

## API

| Member | Type | Description |
|--------|------|-------------|
| `HEADER_PREFIX` | `Uint8Array` | The 5 bytes `%PDF-`. |
| `EOF_MARKER` | `Uint8Array` | The 5 bytes `%%EOF`. |
| `BINARY_MARKER` | `Uint8Array` | The binary-marker comment line written after the header (§7.5.2): bytes `0x25 0xE2 0xE3 0xCF 0xD3 0x0A`. |
| `ASCII` | `object<string, number>` | Frozen byte values: `NUL`, `HT`, `LF`, `FF`, `CR`, `SP`, `HASH`, `PERCENT`, `LPAREN`, `RPAREN`, `PLUS`, `MINUS`, `DOT`, `SLASH`, `ZERO`, `NINE`, `LANGLE`, `RANGLE`, `A_UP`, `F_UP`, `Z_UP`, `LBRACK`, `BACKSLASH`, `RBRACK`, `A_LO`, `F_LO`, `Z_LO`, `LBRACE`, `RBRACE`. |
| `isWs(b)` | `(number) => boolean` | PDF white-space byte (`NUL`, `HT`, `LF`, `FF`, `CR`, `SP`), §7.2.3. |
| `isEol(b)` | `(number) => boolean` | `LF` or `CR`. |
| `isDigit(b)` | `(number) => boolean` | `0`–`9`. |
| `isHex(b)` | `(number) => boolean` | `0`–`9`, `A`–`F`, `a`–`f`. |
| `isDelim(b)` | `(number) => boolean` | A delimiter: `( ) < > [ ] { } / %`. |
| `isRegular(b)` | `(number) => boolean` | Neither white space nor a delimiter. |
| `hexNibble(b)` | `(number) => number` | The value of one hex digit byte, `-1` when `b` is not one. |
| `HEX_LO` | `Int8Array` (128 entries) | Lookup table with the same result as `hexNibble`, indexed by ASCII byte. |
| `te` | `TextEncoder` | One instance per factory call. |
| `tdUtf8` / `tdUtf8Lenient` | `TextDecoder` | UTF-8 decoders. Both are non-fatal (`fatal: false`, the `TextDecoder` default): a malformed sequence decodes to U+FFFD in either. |
| `tdLatin1` | `TextDecoder` | `latin1` decoder. |
| `encodeAscii(s)` | `(string) => Uint8Array` | `te.encode(s)` — UTF-8, so it equals ASCII only for an ASCII string. |
| `decodeUtf8(bytes)` / `decodeUtf8Lenient(bytes)` | `(Uint8Array) => string` | Wrappers over `tdUtf8` / `tdUtf8Lenient`. |
| `decodeLatin1(bytes)` | `(Uint8Array) => string` | Wrapper over `tdLatin1`. |
| `pad10(n)` | `(number) => string` | `n` left-padded with zeros to 10 digits (a cross-reference entry offset). |
| `hexLit(bytes)` | `(Uint8Array) => string` | The PDF hex-string literal `<…>`, upper-case digits. |
| `bytesEqual(a, b, n?)` | `(Uint8Array, Uint8Array, number?) => boolean` | Equality of two byte arrays without an early exit. Without `n`, both lengths must match; with `n`, compares the first `n` bytes and requires both arrays to be at least that long. `false` when either array is missing. |
| `concatBytes(arrays)` | `(Uint8Array[]) => Uint8Array` | One new array holding every input in order. |

## Examples

```js
const shared = runtime.resolve('pdfShared');

shared.decodeLatin1(shared.HEADER_PREFIX);              // '%PDF-'
shared.isWs(shared.ASCII.SP);                           // true
shared.hexNibble(0x61);                                 // 10 ('a')
shared.hexLit(Uint8Array.of(0xde, 0xad));               // '<DEAD>'
shared.pad10(42);                                       // '0000000042'
shared.bytesEqual(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 4), 2);   // true
shared.concatBytes([Uint8Array.of(1), Uint8Array.of(2, 3)]);            // Uint8Array [1, 2, 3]
```

## Notes

- **Worker-safe**: every member is a constant, a pure function, or a codec
  instance created inside the factory body, so `factory.toString()` is a
  self-contained closure.
- **No mutable module state**: `ASCII` is frozen; each `factory()` call
  creates its own codec instances and tables.

## See also

- [`pdfErrors`](../errors.md) — the other dependency-free core module.
- [`pdfTokenizer`](../syntax/tokenizer.md) — a consumer of the character classes.
- [API index](../README.md)
