# Font — ISO 32000-2 §9.6 / §9.7 / §9.9

Typing of PDF Font dicts + `/Encoding` resolution + the embedding adapter. Parsing of the font files themselves (TrueType, Type1, CFF, CIDFont) is delegated to `@awacloud/fonts`.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [`pdfFont`](./font.md) | `{ typeFont, resolveDescendant }` | `pdfErrors`, `pdfParser` | Font dict, §9.6 / §9.7. |
| [`pdfFontEncoding`](./encoding.md) | `{ resolveEncoding }` | `pdfErrors` | `/Encoding`, §9.6.5. |
| [`pdfType3`](./type3.md) | `{ typeType3 }` | `pdfErrors`, `pdfParser` | PDF-specific Type 3, §9.6.4. |
| [`pdfFontEmbed`](./embed.md) | `{ embedSimple, embedCid }` | `pdfErrors`, `embedSubsetForPdf`, `embedFontDescriptor`, `embedCidSystemInfo`, `embedToUnicodeBuilder` | Write-side adapter, §9.9 / ISO TS 32001. |

## Common pattern

```js
const f = runtime.resolve('pdfFont');
const enc = runtime.resolve('pdfFontEncoding');
const font = f.typeFont(resources.Font.F1);
const table = enc.resolveEncoding(font.encoding, lookupNamed);
```

## See also

- [`pdfText`](../content/text.md) — `extractText` consumes `subtype` + ToUnicode.
- [`pdfResources`](../document/resources.md) — supplies the dicts.
- [Syntax layer](../syntax/README.md) — the underlying `pdfParser`.
