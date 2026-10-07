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
    _extras?
  }],
  _extras?
}
```

Each properties bag is a **flat dictionary** of `attr → string`.

## API

| Method | Description |
|---------|-------------|
| `parse(containerEl)` | Converts `<office:automatic-styles>` into the model. |
| `render(model)` | Builds the node. |
| `parseStyle(el)` / `renderStyle(s)` | Works style by style. |
| `empty()` | `{ styles: [] }`. |
| `PROP_TAGS` | Object mapping style-properties tag names to property keys (e.g. `style:paragraph-properties` → `paragraph`). |
