---
module: transitional
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# transitional

> ECMA-376 part 4 — conversion between the Transitional and Strict namespace forms, and the Transitional-only element list.

**Module** `transitional` | **Source** `packages/front/office/ooxml/src/extra/transitional.js` | **Deps** `xml` | **Worker-safe** yes

Converts between the *Transitional* namespace URIs (`http://schemas.openxmlformats.org/…`), which Office writes by default and which this package's writers emit, and the *Strict* URIs (`http://purl.oclc.org/ooxml/…`), an opt-in save format, for wordprocessingml, spreadsheetml, presentationml and drawingml (the 4 `NS_MAP` entries). It lists 49 Transitional-only elements (46 `deprecated`, 3 `namespace-only`; `w:embedSystemFonts`, `w:doNotEmbedSystemFonts`, …) and converts them to and from their Strict form. The core never calls it: the docx reader matches the `w:` prefix without consulting the namespace URI, and registering the module with `docx.use()` changes neither `read()` nor `write()` because it declares no `hydrate*` / `dehydrate*` hook — call `toStrict` / `fromStrict` (or the element-level converters) on a tree yourself.

## Resolve

```js
const ext = transitional.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `toStrict` / `fromStrict` | `(node) => XmlNode` | recursive `xmlns*` attribute rewriter (transitional URI ↔ strict URI), non-destructive (returns a new tree) |
| `transitionalToStrict` / `strictToTransitional` | `(el) => XmlNode\|null` | typed element-level converter — `null` for a `deprecated` element, `toStrict(el)`/`fromStrict(el)` for `namespace-only`, passthrough otherwise |
| `buildTransitional` | `(name, attrs?, children?) => xmlNode` | re-emit a transitional element by name (used by tests / legacy round-tripper) |
| `isTransitionalOnly` | `(name) => boolean` | `true` when `name` is a known `deprecated` transitional element |
| `NS_MAP` | `Object<string,string>` | the 4 namespace URIs (transitional → strict) |
| `TRANSITIONAL_ELEMENTS` | `{name, kind, strict?}[]` | the 49 known Transitional-only elements (46 `deprecated`, 3 `namespace-only`; the `kind` type also admits `'element-rename'`, `'attribute-rename'` and `'value-enum'`, unused by the current list) |

Unlike the module's own name suggests, `toStrict`/`fromStrict` return a **new** tree (they do not mutate `node` in place).

## Notes

- Most `TRANSITIONAL_ELEMENTS` entries are `kind: 'deprecated'` — `transitionalToStrict` drops them (returns `null`); only `w:trackChange`, `w:document` and `w:body` are `namespace-only` and get namespace-rewritten instead.
- `isTransitionalOnly` only returns `true` for `kind: 'deprecated'` entries, not for `namespace-only` ones.

## See also

- [legacy-vml](./legacy-vml.md) — VML support is part 4 too
- [wml-vml-legacy](./wml-vml-legacy.md)
