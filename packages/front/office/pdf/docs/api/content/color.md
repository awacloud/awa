---
module: pdfColor
category: pdf/content
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfColor

> Applying the colour operators to a graphics state — ISO 32000-2 §8.6.

**Module** `pdfColor` | **Source** `packages/front/office/pdf/src/content/color.js` | **Deps** `pdfErrors` | **Worker-safe** yes

Mutates `gstate.strokeColor` / `gstate.fillColor` for the 12 PDF colour
operators: `g`/`G`, `rg`/`RG`, `k`/`K`, `cs`/`CS`, `sc`/`SC`, `scn`/`SCN`.
Pattern / Separation / DeviceN spaces accept a trailing `/PatternName` on
`scn`/`SCN` — captured as `gstate.<slot>.pattern`. When `scn`/`SCN` carries no
trailing name, any previously captured `pattern` is deleted.

## Resolve

```js
const c = runtime.resolve('pdfColor');
// Returns: { applyColorOp }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `applyColorOp` | `(gstate, { op, args }) => void` | Mutates the gstate in place. |

### Operator → mutation

| Op | Target | Effect |
|----|--------|--------|
| `g` / `G` | fill / stroke | `{ space: 'DeviceGray', components: [n] }` |
| `rg` / `RG` | fill / stroke | `{ space: 'DeviceRGB', components: [r,g,b] }` |
| `k` / `K` | fill / stroke | `{ space: 'DeviceCMYK', components: [c,m,y,k] }` |
| `cs` / `CS` | fill / stroke | `{ space: name, components: device default }` |
| `sc` / `SC` | fill / stroke | replaces `components` only (numeric args kept, others dropped) |
| `scn` / `SCN` | fill / stroke | `components` plus an optional `pattern` when the last arg is a name |

### Defaults per named space

| Space | Default `components` |
|-------|----------------------|
| `DeviceGray` | `[0]` |
| `DeviceRGB` | `[0, 0, 0]` |
| `DeviceCMYK` | `[0, 0, 0, 1]` |
| any other | `[]` |

## Examples

### Set the fill colour in RGB

```js
const c = runtime.resolve('pdfColor');
c.applyColorOp(gstate, {
    op: 'rg',
    args: [{type:'real',value:0.8},{type:'real',value:0.2},{type:'real',value:0.1}]
});
gstate.fillColor;  // { space:'DeviceRGB', components:[0.8,0.2,0.1] }
```

### Set the stroke space

```js
c.applyColorOp(gstate, { op: 'CS', args: [{type:'name',value:'DeviceCMYK'}] });
gstate.strokeColor;  // { space:'DeviceCMYK', components:[0,0,0,1] }
```

### Pattern through `scn`

```js
c.applyColorOp(gstate, {
    op: 'scn',
    args: [{type:'real',value:0.5}, {type:'name',value:'P1'}]
});
gstate.fillColor.pattern;     // 'P1'
gstate.fillColor.components;  // [0.5]
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/color/unknown-op` | `ContractError` | `applyColorOp` called with a non-colour operator. |
| `pdf/color/bad-name` | `ContractError` | `cs`/`CS` without a `name` argument. |
| `pdf/color/short-args` | `ContractError` | Fewer numeric arguments than required by `g`/`rg`/`k` and their stroke variants. |
| `pdf/color/bad-num` | `ContractError` | An argument expected to be numeric has another type. |

## See also

- [`pdfGraphics`](./graphics.md) — hosts `strokeColor`/`fillColor`.
- [`pdfContentStream`](./stream.md) — produces the ops.
- [`pdfContentOps`](./ops.md) — categorisation.
