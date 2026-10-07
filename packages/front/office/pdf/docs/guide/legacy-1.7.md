# Reading legacy PDF 1.7

`@awacloud/pdf` targets **ISO 32000-2:2020 (PDF 2.0)** for writing. On **read**, `%PDF-1.x` headers produced by any ISO 32000-1:2008-conformant tool are accepted. This guide states what the core reader does with a 1.x file; the legacy-only constructs (XFA, RC4, LZW, CCITT fax, Sound/Movie) are read by the `pdf-legacy` bundle's extras — see [Coverage](./coverage.md#pdf-17-read-tolerance).

**Prerequisites** — the package `@awacloud/pdf` (root entry
`@awacloud/pdf`, or the committed `@awacloud/pdf/standalone/*` build) and its
`@awacloud/fw` / `@awacloud/fonts` dependencies; any modern JavaScript runtime
(browser main thread or Worker, Bun, Node.js 18+).

## Behaviour

`readHeader(bytes)` does not constrain the `x.y` suffix value:

```js
api.header(bytes);
// → { version: '1.7', end: 9 }
// → { version: '1.4', end: 9 }
// → { version: '2.0', end: 9 }
```

Whatever version is exposed in `doc.version` is the raw string found in the header (`'1.7'`, `'2.0'`, …). No normalization is applied.

## Guarantees

- Headers `%PDF-1.0` through `%PDF-2.0` are all accepted.
- The header may be preceded by up to 1024 bytes of binary junk (§7.5.2 tolerance).
- Classical xref works identically across 1.x and 2.0.
- 2.0-exclusive constructs (associated files, document parts, extended namespaces) are preserved in `_extras` when read from a 1.x file, without erroring.

## Cross-reference forms across 1.x and 2.0

`pdfDocument.readDocument` (the code path behind `api.read(bytes)`) walks every cross-reference section in the `/Prev` chain and picks its form from the bytes it finds: an `xref` keyword takes the classical table path (`pdfXref.parseXrefTable`), anything else is parsed as a `/Type /XRef` cross-reference stream (§7.5.8) through `pdfCrossRefStream`. A PDF 1.5+ file that uses **only** cross-reference streams therefore opens through `api.read(bytes)`, and so do mixed chains — a classical incremental section stacked on an xref-stream base, or an xref stream stacked on a classical base.

Objects stored inside a `/Type /ObjStm` container (§7.5.7) are materialised on demand through `pdfObjStream`: `doc._raw.resolve(ref)` returns them like any other indirect, and each container is decoded once per document. A hybrid file (classical xref table plus a `/XRefStm` pointer, the common PDF 1.5+ producer output) has its companion stream merged too; entries the classical table itself provides take precedence.

**Not supported.** Object streams inside an **encrypted** document stay out of the default pipeline: `readDocument`'s `resolveCompressed` throws `pdf/document/objstm-encrypted` because no decrypt path is composed for it (`resolveCompressed` in `src/document/document.js`).

## See also

- [Coverage](./coverage.md)
- [`pdfDocument`](../api/document/document.md)
- [`pdfXref`](../api/syntax/xref.md)
