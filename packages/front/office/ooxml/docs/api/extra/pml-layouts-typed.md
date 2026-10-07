---
module: pmlLayoutsTyped
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# pmlLayoutsTyped

> PML — typed slide-layout descriptors (36 layout types).

**Module** `pmlLayoutsTyped` | **Source** `packages/front/office/ooxml/src/extra/pml-layouts-typed.js` | **Deps** `xml` | **Worker-safe** yes

Exposes the catalog of `<p:sldLayout type="…">` values (~36), a builder that scaffolds an empty layout part for a given type, and a typed parser surfacing the layout-level attributes (`type`, `preserve`, `userDrawn`, `showMasterSp`, `showMasterPhAnim`, `matchingName`) and the major children (`cSld`, `clrMapOvr`, `transition`, `timing`, `hf`).

## Resolve

```js
const ext = pmlLayoutsTyped.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseLayout` | `(text \| rootEl) => Layout` | `{ kind: 'sldLayout', type, preserve, userDrawn, showMasterSp, showMasterPhAnim, matchingName, cSld?, clrMapOvr?, transition?, timing?, hf? }` |
| `parseLayoutType` | `(text \| rootEl) => string` | just the `type` attribute (defaults to `'cust'`) |
| `parseClrMapOvr` | `(el) => ClrMapOvr` | `{ kind: 'clrMapOvr', masterClrMapping?: true, overrideClrMapping? }` |
| `buildLayout` | `({type?, name?, preserve?, userDrawn?, showMasterSp?, showMasterPhAnim?}) => string` | scaffolds an empty `<p:sldLayout>` part (serialized XML) |
| `LAYOUT_TYPES` | `string[]` | the 36 ECMA-376 layout type values |
| `PRIMARY_LAYOUT_TYPES` | `string[]` | the 18 commonly used layout kinds (text, two-column text, objects, table, chart, picture, diagram, media, section header, title-only, blank, custom, vertical text); `buildLayout` scaffolds each of them |

There is no `renderLayout` — this module only parses/builds; a full typed layout is not re-serialized from the `parseLayout` shape.

## Elements typed

`sldLayout` (root), `cSld` (sub-tree shared with core, kept `raw`), `clrMapOvr` (`masterClrMapping`, `overrideClrMapping`), `transition` (kept `raw`), `timing` (kept `raw`), `hf` (header/footer attrs).

## Roundtrip example

```js
pptx.use(pmlLayoutsTyped.factory(xml));
const layoutXml = ext.buildLayout({ type: 'twoObj', name: 'Two Content' });
const layout = ext.parseLayout(layoutXml);
layout.type; // 'twoObj'
```

## Notes

- Type values map 1-to-1 with PowerPoint's "Reset Layout" menu names.
- A custom layout has `type:'cust'` plus a `matchingName` string for identification.

## See also

- [pml-notes](./pml-notes.md)
