# Form — ISO 32000-2 §12.7 / §12.5.5

Interactive forms (AcroForm) layer: root dict typing, field-tree walk, typing by `/FT`, and `/AP` appearance streams.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [`pdfAcroForm`](./acroform.md) | `{ typeAcroForm }` | `pdfErrors`, `pdfParser` | `/AcroForm` dict, §12.7.3. |
| [`pdfFieldTree`](./fieldTree.md) | `{ walkFieldTree, getInherited }` | `pdfErrors`, `pdfParser` | Walk + inheritance, §12.7.4. |
| [`pdfButtonField`](./button.md) | `{ typeButtonField }` | `pdfErrors`, `pdfParser` | `/FT /Btn`, §12.7.5.2. |
| [`pdfTextField`](./text.md) | `{ typeTextField }` | `pdfErrors`, `pdfParser` | `/FT /Tx`, §12.7.5.3. |
| [`pdfChoiceField`](./choice.md) | `{ typeChoiceField }` | `pdfErrors`, `pdfParser` | `/FT /Ch`, §12.7.5.4. |
| [`pdfSignatureField`](./signature.md) | `{ typeSignatureField }` | `pdfErrors`, `pdfParser` | `/FT /Sig`, §12.7.5.5. |
| [`pdfAppearance`](./appearance.md) | `{ typeAppearanceStreams, listPopulatedSlots }` | `pdfErrors`, `pdfParser` | `/AP`, §12.5.5. |

## Common pattern

```js
const af = runtime.resolve('pdfAcroForm').typeAcroForm(doc._raw.resolve(catalog.acroForm));
const records = runtime.resolve('pdfFieldTree').walkFieldTree(af.fields, doc._raw.resolve);
for (const r of records.filter(r => r.terminal)) {
    const ft = r.node.entries.FT && r.node.entries.FT.value;
    switch (ft) {
        case 'Btn': runtime.resolve('pdfButtonField').typeButtonField(r.node); break;
        case 'Tx':  runtime.resolve('pdfTextField').typeTextField(r.node);     break;
        case 'Ch':  runtime.resolve('pdfChoiceField').typeChoiceField(r.node); break;
        case 'Sig': runtime.resolve('pdfSignatureField').typeSignatureField(r.node); break;
    }
}
```

## See also

- [Document layer](../document/README.md) — `pdfCatalog` carries `/AcroForm`.
- [Content layer](../content/README.md) — `pdfContentStream` parses appearances.
- [Syntax layer](../syntax/README.md) — the underlying `pdfParser`.
