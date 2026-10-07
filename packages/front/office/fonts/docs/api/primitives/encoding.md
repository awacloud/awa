---
module: fontEncoding
category: primitives/encoding
dependencies: [fontErrors]
returns: object
worker-safe: true
status: complete
---

# fontEncoding

> Text encodings for the `name` table — UTF-16BE and Mac Roman.

**Module** `fontEncoding` | **Source** `packages/front/office/fonts/src/primitives/encoding.js` | **Deps** `fontErrors` | **Worker-safe** yes

Covers the two dominant encodings in the `name` table:

- **UTF-16BE** — Windows platform (3) encoding 1 (BMP) or 10 (full repertoire), Unicode platform (0).
- **Mac Roman** — Macintosh platform (1) encoding 0, 256-byte table.

Other Mac scripts (Japanese, ChineseTrad, …) are not supported: the corresponding `name` records keep their raw bytes unchanged.

## Resolve

```js
const { decodeUtf16Be, encodeUtf16Be, decodeMacRoman, encodeMacRoman } = runtime.resolve('fontEncoding');
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `decodeUtf16Be` | `(bytes: Uint8Array) => string` | Decodes UTF-16BE. |
| `encodeUtf16Be` | `(str: string) => Uint8Array` | Encodes (treated as UCS-2 / UTF-16 code units). |
| `decodeMacRoman` | `(bytes: Uint8Array) => string` | Decodes Mac Roman to Unicode. |
| `encodeMacRoman` | `(str: string) => Uint8Array` | Best-effort encode — characters outside the table → `'?'` (0x3F). |

## Examples

### UTF-16BE decoding

```js
const { decodeUtf16Be } = runtime.resolve('fontEncoding');
decodeUtf16Be(new Uint8Array([0x00, 0x41, 0x00, 0x42]));  // 'AB'
```

### Mac Roman

```js
const { encodeMacRoman, decodeMacRoman } = runtime.resolve('fontEncoding');
decodeMacRoman(new Uint8Array([0xC4]));  // '√'
encodeMacRoman('café');                  // Mac Roman bytes
```

## Notes

- `decodeUtf16Be` requires an even length — otherwise `ParseError('fonts/utf16be-odd')`.
- `encodeMacRoman` is best-effort: any character outside the 256-entry coverage becomes `'?'` without throwing.
- For surrogate pairs, `encodeUtf16Be` writes the raw 16-bit JS code units directly (no BMP expansion).

## See also

- [name](../table/name.md) — main consumer
- [errors](../errors.md)
