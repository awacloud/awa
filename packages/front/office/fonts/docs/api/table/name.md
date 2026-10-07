---
module: tableName
category: table/name
dependencies: [fontErrors, fontReader, fontWriter, fontEncoding]
returns: object
worker-safe: true
status: complete
---

# tableName

> Table `name` — Naming Table (OT §6.4.5), formats 0 & 1.

**Module** `tableName` | **Source** `packages/front/office/fonts/src/table/name.js` | **Deps** `fontErrors`, `fontReader`, `fontWriter`, `fontEncoding` | **Worker-safe** yes

Stores human-readable strings (family, subfamily, copyright, …) under different `(platformID, encodingID)` pairs. Automatically decoded to a JS string for Unicode (UTF-16BE) and Mac Roman; other encodings keep `.raw` (Uint8Array).

## Resolve

```js
const { parseName, encodeName, getNameString, NAME_ID, PLATFORM } = runtime.resolve('tableName');
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseName` | `(bytes: Uint8Array) => { format, records, langTagRecords? }` | Records carry `.string` when decodable, `.raw` always. |
| `encodeName` | `(name) => Uint8Array` | Always emits format 0. |
| `getNameString` | `(name, nameID) => string \| undefined` | Selects the best record for an ID. |
| `NAME_ID` | frozen object | Standard ID constants. |
| `PLATFORM` | frozen object | `UNICODE`, `MAC`, `ISO`, `WINDOWS`, `CUSTOM`. |

### `NAME_ID` constants

`COPYRIGHT (0)`, `FONT_FAMILY (1)`, `FONT_SUBFAMILY (2)`, `UNIQUE_ID (3)`, `FULL_NAME (4)`, `VERSION (5)`, `POSTSCRIPT_NAME (6)`, `TRADEMARK (7)`, `MANUFACTURER (8)`, `DESIGNER (9)`, `DESCRIPTION (10)`, `VENDOR_URL (11)`, `DESIGNER_URL (12)`, `LICENSE (13)`, `LICENSE_URL (14)`, `TYPOGRAPHIC_FAMILY (16)`, `TYPOGRAPHIC_SUBFAMILY (17)`.

### `getNameString` preference

1. Windows English US (3, 1, 0x0409)
2. Any Windows platform (3, *, *)
3. Mac English (1, *, 0)
4. Any platform with `.string` defined

## Examples

```js
const { parseName, getNameString, NAME_ID } = runtime.resolve('tableName');
const name = parseName(sfnt.tables.name.bytes);
const family = getNameString(name, NAME_ID.FONT_FAMILY);
```

## Notes

- `encodeName` only emits format 0 — format 1 (langTags) is parsed but never written.
- An unsupported encoding at write time throws `ParseError('fonts/name-unsupported-encoding')`. Parsing, conversely, keeps `.raw` without throwing.
- Identical blobs are deduplicated in the string storage at encode time (cached by hex).
- Record count is capped at 32768 (`fonts/name-too-many`) — guards against a malicious table declaring 65535 records.

## See also

- [encoding](../primitives/encoding.md)
- [fonts](../fonts.md) — populates `font.names`
