---
module: odfMeta
category: odf/meta
dependencies: [odfErrors, odfShared, xml]
returns: object
worker-safe: true
status: complete
---

# odfMeta

> Parse/render `meta.xml` — `<office:document-meta>` → `<office:meta>` (Dublin Core + ODF).

**Module** `odfMeta` | **Source** `packages/front/office/odf/src/meta/meta.js` | **Deps** `odfErrors`, `odfShared`, `xml` | **Worker-safe** yes

Model: `{ title?, creator?, date?, generator?, initialCreator?, creationDate?, _extras? }`.

## Resolve

```js
const meta = runtime.resolve('odfMeta');
// → { parse, serialize, empty, OFFICE_NS, META_NS, DC_NS }
```

## API

| Method | Description |
|--------|-------------|
| `parse(xmlString)` | Returns the model. Throws `ParseError` if the root is not `<office:document-meta>`. |
| `serialize(meta, opts?)` | XML with prolog + office/meta/dc namespaces. The root also declares every other namespace prefix the output uses (e.g. an `ooo:` child kept in `_extras`), resolved from `opts.namespaces` (a prefix → URI map — the orchestrators pass the source `meta.xml` root's declarations), then from `odfShared.ODF_PREFIXES`. A prefix none of them declares throws `RenderError('odf/render-error/namespace')`, `context: { module: 'meta', part: 'meta.xml', prefix }`. |
| `empty()` | Minimal model `{ generator: '@awacloud/odf' }`. |

## Examples

```js
meta.serialize({ title: 'Doc', creator: 'Alice', creationDate: '2026-05-13T10:00:00' });
```

## Notes

- Unrecognized children of `<office:meta>` are preserved in `_extras.children` and emitted verbatim.
- No date format validation — values are pass-through strings.

## See also

- [odt/odt](./odt/odt.md)
