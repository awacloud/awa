---
module: drawFrame
category: odf/draw
dependencies: [xml, drawImage, odfErrors]
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
| `renderFrame(f)` | Builds the node. A `child` whose `kind` is not `image`, `text-box` or `object` throws `ContractError` `odf/contract-error/frame` (`context.kind`); a frame without `child` renders its attributes and `_extras` only. |

`odfErrors` is the third, optional dependency: a factory wired by hand with
the two-argument call `drawFrame.factory(xml, imageMod)` (the 1.0.0 wiring)
still works, and an unknown child kind then yields a `null` child (the 1.0.0
result) instead of the typed throw.
