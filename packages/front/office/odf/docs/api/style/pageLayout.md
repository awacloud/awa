---
module: stylePageLayout
category: odf/style
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# stylePageLayout

> Parse/render `<style:page-layout>` (page geometry + header/footer styles).

**Module** `stylePageLayout` | **Source** `packages/front/office/odf/src/style/pageLayout.js` | **Worker-safe** yes

Model:

```js
{
  name,
  properties: { ...flatAttrs },          // <style:page-layout-properties>
  headerStyle?: { properties: { ... } },
  footerStyle?: { properties: { ... } },
  _extras?
}
```

## API

| Method | Description |
|---------|-------------|
| `parsePageLayout(el)` | Converts `<style:page-layout>`. |
| `renderPageLayout(p)` | Builds the node. |
