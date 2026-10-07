---
module: pdfGraphics
category: pdf/content
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfGraphics

> Graphics-state stack for a content-stream interpreter — ISO 32000-2 §8.4.

**Module** `pdfGraphics` | **Source** `packages/front/office/pdf/src/content/graphics.js` | **Deps** `pdfErrors` | **Worker-safe** yes

Implements the **device-independent** subset (§8.4.1, Table 53) of the graphics
state: CTM, line width/cap/join, miter limit, dash pattern, rendering intent,
flatness — plus the nested `text` sub-tree (driven by [`pdfText`](./text.md))
and `strokeColor`/`fillColor` (driven by [`pdfColor`](./color.md)). This is
**not** a renderer: it is a faithful model of the `gstate` chain that the upper
layers (text extraction, MCID tracking, redaction) consume.

## Resolve

```js
const g = runtime.resolve('pdfGraphics');
// Returns: { GStateStack, createStack, applyOp, initialGState, mulCtm }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `GStateStack` | `new GStateStack()` | Instance, starting from `initialGState`. |
| `createStack` | `() => GStateStack` | Equivalent helper. |
| `applyOp` | `(stack, { op, args }, handlers?) => void` | Applies one gstate op. |
| `initialGState` | `() => object` | Identity-state snapshot. |
| `mulCtm` | `(a: number[6], b: number[6]) => number[6]` | 2×3 matrix product. |

### `GStateStack` methods

| Method | Description |
|--------|-------------|
| `current()` | Top of stack (mutable). |
| `save()` | `q` — pushes a deep copy of the sensitive fields. |
| `restore()` | `Q` — pops; throws `pdf/gstate/unbalanced-Q` on an empty stack. |
| `depth()` | Current depth (≥ 1). |
| `concatCtm(matrix)` | `cm` — `ctm = matrix × ctm`. |

### `gstate` shape

```js
{
    ctm: [1,0,0,1,0,0],
    lineWidth: 1, lineCap: 0, lineJoin: 0,
    miterLimit: 10,
    dash: { array: [], phase: 0 },
    renderingIntent: 'RelativeColorimetric',
    flatness: 1,
    text: { charSpace: 0, wordSpace: 0, scale: 100, leading: 0,
            font: null, fontSize: 0, renderMode: 0, rise: 0 },
    strokeColor: { space: 'DeviceGray', components: [0] },
    fillColor:   { space: 'DeviceGray', components: [0] }
}
```

`applyOp` routes only `q`, `Q`, `cm`, `w`, `J`, `j`, `M`, `d`, `ri`, `i`. Any
other operator falls through to `handlers.unhandled(op, stack)` when supplied.

## Examples

### Walking a content stream

```js
const g = runtime.resolve('pdfGraphics');
const stack = g.createStack();
for (const op of ops) {
    g.applyOp(stack, op, {
        unhandled: (o) => {
            if (o.op.startsWith('T')) applyTextOp(stack.current(), o);
        }
    });
}
```

### Composing CTMs

```js
const scale = [2, 0, 0, 2, 0, 0];
const translate = [1, 0, 0, 1, 100, 50];
const ctm = g.mulCtm(scale, translate);
```

### Detecting an unbalanced stack

```js
try { g.applyOp(stack, { op: 'Q', args: [] }); }
catch (e) { if (e.code === 'pdf/gstate/unbalanced-Q') { /* … */ } }
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/gstate/unbalanced-Q` | `ContractError` | `Q` without a matching `q`. |
| `pdf/gstate/bad-cm` | `ContractError` | `cm` matrix is not 6 elements. |
| `pdf/gstate/bad-arg-type` | `ContractError` | Non-numeric argument for `w`, `J`, `j`, `M`, `i`. |
| `pdf/gstate/bad-name-arg` | `ContractError` | Non-`name` argument for `ri`. |

## See also

- [`pdfContentStream`](./stream.md) — produces the op list.
- [`pdfText`](./text.md) — the nested text state.
- [`pdfColor`](./color.md) — `strokeColor` / `fillColor`.
