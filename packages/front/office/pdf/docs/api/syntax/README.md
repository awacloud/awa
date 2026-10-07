# Syntax — ISO 32000-2 §7.2–§7.5

Binary layer: `Uint8Array` → tokens → typed objects → xref table → trailer.

| Module | Returns | Deps | Description |
|--------|---------|------|-------------|
| [`pdfTokenizer`](./tokenizer.md) | `{ tokenize, lastIndexOfBytes }` | `pdfErrors`, `pdfShared` | Lexer §7.2. |
| [`pdfParserObj`](./parser-obj.md) | `{ obj, getEntry, isType }` | none | Typed-object builders and reflection helpers. |
| [`pdfParser`](./parser.md) | `{ tokenize, parseObject, parseIndirect, parseFromBytes, parseIndirectFromBytes, parserLimits, setParserLimits, obj, getEntry, isType }` | `pdfErrors`, `pdfParserObj`, `pdfTokenizer` | Typed objects §7.3. |
| [`pdfXref`](./xref.md) | `{ locateStartXref, readStartXref, parseXrefTable, parseTrailerDict, readXrefStreamDict, buildXrefStream }` | `pdfErrors`, `pdfTokenizer`, `pdfParser` | Classical table §7.5.4. |
| [`pdfTrailer`](./trailer.md) | `{ typeTrailer }` | `pdfErrors`, `pdfParserObj` | Typed trailer §7.5.5. |
| [`pdfSerializer`](./serializer.md) | `{ serializeObject, serializeIndirect, formatReal }` | `pdfErrors` | Object emission §7.3. |
| [`pdfObjStream`](./objStream.md) | `{ parseObjectStream }` | `pdfErrors`, `pdfParserObj`, `pdfTokenizer`, `pdfParser` | Object streams §7.5.7. |
| [`pdfCrossRefStream`](./crossRefStream.md) | `{ parseCrossRefStream }` | `pdfErrors`, `pdfParserObj` | Cross-reference streams §7.5.8. |
| [Filters](./filters/README.md) | `{ decode, encode }` × 4 + dispatch | `pdfErrors`, `zlib` | The `/Filter` chain §7.4. |

## Common pattern

```js
const tokMod = runtime.resolve('pdfTokenizer');
const tok = tokMod.tokenize(bytes);
let t;
while ((t = tok.next())) { /* … */ }
```

## See also

- [Document layer](../document/README.md)
- [Read pipeline](../../guide/read-pdf.md)
