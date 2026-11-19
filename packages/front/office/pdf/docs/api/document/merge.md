---
module: pdfMerge
category: pdf/document
dependencies: [pdfErrors, pdfDocument, pdfPages, pdfWriter]
returns: object
worker-safe: true
status: complete
---

# pdfMerge

> Copy pages from several PDF documents into a new one.

**Module** `pdfMerge` | **Source** `packages/front/office/pdf/src/document/merge.js` | **Deps** `pdfErrors`, `pdfDocument`, `pdfPages`, `pdfWriter` | **Worker-safe** yes

## API

| Export | Signature | Description |
|---|---|---|
| `merge` | `(sources, opts?) => Uint8Array` | A new document of the chosen pages, in order. |

- A **source** is a `Uint8Array` (all its pages) or `{ bytes, pages }`: 0-based page indices, in the order wanted; a page given twice is copied twice.
- `opts.version` (`'x.y'`) is the written header's version; it defaults to the highest source version.

## Example

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/pdf';

const runtime = new ModuleRuntime();
runtime.registerAll([...fw_require, ...modules]);
const { merge } = runtime.resolve('pdfMerge');

// The whole of a.pdf, then pages 3 and 1 of b.pdf.
const bytes = merge([aBytes, { bytes: bBytes, pages: [2, 0] }]);
```

## Notes

- **A page** is copied with its dictionary and every object it reaches, renumbered; an object several copied pages of one source share (a font, an image) is written once. The inheritable attributes it lacks (`Resources`, `MediaBox`, `CropBox`, `Rotate`, ISO 32000 §7.7.3.4) are taken from its nearest ancestor that has them. A stream keeps its raw bytes and filters, its `/Length` made direct.
- **Not carried**: the sources' catalogs (outlines, structure trees, AcroForm, names) and Info dictionaries.
  - A page drops `/StructParents` and its `Widget` annotations (form fields need the AcroForm); an annotation drops `/StructParent`.
  - A reference to a source page that is not copied, to a `Pages` node or to the catalog becomes null in an array (a link destination) and is removed from a dictionary (an annotation's `/P`).
  - A reference to a copied page points to its first copy.
- The file is written by [`pdfWriter`](./writer.md), unencrypted, with a classical cross-reference table.

## Errors

| Code | Class | When |
|---|---|---|
| `pdf/merge/bad-sources` | `ContractError` | `sources` is not a non-empty array of `Uint8Array` or `{ bytes, pages? }` (`pages` an array). |
| `pdf/merge/bad-page` | `ContractError` | A page index is not one of its source's. |
| `pdf/merge/encrypted-source` | `ContractError` | A source is encrypted (one the empty password opens): its pages would be written unencrypted. |
| `readDocument`'s | — | A source does not read: an encrypted one that needs a password (`ParseError` `pdf/document/encrypted`), a malformed one (`ParseError`). |

## See also

- [`pdfDocument`](./document.md) — reads each source
- [`pdfWriter`](./writer.md) — writes the result
