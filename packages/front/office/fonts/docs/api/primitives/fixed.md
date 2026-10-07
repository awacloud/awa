---
module: fontFixed
category: primitives/fixed
dependencies: []
returns: object
worker-safe: true
status: complete
---

# fontFixed

> Fixed-point numeric helpers for OpenType — 16.16, F2Dot14, version16Dot16.

**Module** `fontFixed` | **Source** `packages/front/office/fonts/src/primitives/fixed.js` | **Deps** none | **Worker-safe** yes

Fixed-point encoded values used throughout OpenType. All represented as JS `Number` (no `bigint`) — 16.16 stays well under `Number.MAX_SAFE_INTEGER`.

## Resolve

```js
const { fixedFromInt32, fixedToInt32,
        f2dot14FromInt16, f2dot14ToInt16,
        decodeVersion16Dot16, encodeVersion16Dot16 } = runtime.resolve('fontFixed');
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `fixedFromInt32` | `(i: number) => number` | Decodes a BE int32 into a Fixed 16.16. |
| `fixedToInt32` | `(v: number) => number` | Encodes a Fixed 16.16 into an int32 (32-bit signed). |
| `f2dot14FromInt16` | `(i: number) => number` | Decodes an int16 into F2Dot14. |
| `f2dot14ToInt16` | `(v: number) => number` | Encodes an F2Dot14 — saturated to `[-32768, 32767]`. |
| `decodeVersion16Dot16` | `(i: number) => { major, minor }` | Splits a raw version16Dot16 value. |
| `encodeVersion16Dot16` | `(major, minor) => number` | Inverse of `decodeVersion16Dot16`. |

## JS ↔ binary mapping

| OT type | Bytes | JS via |
|---------|-------|--------|
| `Fixed` (16.16) | 4 | `int32 / 65536` |
| `F2Dot14` | 2 | `int16 / 16384` |
| `version16Dot16` | 4 | `{ major: hi16, minor: lo16 }` (never arithmetic) |

## Examples

### 16.16

```js
const f = runtime.resolve('fontFixed');
f.fixedFromInt32(0x00010000);  // 1.0
f.fixedToInt32(1.5);           // 0x00018000
```

### version16Dot16

```js
f.decodeVersion16Dot16(0x00010000);  // { major: 1, minor: 0 }
```

## Notes

- `version16Dot16` must NEVER be treated as an arithmetic number — use `decodeVersion16Dot16`.
- `f2dot14ToInt16` is saturating: values outside `[-2, 2)` are clamped without throwing.

## See also

- [reader](./reader.md) — uses `fixedFromInt32`
- [writer](./writer.md)
