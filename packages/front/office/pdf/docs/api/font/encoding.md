---
module: pdfFontEncoding
category: pdf/font
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfFontEncoding

> Resolution of a simple font's `/Encoding` entry — ISO 32000-2 §9.6.5.

**Module** `pdfFontEncoding` | **Source** `packages/front/office/pdf/src/font/encoding.js` | **Deps** `pdfErrors` | **Worker-safe** yes

Builds a 256-entry table of **glyph names** (or `null` for unmapped slots) from a PDF `/Encoding` entry. Three accepted shapes:

- **absent** → `StandardEncoding`.
- **name**: `/WinAnsiEncoding`, `/MacRomanEncoding`, `/MacExpertEncoding`, `/StandardEncoding`, `/SymbolEncoding`, `/ZapfDingbatsEncoding`.
- **dict**: `{ BaseEncoding?: name, Differences?: array }` — overlays slots on top of the base table.

The module is **pure**: it does not know the named tables themselves. The caller passes `lookupNamed` (typically `@awacloud/fonts/encodings#lookupEncoding`).

## Resolve

```js
const enc = runtime.resolve('pdfFontEncoding');
// Returns: { resolveEncoding }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `resolveEncoding` | `(entry, lookupNamed) => Array<string\|null>` | 256-entry table of glyph names. |

### `Differences` format (§9.6.5.4)

Array interleaving ints (starting slot) and names (consecutive glyphs):

```
[ 1 /a /b /c   65 /A /B ]
  └─ slot 1=a, 2=b, 3=c
                  └─ slot 65=A, 66=B
```

## Examples

### Named encoding

```js
const enc = runtime.resolve('pdfFontEncoding');
const table = enc.resolveEncoding(
    { type: 'name', value: 'WinAnsiEncoding' },
    lookupNamed
);
table[0x41];   // 'A'
table[0x80];   // 'Euro' (WinAnsi)
```

### Encoding with Differences

```js
const entry = obj.dict({
    BaseEncoding: obj.name('WinAnsiEncoding'),
    Differences: obj.array([
        obj.int(1), obj.name('exclamdown'), obj.name('cent')
    ])
});
const table = enc.resolveEncoding(entry, lookupNamed);
table[1];  // 'exclamdown'
table[2];  // 'cent'
```

### Absent encoding → Standard

```js
const table = enc.resolveEncoding(null, lookupNamed);
// → StandardEncoding
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/encoding/bad-base` | `ParseError` | `/BaseEncoding` is not a name. |
| `pdf/encoding/bad-shape` | `ParseError` | `/Encoding` is neither a name nor a dict. |
| `pdf/encoding/bad-differences` | `ParseError` | `/Differences` is not an array. |
| `pdf/encoding/bad-differences-entry` | `ParseError` | A `/Differences` entry is neither int nor name. |

## See also

- [`pdfFont`](./font.md) — carries the `encoding` field.
- [`pdfType3`](./type3.md) — accepts the same format.
- [`pdfText`](../content/text.md) — `extractText` consumes the mapping.
