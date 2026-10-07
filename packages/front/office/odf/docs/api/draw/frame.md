---
module: drawFrame
category: odf/draw
dependencies: [xml, drawImage]
returns: object
worker-safe: true
status: complete
---

# drawFrame

> Parse/render `<draw:frame>` — wrapper for embedded images, text boxes, or generic objects.

**Module** `drawFrame` | **Source** `packages/front/office/odf/src/draw/frame.js` | **Worker-safe** yes

Model:

```js
{ type: 'frame', anchorType?, name?, styleName?, width?, height?, x?, y?,
  child: { kind: 'image' | 'text-box' | 'object', ... }, _extras? }
```

## API

| Method | Description |
|---------|-------------|
| `parseFrame(el)` | Converts `<draw:frame>`. |
| `renderFrame(f)` | Builds the node. |
