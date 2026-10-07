---
module: tableOs2
category: table/os2
dependencies: [fontErrors, fontReader, fontWriter]
returns: object
worker-safe: true
status: complete
---

# tableOs2

> Table `OS/2` — OS/2 and Windows Metrics (OT §6.4.7), versions 0–5.

**Module** `tableOs2` | **Source** `packages/front/office/fonts/src/table/os2.js` | **Deps** `fontErrors`, `fontReader`, `fontWriter` | **Worker-safe** yes

Sizes per version:

| Version | Size | Additional fields |
|---------|--------|---------------------|
| 0 | 78 | base |
| 1 | 86 | + `ulCodePageRange1/2` |
| 2 | 96 | + `sxHeight`, `sCapHeight`, `usDefaultChar`, `usBreakChar`, `usMaxContext` |
| 3 | 96 | (same layout as v2) |
| 4 | 96 | (same layout, new `fsSelection` bits) |
| 5 | 100 | + `usLowerOpticalPointSize`, `usUpperOpticalPointSize` |

## Resolve

```js
const { parseOs2, encodeOs2 } = runtime.resolve('tableOs2');
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseOs2` | `(bytes: Uint8Array) => OS2Table` | Only the fields present for the detected version are filled in. |
| `encodeOs2` | `(os2: OS2Table) => Uint8Array` | Size determined by `os2.version`. |

Base fields common to every version: `xAvgCharWidth`, `usWeightClass`, `usWidthClass`, `fsType`, `ySubscript*`, `ySuperscript*`, `yStrikeout*`, `sFamilyClass`, `panose[10]`, `ulUnicodeRange1..4`, `achVendID`, `fsSelection`, `usFirstCharIndex`, `usLastCharIndex`, `sTypoAscender`, `sTypoDescender`, `sTypoLineGap`, `usWinAscent`, `usWinDescent`.

## Examples

```js
const { parseOs2 } = runtime.resolve('tableOs2');
const os2 = parseOs2(sfnt.tables['OS/2'].bytes);
console.log(os2.usWeightClass, os2.fsSelection);
```

## Notes

- `achVendID` is read as a 4-character ASCII string (not a uint32).
- `panose` is an array of 10 numbers (not a Uint8Array), for easier JSON serialisation.
- `encodeOs2` applies safe defaults: `usWeightClass=400`, `usWidthClass=5`, `usLastCharIndex=0xFFFF`, etc.

## See also

- [head](./head.md), [hhea](./hhea.md) — other metrics
- [fonts](../fonts.md)
