---
module: tableLoca
category: table/loca
dependencies: [fontErrors, fontReader, fontWriter]
returns: object
worker-safe: true
status: complete
---

# tableLoca

> Table `loca` — Index to Location (OT §6.4.13).

**Module** `tableLoca` | **Source** `packages/front/office/fonts/src/table/loca.js` | **Deps** `fontErrors`, `fontReader`, `fontWriter` | **Worker-safe** yes

Array of `numGlyphs + 1` offsets into `glyf`. The format is driven by `head.indexToLocFormat`:

- **short (0)** — `uint16`, offset stored as `bytes / 2` (limit: 128 KiB of glyf).
- **long (1)** — `uint32`, offset in raw bytes.

Glyph N occupies `[offsets[N], offsets[N+1])`; an empty glyph has `offsets[N] === offsets[N+1]`.

## Resolve

```js
const { parseLoca, encodeLoca } = runtime.resolve('tableLoca');
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseLoca` | `(bytes, numGlyphs, indexToLocFormat) => Uint32Array` | `numGlyphs + 1` offsets in bytes. |
| `encodeLoca` | `(offsets: Uint32Array \| number[]) => { bytes, indexToLocFormat }` | Picks short if all offsets are `≤ 0x1FFFE` and even. |

## Examples

```js
const { parseLoca } = runtime.resolve('tableLoca');
const loca = parseLoca(sfnt.tables.loca.bytes, maxp.numGlyphs, head.indexToLocFormat);
// loca[gid+1] - loca[gid] === glyph size in bytes
```

```js
const { encodeLoca } = runtime.resolve('tableLoca');
const { bytes, indexToLocFormat } = encodeLoca(offsets);
head.indexToLocFormat = indexToLocFormat;   // keep in sync
```

## Notes

- The encoder selects short only if **every** offset is even AND `≤ 0x1FFFE` — a single failure falls back to long.
- The caller must propagate `indexToLocFormat` back into `head` after encoding.
- A format outside `{0,1}` throws `ParseError('fonts/loca-bad-format')`.
- `parseLoca` also validates the offsets are non-decreasing; a drop throws `ParseError('fonts/loca-non-monotonic')`.

## See also

- [head](./head.md) — provides `indexToLocFormat`
- [glyf](./glyf.md) — consumer of the offsets
