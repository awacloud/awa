---
module: oconvIr
category: oconv/ir
dependencies: []
returns: object
worker-safe: true
status: complete
---

# oconvIr

> The frozen `oconv-ir/v1` pivot document model every reader and writer shares.

**Module** `oconvIr` (`oconvIr`) | **Source** `packages/front/office/oconv/src/ir/ir.js` | **Deps** — | **Worker-safe** yes

The pivot sits between the format-aware readers (`<fmt>ToIr`) and writers (`irTo<Fmt>`), so the conversion matrix costs N+M adapters instead of N×M. The module imports nothing — not an office package, not `@awacloud/fw` — so the vocabulary itself carries no host or format assumption; anything a single reader/writer pair needs but the pivot does not model travels in the per-node opaque `escapes` bag, which this module never reads, clones or interprets.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconvIr = runtime.resolve('oconvIr');
```

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `IR_VERSION` | `string` | `'oconv-ir/v1'` | — |
| `KINDS` | `string[]` | the 13 frozen node kinds, declaration order | — |
| `node` | `(kind: string, props?: object, children?: IrNode[]) => IrNode` | one IR node of `kind` | `TypeError` on an unknown `kind` |
| `doc` | `(children?: IrBlock[], props?: object) => IrDocument` | convenience root constructor (`node('document', …)`) | — |
| `walk` | `(root: IrNode, visit: (n, parent, depth) => boolean\|void) => void` | depth-first, pre-order traversal; `visit` returning `false` skips that node's children | — |
| `validate` | `(root: IrNode) => {ok: boolean, errors: IrError[]}` | structural check — never throws | — |

The 13 node kinds (`KINDS`): `document`, `heading`, `paragraph`, `run`, `table`, `row`, `cell`, `list`, `listItem`, `image`, `codeBlock`, `blockquote`, `hr`. Every node is a plain object `{ kind, …props, children?, escapes? }` — `children` is present exactly on container kinds, `escapes` only when a producer supplied one. `validate`'s `errors[].code` is one of `unknown-kind`, `not-an-object`, `bad-prop`, `bad-children`, `unexpected-children`, `bad-child`, `bad-escapes`.

## Examples

### Build and validate a small document

```js
const heading = oconvIr.node('heading', { level: 1 }, [
    oconvIr.node('run', { text: 'Hi' })
]);
const document = oconvIr.doc([heading]);

oconvIr.IR_VERSION;              // 'oconv-ir/v1'
oconvIr.validate(document).ok;   // true
```

## Notes

- `node()` fills in every declared prop's frozen default for a key the caller omits (e.g. a `run` with no `bold` gets `bold: false`) — unknown prop keys are silently ignored (`src/ir/ir.js`'s `node()`); pair-specific data belongs in `props.escapes`, never in an invented prop.
- `validate` reports `bad-child` (not `unknown-kind`) when a malformed node sits in a parent slot whose spec constrains accepted child kinds; `unknown-kind` only fires when `validate` runs directly on the offending node itself.
- `walk`'s `visit` callback receives `(node, parent, depth)`; returning exactly `false` prunes that subtree, any other return value (including `undefined`) continues into the children.
- The full node-kind → props/children table lives in this file's own header comment (`src/ir/ir.js`) — every reader and writer page on this index cites the subset of kinds it actually produces or consumes.

## See also

- [docs/api/README.md](../README.md) — full module index + `exports` boundary note
- [`docx-to-ir`](../read/docx-to-ir.md), [`odt-to-ir`](../read/odt-to-ir.md), [`md-to-ir`](../read/md-to-ir.md) — readers producing this IR
- [`oconv`](../oconv.md) — the facade composing readers and writers over this pivot
- [loss matrix](../../loss-matrix.md)
