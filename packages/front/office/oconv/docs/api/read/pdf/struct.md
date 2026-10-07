---
module: oconvPdfStruct
category: oconv/read/pdf
dependencies: [pdfStructTree]
returns: object
worker-safe: true
status: complete
---

# oconvPdfStruct

> Tagged-PDF structure reader — the tier-1 pdf reader's fast-path detector.

**Module** `oconvPdfStruct` (`oconvPdfStruct`) | **Source** `packages/front/office/oconv/src/read/pdf/struct.js` | **Deps** `pdfStructTree` | **Worker-safe** yes

Inspects the document catalog for a `/StructTreeRoot` and, when present, walks the logical structure tree via `pdfStructTree.typeStructTreeRoot`, flattening it into a reading-order list of struct elements each carrying its tag (`/S`), the marked-content ids of its own content, and the page index its content lives on.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const { readStructure } = runtime.resolve('oconvPdfStruct');
```

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `readStructure` | `(readResult: object, resolve: (ref) => object) => null \| {order: {tag: string\|null, mcids: number[], pageIndex: number}[]}` | `null` for an untagged (or malformed) document; otherwise the flattened, reading-order struct element list | — |

## Examples

### Detect a tagged vs. untagged document

```js
const pdf = runtime.resolve('pdf');

const untagged = pdf.read(untaggedBytes);
readStructure(untagged, untagged._raw.resolve);
// null — no /StructTreeRoot

const tagged = pdf.read(taggedBytes);
const structure = readStructure(tagged, tagged._raw.resolve);
structure.order[0];
// { tag: 'H1', mcids: [0], pageIndex: 0 }
```

## Notes

- Returns `null` for an untagged document (no `/StructTreeRoot`) or a malformed one — only a successful, well-typed tree activates `oconvPdfToIr`'s tagged fast path; the reader falls back to content-stream-order text positioning otherwise.
- `order` is depth-first over the struct tree; each element's `pageIndex` is inherited from its nearest ancestor's `/Pg` when the element itself carries none.
- A struct element's `mcids` come from its own `/K` entries that are plain marked-content-reference integers/dicts; a `/K` entry that is itself a struct element is recursed into as a child, never folded into the parent's own `mcids`.

## See also

- [docs/api/README.md](../../README.md) — full module index + `exports` boundary note
- [`oconvPdfTextExtract`](./text-extract.md) — supplies the text this module's `mcid`s key into
- [`oconvPdfToIr`](../pdf-to-ir.md) — the reader composing the pdf pipeline
- [loss matrix](../../../loss-matrix.md)
