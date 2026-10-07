---
module: embedFontDescriptor
category: embed-pdf/fontDescriptor
dependencies: [fontErrors]
returns: object
worker-safe: true
status: complete
---

# embedFontDescriptor

> PDF FontDescriptor dict — `buildFontDescriptor(font, opts)`.

**Module** `embedFontDescriptor` | **Source** `packages/front/office/fonts/src/embed-pdf/fontDescriptor.js` | **Deps** `fontErrors` | **Worker-safe** yes

Builds the `FontDescriptor` dictionary (PDF 32000-1 §9.8) from a parsed `Font`: flags, ItalicAngle, Ascent, Descent, CapHeight, StemV, FontBBox, and `FontFile2` (TTF) or `FontFile3` (CFF).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `PDF_FONT_FLAG` | const | Flag bitfield `{ FIXED_PITCH, SERIF, SYMBOLIC, SCRIPT, NONSYMBOLIC, ITALIC, ALL_CAP, SMALL_CAP, FORCE_BOLD }`. |
| `buildFontDescriptor` | function | `(font, opts?) => DescriptorDict`. |
| `embedFontDescriptor` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { buildFontDescriptor, PDF_FONT_FLAG } = fw.runtime.resolve('embedFontDescriptor');
const desc = buildFontDescriptor(font, { subsetBytes: subset.subsetBytes, namePrefix: 'ABCDEF' });
```

## Notes

- Flags derived from `post.isFixedPitch` (FixedPitch), `os2.sFamilyClass` (Serif/Script/Symbolic, high byte of the class ID), `post.italicAngle` and `head.macStyle` bit 1 (Italic), `head.macStyle` bit 0 (ForceBold); Nonsymbolic is set whenever Symbolic isn't.
- `FontFile2` vs `FontFile3` is chosen via `opts.isCff` (defaults to `font.flavor === 'opentype'`) — not by scanning for a `CFF ` table.
- `opts.subsetBytes` is only attached to the output (`FontFile2`/`FontFile3`) when provided; the caller must supply it, `buildFontDescriptor` does not read `font.rawSfnt` for this.

## See also

- [subsetForPdf](./subsetForPdf.md)
