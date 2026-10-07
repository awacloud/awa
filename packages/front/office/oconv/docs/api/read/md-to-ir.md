---
module: oconvMdToIr
category: oconv/read
dependencies: [oconvIr, md, mdFrontmatter]
returns: object
worker-safe: true
status: complete
---

# oconvMdToIr

> Markdown text (via `@awacloud/md`'s `md.parse`) → `oconv-ir/v1` — the `fromMd`/`convert` read side.

**Module** `oconvMdToIr` (`oconvMdToIr`) | **Source** `packages/front/office/oconv/src/read/md-to-ir.js` | **Deps** `oconvIr`, `md`, `mdFrontmatter` | **Worker-safe** yes

Composes `@awacloud/md`'s public `md.parse` and `mdFrontmatter.stripFrontmatter` — never an `@awacloud/md` internal. Pure string/AST/object work, no DOM, no I/O, no crypto.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const { mdToIr } = runtime.resolve('oconvMdToIr');
```

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `mdToIr` | `(markdown: string) => {ir, losses, frontmatter}` | `ir` — an `oconv-ir/v1` document; `losses` — `{code, detail}[]`; `frontmatter` — `{lang, content}` or `null` | `TypeError`/`Error` `oconv: markdown must be a string` when `markdown` is not a string |

## Examples

### Convert a markdown string to IR

```js
const { ir, losses, frontmatter } = mdToIr(
    '# Title\n\nSome **bold** and *italic* text.\n\n- one\n- two\n'
);
ir.kind;        // 'document'
losses;         // [] for this input
frontmatter;    // null — no leading front-matter fence
```

## Notes

- A leading front-matter fence (`---`/`+++`/`;;;`) is stripped before parsing and never carried into the IR — recorded as loss `frontmatter/stripped`, detail = the fence's `lang`.
- Nesting inline emphasis (`emph`/`strong`/`strikethrough`) flattens into per-run boolean flags — a new IR `run` is emitted whenever the effective flag set or link target changes.
- A hard line break (`linebreak`) degrades to a single space (loss `inline/linebreak-degraded`); a soft break degrades to a single space with **no** loss.
- An ordered list with `listStart > 1`, a GFM task-list checkbox, or a GFM table declaring column alignment each records a loss (`list/start-dropped`, `list/task-marker-dropped`, `table/align-dropped` respectively) — the IR vocabulary has no prop for any of the three.
- Every other unmapped inline or block node kind is dropped through an exhaustive else-branch (`inline/dropped` / `block/dropped`, detail = the node's own `type`) — nothing falls through silently.
- Out of scope: no YAML/TOML/JSON parsing of the stripped front-matter content, no footnote/math/emoji handling (their syntax parses as ordinary text under core `md.parse`).

## See also

- [docs/api/README.md](../README.md) — full module index + `exports` boundary note
- [`oconvIr`](../ir/ir.md) — the pivot this reader produces
- [`oconv`](../oconv.md) — the facade's `fromMd`/`convert` read side
- [loss matrix](../../loss-matrix.md)
