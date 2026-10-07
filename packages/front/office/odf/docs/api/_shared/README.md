# `_shared/` — `odfShared` & `odfWalker`

Two worker-safe factories sit in `src/_shared/`. They consolidate
constants and helpers that were previously duplicated across the
package's orchestrators, sidecar modules, walkers and table modules
(see [`CHANGELOG.md`](../../../CHANGELOG.md) — "Shared-helper
deduplication").

## `odfShared`

- **Name** : `odfShared`
- **Dependencies** : `['odfErrors', 'xml']`
- **Source** : [`src/_shared/index.js`](../../../src/_shared/index.js)

### Exports

| Member                       | Kind     | Description |
|------------------------------|----------|-------------|
| `ODF_NS`                     | object   | Frozen map of ODF namespace URIs (`OFFICE`, `TEXT`, `STYLE`, `TABLE`, `DRAW`, `FO`, `SVG`, `NUMBER`, `OF`, `PRESENTATION`, `META`, `CONFIG`, `MANIFEST`, `DC`, `XLINK`, `CHART`, `MATH`, `FORM`, `SCRIPT`, `DR3D`, `ANIM`, `SMIL`, `DB`, `XHTML`). |
| `ODF_PREFIXES`               | object   | Frozen prefix → URI table the writers resolve on their own: every `ODF_NS` entry under its lower-case prefix (`office`, `text`, …, `of`, `dr3d`, `xhtml`), derived from `ODF_NS`, plus the extension prefixes LibreOffice declares on its roots — `ooo`, `ooow`, `oooc`, `rpt`, `dom`, `xforms`, `xsd`, `xsi`, `formx`, `grddl`, `css3t`, `loext`. Any other extension prefix (`officeooo`, `calcext`, …) is resolved from the source document's own declarations. |
| `sourceNamespaces(sourcePkg, partPath)` | function | Frozen `{ prefix: uri }` of the `xmlns:<prefix>` declarations on the ROOT element of `sourcePkg.parts[partPath]` (a read package model, e.g. `doc.package`). Only the root start tag is decoded and parsed; the default namespace (`xmlns="…"`) is ignored. Returns `{}` when the package, the part or the tag is missing or unparsable — never throws. |
| `declareNamespaces(rootEl, opts?)` | function | Declares on `rootEl` every namespace prefix used by an element or attribute name in its subtree. `opts = { carried?, part?, module? }`. `xml` is implicit; `xmlns` attributes are declarations, not uses; a prefix declared on a descendant counts for that descendant's subtree only. Resolution order: the root's own declarations → `opts.carried` → `ODF_PREFIXES`. The missing declarations are inserted, sorted by prefix, immediately after the root's last `xmlns:*` attribute (first when it has none); every existing attribute keeps its order, so a root with nothing missing serializes byte-identically. A `table:formula` / `text:formula` / `text:condition` value of the form `<prefix>:…` whose prefix resolves is declared too; an unresolvable value prefix is left alone. A used name prefix that resolves nowhere throws `RenderError('odf/render-error/namespace', 'odf: namespace prefix "<p>" is used but not declared')` with `context: { module, part, prefix }`. Replaces `rootEl.attrs` with a new object and returns `rootEl`. |
| `ODF_VERSION`                | string   | `'1.4'` — single source of truth for `office:version` / `manifest:version`. |
| `XML_DECL`                   | string   | `<?xml version="1.0" encoding="UTF-8"?>` |
| `XML_DECL_STANDALONE`        | string   | `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` |
| `CT.ODT` / `.ODS` / `.ODP` / `.XML` / `.FORMULA` | object | Frozen MIME-type table. |
| `encodeText(s)` / `decodeText(b)` | function | UTF-8 codec backed by singleton `TextEncoder` / `TextDecoder`. |
| `parseXmlOrThrow(src, part, context?)` | function | `xml.parse` wrapper that maps any parser error to `ParseError('odf/parse-error/<part>', …)`. |
| `readSidecars(target, pkgModel, sideMods)` | function | Read `meta.xml` / `settings.xml` / `styles.xml` parts into `target`. `sideMods = { metaMod, settingsMod, stylesMod }`. |
| `writeSidecars(p, doc, opts, sideMods, ctXml?)` | function | Write the three sidecar parts on a package. `sideMods = { pkg, metaMod, settingsMod, stylesMod }`. Each sidecar falls back `opts.*` → `doc.*` → `empty()`. `meta:generator` is set to `metaMod.empty().generator` (`@awacloud/odf`): a `doc.meta` generator (the previous application, from the read model) is replaced, an `opts.meta` without one is filled, an explicit `opts.meta.generator` is kept; the caller's meta object is never mutated. Forwards the source parts' namespace declarations: each serializer receives `{ namespaces: sourceNamespaces(doc.package, '<part>') }`. |
| `carryParts(p, source, mods)` | function | Re-emit into `p` the parts of a read package model (`source = doc.package`) that the writer did not regenerate, byte-for-byte, with the media type the source manifest declared (fallback `application/octet-stream`), then re-declare the source manifest's directory entries (`fullPath` ending in `/`). Precedence: a regenerated part always wins; a part already on `p` (writer-supplied, e.g. `doc.pictures`) wins over the carried copy; everything else is carried. `source` missing or without `parts` → no-op. `mods = { pkg, manifestMod }`. Returns `p`. To drop carried material, delete it from `doc.package.parts` or delete `doc.package`. |
| `REGENERATED_PARTS`          | array    | Frozen `['content.xml', 'meta.xml', 'settings.xml', 'styles.xml']` — the parts every orchestrator regenerates and `carryParts` never carries. |
| `findDeep(node, name)`       | function | DFS for an element node by qualified name. |
| `intAttr(el, name)`          | function | `parseInt` an attribute, returns `undefined` if missing / non-numeric. |
| `boundedIntAttr(el, name, opts?)` | function | Same as `intAttr` plus bounds check ; throws `ParseError('odf/parse-error/limit', …)` when the parsed value exceeds `opts.max`. |

### Worker-safety

Every export is either a frozen object, string literal or pure
function. The only mutable state is the singleton `TextEncoder` /
`TextDecoder` pair which is thread-safe on every host.

## `odfWalker`

- **Name** : `odfWalker`
- **Dependencies** : `[]`
- **Source** : [`src/_shared/walker.js`](../../../src/_shared/walker.js)

Generic implementation of the `.use(...)` extension registry, the
lazy hook index and the recursive node visitor. The three
format-specific wrappers (`odtWalker`, `odsWalker`, `odpWalker`)
delegate to `odfWalker.createWalker(config)` where `config` is :

```js
{
    rootField: 'body' | 'spreadsheet' | 'slides',
    recurseFields: ['children', 'body', 'rows', 'cells', ...],
    typeHooks: { paragraph: 'Paragraph', span: 'Span', ... },
    sidecars: ['meta', 'settings', 'styles']  // default
}
```

The returned walker exposes the historical API :

- `use(...exts)` — register zero or more extensions (idempotent,
  null-tolerant).
- `applyHydrate(result)` — traverse `result.<rootField>` and invoke
  `hydrate<Suffix>` hooks per node `type` ; then apply
  `hydrateMetadata` / `hydrateSettings` / `hydrateStyles` to the
  sidecars.
- `applyDehydrate(result)` — mirror of `applyHydrate` using the
  `dehydrate*` hook names.
- `hasExtensions` / `extensions` — registry inspection.

### Type → hook mapping

| Walker      | `rootField`    | `typeHooks` |
|-------------|----------------|-------------|
| `odtWalker` | `body`         | `paragraph` / `span` / `heading` / `list` / `table` / `cell` / `frame` |
| `odsWalker` | `spreadsheet`  | `paragraph` / `span` / `table` / `cell` / `frame` |
| `odpWalker` | `slides`       | `slide` / `paragraph` / `span` / `frame` |
