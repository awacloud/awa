---
module: oconvPdfImagePng
category: oconv/read/pdf
dependencies: [pdfFilterDispatch, zlib, crc32]
returns: object
worker-safe: true
status: complete
---

# oconvPdfImagePng

> A raw-pixel pdf picture written as a PNG — the opt-in pdf pictures' encoder.

**Module** `oconvPdfImagePng` (`oconvPdfImagePng`) | **Source** `packages/front/office/oconv/src/read/pdf/image-png.js` | **Deps** `pdfFilterDispatch`, `zlib`, `crc32` | **Worker-safe** yes

Reads an image XObject's samples through `pdfFilterDispatch` and writes them as a PNG (ISO/IEC 15948), so that `oconvPdfTextExtract` (under `opts.images`) can place a picture that is neither a JPEG nor a JP2 file. Also exposes the PNG encoder itself.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const { encodePng, imageToPng } = runtime.resolve('oconvPdfImagePng');
```

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `encodePng` | `({width, height, bitDepth, colorType, data, palette?, iccProfile?}) => Uint8Array` | the PNG bytes | `oconv: bad png` |
| `imageToPng` | `(xo: object, resolve: (ref) => object) => {bytes: Uint8Array, masked: boolean} \| null` | the picture as a PNG and whether a mask was left out, or `null` when the picture is not one it writes | — |

## Examples

### Write a 2 × 1 RGB picture

```js
const png = encodePng({ width: 2, height: 1, bitDepth: 8, colorType: 2, data: new Uint8Array([255, 0, 0, 0, 0, 255]) });
png.subarray(0, 8);
// Uint8Array [137, 80, 78, 71, 13, 10, 26, 10] — the PNG signature
```

## Notes

- `encodePng` writes the signature, `IHDR`, `iCCP` when `iccProfile` is given (the profile zlib-compressed under the name `ICC profile`), `PLTE` for colour type 3 (`palette`: RGB triplets, at most 256), one `IDAT` — the zlib stream (fw `zlib`) of the rows, each led by filter byte 0 — and `IEND`, each chunk with its CRC-32 (fw `crc32`). `data` holds the rows packed as PNG packs them, `ceil(width × channels × bitDepth / 8)` bytes each. A dimension that is not a positive integer, a colour type or bit depth PNG does not allow, short `data`, a missing or malformed palette, or a non-byte profile throws `oconv: bad png`.
- `imageToPng` takes a picture whose filters decode to samples (none, Flate with or without a predictor, the ASCII and run-length filters — never DCT or JPX), not an `/ImageMask`, in **DeviceGray**, **DeviceRGB**, **ICCBased** with `/N` 1 or 3 (the profile carried in `iCCP`; the samples untouched — no colour conversion), **DeviceCMYK** or **ICCBased** with `/N` 4 (converted to 8-bit RGB without a profile: r = 255 (1 − c)(1 − k), g and b likewise from m and y, after `/Decode`; the profile not carried; masks and alpha as for RGB), or **Indexed** on one of those (hival ≤ 255, the lookup a string or a stream; a grey base replicated to RGB in `PLTE`, a CMYK one converted), at 1, 2, 4, 8 or 16 bits (Indexed 1–8), with a default `/Decode` or every pair inverted (`1 0`; an Indexed picture's `2^bpc−1 0`). A decoded stream shorter than `height` rows, or a picture whose samples or expanded pixels would pass 256 MiB, gives `null`.
- Without alpha the samples go through as packed — grey 1–16 bits, RGB 8 or 16, a palette 1–8 — and RGB at 1, 2 or 4 bits is widened to 8. An `/SMask` that is a DeviceGray image stream of the picture's width and height, decodable to samples, with no `/Matte`, becomes the alpha channel; a colour-key `/Mask` array makes every pixel whose raw samples all lie in its ranges transparent. With alpha the PNG is grey + alpha or RGBA (an Indexed picture expanded from its palette), 8-bit, or 16-bit when the picture is. Any other mask — a stencil `/Mask` stream, a soft mask of another size, with `/Matte`, or not decodable — leaves the picture without alpha and returns `masked: true`.

## See also

- [docs/api/README.md](../../README.md) — full module index + `exports` boundary note
- [`oconvPdfTextExtract`](./text-extract.md) — places the pictures this module writes (`opts.images`)
- [`oconvPdfToIr`](../pdf-to-ir.md) — `opts.include: ['images']`
- [loss matrix](../../../loss-matrix.md)
