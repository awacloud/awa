---
module: tableHead
category: table/head
dependencies: [fontErrors, fontReader, fontWriter]
returns: object
worker-safe: true
status: complete
---

# tableHead

> Table `head` — Font Header (OT §6.4.2), 54 fixed bytes.

**Module** `tableHead` | **Source** `packages/front/office/fonts/src/table/head.js` | **Deps** `fontErrors`, `fontReader`, `fontWriter` | **Worker-safe** yes

Font header: version, revision, `magicNumber` (`0x5F0F3CF5`), `unitsPerEm` (16..16384), global bbox, dates, and — most importantly — `indexToLocFormat`, which drives the shape of `loca`.

## Resolve

```js
const { parseHead, encodeHead, HEAD_MAGIC } = runtime.resolve('tableHead');
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseHead` | `(bytes: Uint8Array) => HeadTable` | Throws if magic ≠ `0x5F0F3CF5`, upem outside `[16,16384]`, or `indexToLocFormat ∉ {0,1}`. |
| `encodeHead` | `(head: HeadTable) => Uint8Array` | 54 bytes, `magicNumber` always written. |
| `HEAD_MAGIC` | `number` | `0x5F0F3CF5`. |

### `HeadTable`

| Field | Type | Notes |
|-------|------|-------|
| `majorVersion`, `minorVersion` | `uint16` | — |
| `fontRevision` | Fixed 16.16 | — |
| `checksumAdjustment` | uint32 | Computed at SFNT post-assembly. |
| `magicNumber` | uint32 | `HEAD_MAGIC`. |
| `flags`, `macStyle` | uint16 bitfield | — |
| `unitsPerEm` | uint16 | 16..16384. |
| `created`, `modified` | LONGDATETIME | Seconds since 1904. |
| `xMin`, `yMin`, `xMax`, `yMax` | int16 | Global bbox. |
| `lowestRecPPEM` | uint16 | — |
| `fontDirectionHint` | int16 | — |
| `indexToLocFormat` | `0 \| 1` | 0 = short loca, 1 = long. |
| `glyphDataFormat` | int16 | — |

## Examples

```js
const { parseHead } = runtime.resolve('tableHead');
const head = parseHead(sfnt.tables.head.bytes);
console.log(head.unitsPerEm, head.indexToLocFormat);
```

## Notes

- `parseHead` is strict: magic and upem bounds trigger an immediate throw.
- `encodeHead` uses reasonable defaults: `lowestRecPPEM = 8`, `fontDirectionHint = 2`, `unitsPerEm = 1000`.

## See also

- [loca](./loca.md) — consumer of `indexToLocFormat`
- [sfnt](../sfnt/sfnt.md)
