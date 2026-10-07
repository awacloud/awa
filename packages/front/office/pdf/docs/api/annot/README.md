# Annotations — ISO 32000-2 §12.5

Interactive annotation layer: a generic dispatcher plus one typer per
subtype.

| Module | Returns | Deps | Description |
|--------|---------|------|-------------|
| [`pdfAnnot`](./annot.md) | `{ BASE_KEYS, typeBaseAnnot, captureExtras, typeAnnot }` | `pdfErrors`, `pdfParser` | Dispatcher §12.5.2. |
| [`pdfTextAnnot`](./text.md) | `{ typeTextAnnot }` | `pdfErrors`, `pdfParser`, `pdfAnnot` | Sticky note §12.5.6.4. |
| [`pdfLinkAnnot`](./link.md) | `{ typeLinkAnnot }` | `pdfErrors`, `pdfParser`, `pdfAnnot` | Hyperlink §12.5.6.5. |
| [`pdfMarkupAnnot`](./markup.md) | `{ typeMarkupAnnot }` | `pdfErrors`, `pdfParser`, `pdfAnnot` | Highlight/Underline/… §12.5.6.10. |
| [`pdfShapeAnnot`](./square.md) | `{ typeShapeAnnot }` | `pdfErrors`, `pdfParser`, `pdfAnnot` | Line/Square/Circle/Polygon §12.5.6.7–9. |
| [`pdfFreeTextAnnot`](./freeText.md) | `{ typeFreeTextAnnot }` | `pdfErrors`, `pdfParser`, `pdfAnnot` | Free text §12.5.6.6. |
| [`pdfInkAnnot`](./ink.md) | `{ typeInkAnnot }` | `pdfErrors`, `pdfParser`, `pdfAnnot` | Freehand ink §12.5.6.13. |
| [`pdfStampAnnot`](./stamp.md) | `{ typeStampAnnot }` | `pdfErrors`, `pdfParser`, `pdfAnnot` | Rubber stamp §12.5.6.12. |
| [`pdfFileAttachAnnot`](./fileAttach.md) | `{ typeFileAttachAnnot }` | `pdfErrors`, `pdfParser`, `pdfAnnot` | File attachment §12.5.6.15. |
| [`pdfWidgetAnnot`](./widget.md) | `{ typeWidgetAnnot }` | `pdfErrors`, `pdfParser`, `pdfAnnot` | Form widget §12.5.6.19. |
| [`pdfPopupAnnot`](./popup.md) | `{ typePopupAnnot }` | `pdfErrors`, `pdfParser`, `pdfAnnot` | Pop-up §12.5.6.14. |
| [`pdfProjectionAnnot`](./projection.md) | `{ typeProjectionAnnot }` | `pdfErrors`, `pdfParser`, `pdfAnnot` | 3D measurement §12.5.6.23. |
| [`pdfRedactAnnot`](./redact.md) | `{ typeRedactAnnot }` | `pdfErrors`, `pdfParser`, `pdfAnnot` | Redaction (ISO TS 32005). |

## Common pattern

`typeAnnot` takes a second argument — a **typers map** wiring each subtype
family to its specialised typer. Omit it and every subtype falls back to
base typing (`typeBaseAnnot` plus a full `_extras` capture).

```js
const annot = runtime.resolve('pdfAnnot');
const typers = {
    Text:           runtime.resolve('pdfTextAnnot').typeTextAnnot,
    Link:           runtime.resolve('pdfLinkAnnot').typeLinkAnnot,
    Markup:         runtime.resolve('pdfMarkupAnnot').typeMarkupAnnot,
    Shape:          runtime.resolve('pdfShapeAnnot').typeShapeAnnot,
    FreeText:       runtime.resolve('pdfFreeTextAnnot').typeFreeTextAnnot,
    Ink:            runtime.resolve('pdfInkAnnot').typeInkAnnot,
    Stamp:          runtime.resolve('pdfStampAnnot').typeStampAnnot,
    Popup:          runtime.resolve('pdfPopupAnnot').typePopupAnnot,
    FileAttachment: runtime.resolve('pdfFileAttachAnnot').typeFileAttachAnnot,
    Widget:         runtime.resolve('pdfWidgetAnnot').typeWidgetAnnot,
    Redact:         runtime.resolve('pdfRedactAnnot').typeRedactAnnot,
    Projection:     runtime.resolve('pdfProjectionAnnot').typeProjectionAnnot
};
for (const ref of page.annots) {
    const a = annot.typeAnnot(doc._raw.resolve(ref), typers);
    switch (a.kind) { /* … */ }
}
```

## See also

- [Document layer](../document/README.md) — `pdfPage.annots`.
- [Form](../form/README.md) — `/Widget` is a special case.
