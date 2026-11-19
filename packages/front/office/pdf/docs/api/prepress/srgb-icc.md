---
module: pdfSrgbIcc
category: pdf/prepress
dependencies: []
returns: object
worker-safe: true
status: complete
---

# pdfSrgbIcc

> A first-party sRGB ICC profile — the default destination profile of a PDF/A output intent.

**Module** `pdfSrgbIcc` | **Source** `packages/front/office/pdf/src/prepress/srgb-icc.js` | **Deps** none | **Worker-safe** yes

`buildSrgbIcc()` assembles an ICC v2 display profile (`mntr` / `RGB ` / `XYZ `) in code from the public IEC 61966-2.1 sRGB colorimetry: the sRGB colorants adapted to the ICC connection space, its illuminant as white point and one gamma (about 2.2) curve shared by the three tone curves. It holds no third-party bytes ([provenance](../../../src/prepress/PROVENANCE.md)) and gives the same bytes on every call. [`pdfBuilder`](../document/builder.md#pdfa) writes it, as `/DestOutputProfile` of a `GTS_PDFA1` output intent, under `pdfA`.

## Resolve

```js
const icc = runtime.resolve('pdfSrgbIcc');
// Returns: { buildSrgbIcc, SRGB_ICC_N, SRGB_CONDITION }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `buildSrgbIcc` | `() => Uint8Array` | The profile's bytes. |
| `SRGB_ICC_N` | `number` | `3`: the colour components (the output intent's `/N`). |
| `SRGB_CONDITION` | `string` | `'sRGB IEC61966-2.1'`: the output condition identifier. |

## Examples

```js
const { buildSrgbIcc } = runtime.resolve('pdfSrgbIcc');
const profile = buildSrgbIcc();   // a valid ICC v2 RGB display profile
```

## Errors

None.

## See also

- [`pdfBuilder`](../document/builder.md#pdfa) · [`pdfOutputIntent`](./outputIntent.md)
- [Prepress](./README.md)
