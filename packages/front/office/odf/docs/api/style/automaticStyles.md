---
module: styleAutomatic
category: odf/style
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# styleAutomatic

> Typed parse/render of `<office:automatic-styles>` (present in `content.xml` and `styles.xml`).

**Module** `styleAutomatic` | **Source** `packages/front/office/odf/src/style/automaticStyles.js` | **Worker-safe** yes

Model:

```js
{
  styles: [{
    name, family, parentStyleName?,
    properties: {
      paragraph?, text?, table?, tableColumn?, tableRow?, tableCell?, graphic?
    },
    _extras?: {
      attrs?, children?,        // other style:style attributes and children
      propertyChildren?: {      // a property element's own children
        paragraph?: [node…], …  //   (verbatim), keyed like `properties`
      }
    }
  }],
  _extras?
}
```

Each properties bag is a **flat dictionary** of `attr → string`.

A property element's own children — a paragraph style's `style:tab-stops` or
`style:drop-cap`, a cell style's `style:background-image` — are not part of
the flat bag: `parseStyle` keeps them verbatim in
`_extras.propertyChildren[<key>]` and `renderStyle` writes them back inside
that element, so a style read and written keeps them (they were dropped, and
an empty property element written, before). The flat `properties` bags are
unchanged; the key is absent for a property element without children.

## API

| Method | Description |
|---------|-------------|
| `parse(containerEl)` | Converts `<office:automatic-styles>` into the model. |
| `render(model)` | Builds the node. |
| `parseStyle(el)` / `renderStyle(s)` | Works style by style. |
| `empty()` | `{ styles: [] }`. |
| `PROP_TAGS` | Object mapping style-properties tag names to property keys (e.g. `style:paragraph-properties` → `paragraph`). |
