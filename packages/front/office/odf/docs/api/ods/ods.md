---
module: ods
category: odf/ods
dependencies: [odfErrors, odfShared, pkgPackage, xml, pkgMimetype, pkgManifest, odfMeta, odfSettings, odfStyles, spreadsheet, styleAutomatic, tableTable, tableRow, tableCell, textParagraph, odsWalker]
returns: object
worker-safe: true
status: complete
---

# ods

> Top-level reader/writer for `.ods` (OpenDocument Spreadsheet).

**Module** `ods` | **Source** `packages/front/office/odf/src/ods/ods.js` | **Deps** see frontmatter | **Worker-safe** yes

## Resolve

```js
const ods = runtime.resolve('ods');
// → { read, write, empty, sheet, fromArrays, cell, toText, CT_ODS, use, hasExtensions }
```

## API

| Method | Description |
|---------|-------------|
| `read(bytes, opts?)` | Parses a `.ods` into `{ mimetype, spreadsheet, … }`. `opts` (optional) is forwarded to [`pkgPackage.read`](../pkg/package.md): `{ maxParts?, maxUncompressed?, maxRatio? }` — the ZIP-bomb caps (defaults 4096 entries, 256 MiB total, ratio 200 per entry; `0` disables one); a breach throws `ParseError('odf/parse-error/zip-bomb')`. |
| `write(doc, opts?)` | Writes a typed document. `opts: { meta, settings, styles }`. Re-emits the `doc.package` parts the writer does not regenerate (everything but `content.xml`, `meta.xml`, `settings.xml`, `styles.xml`) byte-for-byte with their source manifest media types, plus the source manifest's directory entries, and writes `doc.styles` / `doc.settings` / `doc.meta` unless `opts.*` overrides. `meta:generator` is rewritten to `@awacloud/odf` unless `opts.meta.generator` is given. Precedence: regenerated part, then writer-supplied part, then the carried copy; delete from `doc.package.parts` (or delete `doc.package`) to drop carried material. |
| `empty()` | Document with one empty `Sheet1` sheet. |
| `sheet(name, rows)` | Builds `{ type: 'table', name, rows }` from a 2-D array. |
| `fromArrays([{name, rows}…])` | Multi-sheet document. |
| `cell(value, opts?)` | Creates a typed cell (`float`/`string`/`boolean`/`date`). |
| `toText(doc)` | Concatenated text; tab between cells, `\n` between rows. |
| `use(...exts)` | Registers extensions on the underlying `odsWalker` — returns the API for chaining. |
| `hasExtensions` | `true` once any extension is registered. |

## Examples

```js
const doc = {
    spreadsheet: { tables: [ ods.sheet('Numbers', [[1, 2], [3, 4]]) ] }
};
const bytes = ods.write(doc);
const back = ods.read(bytes);
back.spreadsheet.tables[0].rows[0].cells[0].value; // '1'
```

## Notes

- mimetype: `application/vnd.oasis.opendocument.spreadsheet`.
- Formulas: keep the `of:=` namespace prefix in `cell.formula`.

## See also

- [ods/spreadsheet](./spreadsheet.md)
- [table/cell](../table/cell.md)
- [ods/ods-walker](./ods-walker.md)
