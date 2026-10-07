---
module: fontChecksum
category: primitives/checksum
dependencies: []
returns: object
worker-safe: true
status: complete
---

# fontChecksum

> OpenType checksum — sum of BE uint32 words modulo 2^32, `head.checksumAdjustment`.

**Module** `fontChecksum` | **Source** `packages/front/office/fonts/src/primitives/checksum.js` | **Deps** none | **Worker-safe** yes

Implements [OT spec §5.1](https://learn.microsoft.com/en-us/typography/opentype/spec/otff#calculating-checksums): tables are zero-padded to 4 bytes then summed as BE uint32 words. The `head.checksumAdjustment` field receives `0xB1B0AFBA − checksum(entire font)`.

## Resolve

```js
const { calcTableChecksum, computeChecksumAdjustment } = runtime.resolve('fontChecksum');
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `calcTableChecksum` | `(bytes: Uint8Array) => number` | uint32 — sum of BE 32-bit words, zero-padded tail. |
| `computeChecksumAdjustment` | `(entireFontBytes: Uint8Array) => number` | uint32 = `0xB1B0AFBA − calcTableChecksum(entireFontBytes)`. |

## Examples

### Checksum of a table

```js
const { calcTableChecksum } = runtime.resolve('fontChecksum');
const ck = calcTableChecksum(headBytes);
```

### Final adjustment

```js
// 1) zero-fill the 4 bytes of head.checksumAdjustment (offset 8 in the head table)
// 2) compute
const adj = computeChecksumAdjustment(assembledFontBytes);
// 3) write `adj` BE at the zeroed location
```

## Notes

- The tail bytes (< 4) are treated as if zero-padded for the sum — no mutation of the buffer.
- The caller must zero-out `head.checksumAdjustment` before calling `computeChecksumAdjustment`, otherwise the result is wrong.

## See also

- [sfnt](../sfnt/sfnt.md) — `packSfnt` orchestrates the adjustment
- [head](../table/head.md) — owner of `checksumAdjustment`
