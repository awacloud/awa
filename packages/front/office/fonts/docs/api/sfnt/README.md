# SFNT

SFNT container — OpenType / TrueType table directory, parsing and packing.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [sfnt](./sfnt.md) | `{parseSfnt, packSfnt, ...}` | `fontErrors`, `fontsShared`, `fontReader`, `fontWriter`, `fontTag`, `fontChecksum` | Parses / packs the SFNT directory, computes checksums. |

## Common pattern

```js
const { parseSfnt } = runtime.resolve('fontSfnt');
const sfnt = parseSfnt(bytes);
console.log(sfnt.flavor, Object.keys(sfnt.tables));
```
