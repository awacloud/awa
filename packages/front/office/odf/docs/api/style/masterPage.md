---
module: styleMasterPage
category: odf/style
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# styleMasterPage

> Parse/render `<style:master-page>`.

**Module** `styleMasterPage` | **Source** `packages/front/office/odf/src/style/masterPage.js` | **Worker-safe** yes

Model:

```js
{
  name,
  displayName?,
  pageLayoutName,
  headers?: { default?, left? },
  footers?: { default?, left? },
  _extras?
}
```

Header/footer bodies are preserved as arrays of raw XML nodes.

## API

| Method | Description |
|---------|-------------|
| `parseMasterPage(el)` | Converts `<style:master-page>`. |
| `renderMasterPage(mp)` | Builds the node. |
