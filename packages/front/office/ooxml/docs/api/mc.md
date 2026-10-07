---
module: markupCompatibility
category: ooxml/mc
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# markupCompatibility

> Markup Compatibility (ECMA-376 part 3) — resolves `mc:AlternateContent`, `mc:Ignorable`, `mc:ProcessContent`.

**Module** `markupCompatibility` | **Source** `packages/front/office/ooxml/src/mc/markupCompatibility.js` | **Deps** `xml` | **Worker-safe** yes

Without MC, a strict parser breaks on every modern `.docx`/`.xlsx`/`.pptx` (the `w14`/`w15`/`x14`/`p14` extensions are everywhere). Three constructs: `mc:AlternateContent` (conditional selection), `mc:Ignorable` (droppable prefixes), `mc:ProcessContent` (drop the wrapper, keep the content). The module works by **in-place mutation**; the returned tree is free of `mc:*`.

## Resolve

```js
const mc = runtime.resolve('markupCompatibility');
// Returns: { process, wrapAlternateContent, setIgnorable, MC_NS }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `process` | `(root: element, options?) => element` | The same `root`, with `mc:*` resolved. |
| `wrapAlternateContent` | `({ choices, fallback }) => element` | `<mc:AlternateContent>` builder. |
| `setIgnorable` | `(rootEl, prefixes: string\|string[]) => rootEl` | Sets `xmlns:mc` + `mc:Ignorable`. |
| `MC_NS` | string constant | The MC 2006 namespace. |

### `process` options

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `supportedPrefixes` | `string[]` | `[]` | Prefixes the caller "understands". An `mc:Choice` wins when **all** of its Requires are supported. |
| `preserveAlternateContent` | `boolean` | `false` | When `true`, leaves `mc:AlternateContent` untouched (only `mc:Ignorable` is stripped). |
| `keepElements` | `string[]` | `[]` | Qualified element names (`prefix:localName`) that survive even when their prefix is ignorable, together with their whole subtree: attributes and descendants are kept, no ignorable-prefix dropping happens inside. `mc:AlternateContent` and `mc:*` attributes inside are still resolved. Every other element of the same prefix is dropped as usual. Matching is by prefix, like the rest of this module: a document binding the same namespace to another prefix is not recognised. |

## Examples

### Clean a document before typed parsing

```js
const mc = runtime.resolve('markupCompatibility');
const xml = runtime.resolve('xml');
const root = xml.parse(documentXml);
mc.process(root, { supportedPrefixes: ['w14'] });
// w14 Choice branches kept, w15 and the rest dropped to the Fallback.
```

### Keep two named elements of an ignorable namespace

```js
const root = xml.parse(
    '<w:sdtPr xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
    + ' mc:Ignorable="w15">'
    + '<w15:repeatingSection><w15:sectionTitle w:val="Rows"/></w15:repeatingSection>'
    + '<w15:color w:val="FF0000"/>'
    + '</w:sdtPr>');
mc.process(root, {
    keepElements: ['w15:repeatingSection', 'w15:repeatingSectionItem']
});
// root.children: [<w15:repeatingSection> with its <w15:sectionTitle> child];
// <w15:color> is dropped. `docx.read` processes word/document.xml and every
// header, footer, footnotes, endnotes and comments part this way.
```

### Producer — wrap a w14 extension

```js
const alt = mc.wrapAlternateContent({
    choices: [{ requires: 'w14', element: w14Variant }],
    fallback: vanillaVariant
});
mc.setIgnorable(rootEl, ['w14', 'w15']);
```

## Notes

- Selection order follows ECMA-376 part 3 §10.1.2.4: the first Choice satisfying all of its Requires, else the Fallback, else nothing.
- `mc:Ignorable` is inherited across the subtree via a Set threaded through the recursive walks.
- Nested `mc:AlternateContent` elements are resolved recursively.
- The `mc:*` attributes (Ignorable/PreserveElements/PreserveAttributes/MustUnderstand/ProcessContent) are removed in place.

## See also

- [docx](./docx/docx.md), [xlsx](./xlsx/xlsx.md), [pptx](./pptx/pptx.md) — all call `process` on read.
- [`@awacloud/fw` xml](https://github.com/awacloud/awa/blob/@awacloud/ooxml@1.0.0/packages/front/fw/docs/api/io/codec/xml.md) — the node model being manipulated.
