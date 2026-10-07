---
module: pdfAnnot
category: pdf/annot
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfAnnot

> Annotation orchestrator — ISO 32000-2 §12.5, dispatch on `/Subtype`.

**Module** `pdfAnnot` | **Source** `packages/front/office/pdf/src/annot/annot.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

`typeAnnot` reads a `/Type /Annot` dictionary (§12.5.2 Table 166) and delegates
to a specialised typer selected by `/Subtype`: `Text`, `Link`, `FreeText`,
`Line`/`Square`/`Circle`/`Polygon`/`PolyLine`,
`Highlight`/`Underline`/`Squiggly`/`StrikeOut`/`Caret`, `Stamp`, `Ink`, `Popup`,
`FileAttachment`, `Widget`, `Redact`, `Projection`. Those delegates are supplied
by the caller through the second `typers` argument — when it is missing, or when
the relevant slot is not a function, the subtype falls back to base typing plus a
full `_extras` capture. The known-but-unhandled subtypes (`Sound`, `Movie`,
`Screen`, `PrinterMark`, `TrapNet`, `Watermark`, `3D`, `RichMedia`) always take
that fallback; any other name returns `{ kind, raw, _extras }` with every
dictionary entry copied into `_extras`.

`typeBaseAnnot` factors out the entries common to every annotation (`/Rect`,
`/Contents`, `/P`, `/NM`, `/M`, `/F`, `/AP`, `/AS`, `/Border`, `/C`,
`/StructParent`, `/OC`, `/AF`, `/CA`, `/BS`, `/BE`) — exactly the names held by
the exported `BASE_KEYS` set, plus `/Type` and `/Subtype`.

## Resolve

```js
const annot = runtime.resolve('pdfAnnot');
// Returns: { BASE_KEYS, typeBaseAnnot, captureExtras, typeAnnot }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `BASE_KEYS` | `Set<string>` | The 18 base `/Type /Annot` keys consumed by `typeBaseAnnot`. |
| `typeBaseAnnot` | `(dict) => BaseAnnot` | §12.5.2 entries only. |
| `captureExtras` | `(target, dict, known) => void` | Copies every entry outside `BASE_KEYS` and outside the optional `known` set into `target._extras`. Used by every subtype typer. |
| `typeAnnot` | `(dict, typers?) => Annotation` | Typed record carrying `kind`, derived from `/Subtype`. |

### The `typers` map

Keys are typer *families*, not subtype names — `Shape` covers
`Line`/`Square`/`Circle`/`Polygon`/`PolyLine`, `Markup` covers
`Highlight`/`Underline`/`Squiggly`/`StrikeOut`/`Caret`, and both receive the
expected subtype as a second argument:

```js
{ Text, Link, FreeText, Shape, Markup, Stamp, Ink, Popup,
  FileAttachment, Widget, Redact, Projection }
```

### `BaseAnnot` shape

```js
{
    subtype, rect: [llx,lly,urx,ury]|null, contents, p: {num,gen}|null,
    nm, m, f: number,          // /F flags (bit 1 Invisible, 2 Hidden, …)
    ap, as, border, c,         // /AP /AS /Border /C
    structParent, oc, af, ca,
    bs, be, raw, _extras
}
```

## Examples

### Dispatch an annotation

```js
const annot = runtime.resolve('pdfAnnot');
const typers = { Text: runtime.resolve('pdfTextAnnot').typeTextAnnot };
for (const ref of page.annots) {
    const a = annot.typeAnnot(doc._raw.resolve(ref), typers);
    a.kind;     // 'Text' | 'Link' | 'Highlight' | …
}
```

### Base typing only

```js
const base = annot.typeBaseAnnot(dict);
base.rect;     // [llx, lly, urx, ury]
base.f & 0x02; // Hidden flag
```

### Unknown subtype

```js
const a = annot.typeAnnot(weirdDict);
a.kind === 'CustomVendor';  // preserved; _extras holds every entry
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/annot/not-dict` | `ParseError` | Argument is not a dictionary. |
| `pdf/annot/bad-type` | `ParseError` | `/Type` present but not `/Annot`. |
| `pdf/annot/missing-subtype` | `ParseError` | `/Subtype` missing or not a name (`typeAnnot` only). |

## See also

- [`pdfTextAnnot`](./text.md) · [`pdfLinkAnnot`](./link.md) · [`pdfMarkupAnnot`](./markup.md) · [`pdfShapeAnnot`](./square.md)
- [`pdfFreeTextAnnot`](./freeText.md) · [`pdfInkAnnot`](./ink.md) · [`pdfStampAnnot`](./stamp.md) · [`pdfFileAttachAnnot`](./fileAttach.md)
- [`pdfWidgetAnnot`](./widget.md) · [`pdfPopupAnnot`](./popup.md) · [`pdfProjectionAnnot`](./projection.md) · [`pdfRedactAnnot`](./redact.md)
- [`pdfPage`](../document/page.md)
