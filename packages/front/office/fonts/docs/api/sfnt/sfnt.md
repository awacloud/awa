---
module: fontSfnt
category: sfnt/sfnt
dependencies: [fontErrors, fontsShared, fontReader, fontWriter, fontTag, fontChecksum]
returns: object
worker-safe: true
status: complete
---

# fontSfnt

> SFNT container — parses / packs the OpenType / TrueType table directory.

**Module** `fontSfnt` | **Source** `packages/front/office/fonts/src/sfnt/sfnt.js` | **Deps** `fontErrors`, `fontsShared`, `fontReader`, `fontWriter`, `fontTag`, `fontChecksum` | **Worker-safe** yes

Implements [OT §5](https://learn.microsoft.com/en-us/typography/opentype/spec/otff) — the `sfntVersion` + `numTables` header followed by the `Table Record`s. `parseSfnt` returns the directory and the raw per-table bytes (views over the source buffer). `packSfnt` reassembles from a name→bytes map, computes checksums and patches `head.checksumAdjustment`.

## Resolve

```js
const { parseSfnt, packSfnt, sfntSearchParams,
        SFNT_FLAVOR, flavorFromVersion, versionFromFlavor,
        tag, untag } = runtime.resolve('fontSfnt');
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parseSfnt` | `(bytes: Uint8Array) => SfntFile` | Parsed directory + tables (views). |
| `packSfnt` | `({ flavor?, tables }) => Uint8Array` | Full SFNT bytes, checksums & adjustment applied. |
| `sfntSearchParams` | `(numTables: number) => { searchRange, entrySelector, rangeShift }` | OT binary-search triple. |
| `flavorFromVersion` | `(u32: number) => string\|null` | Maps `sfntVersion` → flavor label. |
| `versionFromFlavor` | `(s: string) => number` | Inverse. |
| `tag` / `untag` | re-exported from `fontTag` | — |
| `SFNT_NUM_TABLES_MAX` | const | `64` — the directory cap enforced by `parseSfnt` (a larger `numTables` throws a `ParseError`). |

### `SFNT_FLAVOR` constants

`SFNT_FLAVOR` is defined by the `fontsShared` dependency and re-exported here. Its four keys:

| Flavor label | `SFNT_FLAVOR` key | sfntVersion |
|--------------|-------------------|-------------|
| `'truetype'` | `TRUETYPE` | `0x00010000` |
| `'opentype'` | `OPENTYPE` | `'OTTO'` (0x4F54544F) |
| `'apple-true'` | `APPLE_TRUE` | `'true'` |
| `'apple-typ1'` | `APPLE_TYP1` | `'typ1'` |

### `SfntFile` shape

```js
{
    sfntVersion: 0x00010000,
    flavor:      'truetype',
    tables: {
        head: { tag, checksum, offset, length, bytes: Uint8Array }, ...
    },
    raw: Uint8Array
}
```

`tables[name].bytes` is a **view** shared with `raw`.

## Examples

### Parse + access a table's raw bytes

```js
const { parseSfnt } = runtime.resolve('fontSfnt');
const sfnt = parseSfnt(bytes);
console.log(sfnt.flavor, Object.keys(sfnt.tables));
const headBytes = sfnt.tables.head.bytes;
```

### Pack from per-table bytes

```js
const { packSfnt } = runtime.resolve('fontSfnt');
const out = packSfnt({
    flavor: 'truetype',
    tables: { head: headBytes, hhea: hheaBytes, maxp: maxpBytes, /* … */ }
});
```

## Notes

- Table order on pack follows the sorted tag (OT recommendation). No support for an alternative "optimal" order.
- `parseSfnt` does not validate each table — only the directory and the offset+length bounds.
- An unknown SFNT version throws `ParseError('fonts/sfnt-unknown-version')`.
- `packSfnt` auto-detects the flavor from the presence of `CFF ` / `CFF2` when `flavor` is omitted.

## See also

- [fonts](../fonts.md) — top-level consumer
- [head](../table/head.md), [hhea](../table/hhea.md), [maxp](../table/maxp.md) — minimal tables
- [checksum](../primitives/checksum.md)
