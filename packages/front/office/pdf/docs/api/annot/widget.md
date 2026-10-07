---
module: pdfWidgetAnnot
category: pdf/annot
dependencies: [pdfErrors, pdfParser, pdfAnnot]
returns: object
worker-safe: true
status: complete
---

# pdfWidgetAnnot

> Widget annotation (form field visual) — ISO 32000-2 §12.5.6.19.

**Module** `pdfWidgetAnnot` | **Source** `packages/front/office/pdf/src/annot/widget.js` | **Deps** `pdfErrors`, `pdfParser`, `pdfAnnot` | **Worker-safe** yes

Subtype `/Widget`: the visual half of an AcroForm field (§12.7), frequently
merged into the field dictionary itself. Subtype-specific entries: `/H`
(highlight mode), `/MK` (appearance characteristics —
`BC`/`BG`/`CA`/`R`/`IF`/`I`/`RI`/`IX`/`TP`), `/A` and `/AA` (action plus trigger
events) and `/Parent` (link back into the field tree). `/BS` belongs to the base
record.

## Resolve

```js
const w = runtime.resolve('pdfWidgetAnnot');
// Returns: { typeWidgetAnnot }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeWidgetAnnot` | `(dict) => WidgetAnnot` | Base record plus `h`, `mk`, `action`, `aa`, `parent`. |

`/A` is surfaced as `action` (only when it is a dictionary); `parent` is
`{ num, gen }` when `/Parent` is an indirect reference, `null` otherwise.

## Examples

### Visual rendering of a text field

```js
const w = runtime.resolve('pdfWidgetAnnot').typeWidgetAnnot(dict);
w.mk?.entries.BC;       // border colour
w.mk?.entries.BG;       // background colour
w.h;                    // 'I' (invert) | 'N' | 'O' | 'P' | 'T'
```

### Action triggers

```js
w.aa?.entries.K;        // keystroke action
w.aa?.entries.V;        // validate action
w.aa?.entries.F;        // format action
w.action;               // /A — activation action dictionary
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/annot/widget/bad-subtype` | `ParseError` | `/Subtype` present and not `/Widget`. |

## See also

- [`pdfAnnot`](./annot.md)
- [`pdfAcroForm`](../form/acroform.md) · [`pdfFieldTree`](../form/fieldTree.md)
- [`pdfAction`](../action/action.md)
