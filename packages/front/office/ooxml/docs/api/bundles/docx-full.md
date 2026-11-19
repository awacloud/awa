---
module: docxFullBundle
category: bundles
dependencies: [docxLargeBundle, wmlVmlLegacy, dmlShapesAdvanced, transitional, legacyVml, wmlMisc, mathMisc, dmlMainMisc, wmlStyleDetails, wmlDocumentDetails]
returns: object
worker-safe: true
status: complete
---

# docxFullBundle

> Pre-wired bundle: `docx-large` + two extras that type a read (the styles' and numbering's details; the body's, sections' and settings') + further toolkits (VML, custom geometry, transitional mapping, long-tail catalogues).

**Module** `docxFullBundle` | **Source** `packages/front/office/ooxml/src/bundles/docx-full.js` | **Deps** `docxLargeBundle` + 9 extras | **Worker-safe** yes

It adds the styles', numbering's, body's, sections' and settings' details to what a read types, and toolkits for the long tail and the Office 2003 / VML material; what a read does not type stays verbatim.

## Included

Everything in [`docx-large`](./docx-large.md) — its extras that type a read and its toolkits — plus:

**Types a read** — its walker hooks run on every `read()` (hydrate) and `write()` (dehydrate):

- [`wmlDocumentDetails`](../extra/wml-document-details.md) — shading, paragraph borders, property changes, a paragraph's section, a section's grid / columns / numbering, `mathPr`, the remaining settings toggles (in `_extras` through `docx-large`)
- [`wmlStyleDetails`](../extra/wml-style-details.md) — a style's flags and names, `tblStylePr`, `latentStyles`; the numbering's `nsid`, `tmpl`, a level's `suff`, `pStyle`, `isLgl`, `legacy`, … (in `_extras` through `docx-large`)

**Toolkits** — parse / render functions one calls on raw nodes; a `read()` or `write()` never calls them, so they add no typed field by themselves:

- [`wmlVmlLegacy`](../extra/wml-vml-legacy.md) — `<w:pict>` / `<w:object>` / `<w:control>` / `<w:movie>`
- [`dmlShapesAdvanced`](../extra/dml-shapes-advanced.md) — custom-geometry paths
- [`transitional`](../extra/transitional.md) — ECMA-376 part 4 namespace mapping
- [`legacyVml`](../extra/legacy-vml.md) — standalone VML mapper
- [`wmlMisc`](../extra/wml-misc.md) — WML long-tail sweeper
- [`mathMisc`](../extra/math-misc.md) — OMML long-tail sweeper
- [`dmlMainMisc`](../extra/dml-main-misc.md) — DrawingML long-tail sweeper

## Resolve

```js
const word = runtime.resolve('docxFullBundle');
// Returns the same enriched `docx` instance `docxLargeBundle` produced,
// with the remaining extras layered on top.
```

## API

`docxFullBundle` is a pure fw factory descriptor that depends on `docxLargeBundle` plus every remaining docx-touching extra. The runtime resolves `docxLargeBundle` first (enriched `docx` instance), then the factory layers the P2 + misc extras on top via `.use(...)` and returns the same instance.

| Resolve key | Returns | Dependencies (auto-wired) |
|-------------|---------|---------------------------|
| `'docxFullBundle'` | enriched `docx` API | `docxLargeBundle` + `wmlVmlLegacy`, `dmlShapesAdvanced`, `transitional`, `legacyVml`, `wmlMisc`, `mathMisc`, `dmlMainMisc` |

## Examples

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras } from '@awacloud/ooxml';
import { docxLargeBundle } from '@awacloud/ooxml/bundles/docx-large';
import { docxFullBundle }  from '@awacloud/ooxml/bundles/docx-full';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);   // the @awacloud/fw modules the package consumes
runtime.registerAll(modules);
runtime.registerAll(extras);
runtime.register(docxLargeBundle);   // dependency of docxFullBundle
runtime.register(docxFullBundle);

const word = runtime.resolve('docxFullBundle');

// Read a legacy Office 2003 docx with VML drawings.
const bytes  = new Uint8Array(/* … */);
const result = word.read(bytes);

// Write back — `write` takes the DOCUMENT, not the read result.
const out = word.write(result.document, { styles: result.styles });
```

## Notes

- Bundle size impact: roughly 6× the core parser surface. Use `docx-large` if VML / part-4 are not needed.
- `transitional` is registered with the other extras but declares no `hydrate*` / `dehydrate*` hook, so it changes neither `read()` nor `write()`: no namespace is rewritten, and the typed extras see the element names of the input (the docx reader matches the `w:` prefix and ignores the namespace URI; the writers emit the Transitional URIs). To convert a tree between the Transitional and Strict forms, resolve [`transitional`](../extra/transitional.md) and call `toStrict` / `fromStrict`.
- `docxLargeBundle` must be registered too — it is a declared dependency of `docxFullBundle`, and the runtime resolves it before the full bundle's factory runs.

## Breaking change

The previous `buildDocxFull(docx, { xml, props })` imperative helper has been removed. Replace any call sites with the `ModuleRuntime` pattern shown above.

## See also

- [docx-large](./docx-large.md) — lighter alternative
- [transitional](../extra/transitional.md)
- [Read+write docx guide](../../guide/read-write-docx.md)
