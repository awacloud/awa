# Document — ISO 32000-2 §7.7

Typed document layer — Catalog, page tree, Page, read orchestrator, writers.

| Module | Returns | Deps | Description |
|--------|---------|------|-------------|
| [`pdfCatalog`](./catalog.md) | `{ typeCatalog }` | `pdfErrors`, `pdfParser` | §7.7.2 — Catalog. |
| [`pdfPages`](./pages.md) | `{ walkPageTree, readPageCount }` | `pdfErrors`, `pdfParser` | §7.7.3 — page-tree walker. |
| [`pdfPage`](./page.md) | `{ typePage }` | `pdfErrors`, `pdfParser` | §7.7.3.3 — typed Page. |
| [`pdfDocument`](./document.md) | `{ readDocument, readHeader }` | `pdfErrors`, `pdfTokenizer`, `pdfParser`, `pdfXref`, `pdfTrailer`, `pdfCatalog`, `pdfPage`, `pdfPages`, `pdfCrossRefStream`, `pdfObjStream`, `pdfFilterDispatch` | Top-level read orchestrator (classic tables, cross-reference streams, object streams, hybrid files). |
| [`pdfResources`](./resources.md) | `{ typeResources, resolvePageResources, lookupResource }` | `pdfErrors`, `pdfParser` | §7.8.3 — inheritable `/Resources`. |
| [`pdfWriter`](./writer.md) | `{ writeDocument, assembleIndirects }` | `pdfErrors`, `pdfSerializer` | Model → bytes §7.5.2–7.5.5. |
| [`pdfBuilder`](./builder.md) | `{ builder }` | `pdfErrors`, `pdfParserObj`, `pdfWriter` | Chainable constructive DSL over `pdfWriter`. |
| [`pdfIncrementalWriter`](./incrementalWriter.md) | `{ appendIncremental, appendIncrementalWithOffsets, readBaseTrailer }` | `pdfErrors`, `pdfSerializer`, `pdfTokenizer`, `pdfParser`, `pdfXref`, `pdfTrailer` | §7.5.6 — append-only incremental update. |
| [`pdfEncryptedWriter`](./encryptedWriter.md) | `{ writeEncryptedDocument }` | `pdfErrors`, `pdfWriter`, `pdfStandardV5`, `pdfStandardV6`, `pdfStandardV4`, `pdfAesGcm` | Wraps `pdfWriter` with the Standard Security Handlers. |
| [`pdfXrefStreamWriter`](./xrefStreamWriter.md) | `{ writeXrefStreamDocument }` | `pdfErrors`, `pdfSerializer`, `pdfFlate` | §7.5.8 — xref-stream + ObjStm alternative emitter. |

## Common pattern

```js
const doc = runtime.resolve('pdfDocument').readDocument(bytes);
doc.pages.forEach(p => console.log(p.mediaBox));
```

## See also

- [Syntax layer](../syntax/README.md)
- [Top-level `pdf`](../pdf.md)
- [Read pipeline](../../guide/read-pdf.md)
