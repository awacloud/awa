---
module: oconvIrToMd
category: oconv/write
dependencies: [oconvIr, md, mdNode]
returns: object
worker-safe: true
status: complete
---

# oconvIrToMd

> `oconv-ir/v1` → structured-markdown profile v1, the frozen wire contract.

**Module** `oconvIrToMd` | **Source** `packages/front/office/oconv/src/write/ir-to-md.js` | **Deps** `oconvIr`, `md`, `mdNode` | **Worker-safe** yes

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconvIrToMd = runtime.resolve('oconvIrToMd');
```

In practice this module is reached through the `oconv` facade
(`oconv.toMd(...)`/`oconv.fromMd` for the read direction, none for write —
`toMd` is the ONLY documented facade member for markdown output); resolving
it directly is for tooling that wants the profile-v1 writer in isolation.

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `irToMd` | `(ir: object, meta: OconvMeta, opts?: object) => OconvMdResult` | `{markdown, anchors, lossy, losses, assets}` | — (no input validation; a malformed `ir` produces malformed output rather than throwing — the caller-facing facade `oconv.toMd` validates upstream) |

`OconvMeta` (all caller-supplied provenance — this module reads no clock and
computes no hash): `sourceFormat`, `sourceName`, `sourceBytes`,
`sourceSha256`, `convertedAt`, `converter`, `converterVersion`, `engine`,
optional `losses` (reader losses, merged FIRST into the returned ledger).
`opts` is reserved — v1 defines no key on it.

`OconvMdResult`: `markdown` (front matter + rendered body), `anchors`
(`{level, anchor}[]`, document order), `lossy` (`losses.length > 0`),
`losses` (reader losses then this module's own, document order), `assets`
(`{kind: 'image', name, bytes?}[]`, deduplicated by `name`).

## Examples

### Convert a two-block IR document

```js
// Build the IR with the oconvIr helpers: `node` fills each node's frozen
// defaults, so the tree passes `oconvIr.validate` (a bare
// `{ kind: 'run', text }` literal does not).
const { node, doc } = runtime.resolve('oconvIr');
const ir = doc([
    node('heading', { level: 1 }, [node('run', { text: 'Title' })]),
    node('paragraph', {}, [
        node('run', { text: 'Hello ' }),
        node('run', { text: 'world', bold: true })
    ])
]);
const meta = {
    sourceFormat: 'docx', sourceName: 'x.docx', sourceBytes: 10,
    sourceSha256: 'abc123', convertedAt: '2026-09-15T00:00:00Z',
    converter: 'oconv', converterVersion: '1.0.0', engine: 'bun'
};
const { markdown, anchors, lossy } = oconvIrToMd.irToMd(ir, meta);
// markdown starts with the YAML front matter, then "# Title\n\nHello **world**\n"
// anchors deep-equals [{ level: 1, anchor: 'title' }]
// lossy === false
```

Executed against the live package (2026-10-03): the front matter opens
`---\nprofile: v1\nir: oconv-ir/v1\n…`, the body renders `# Title` followed
by `Hello **world**`, `anchors` is exactly `[{ level: 1, anchor: 'title' }]`
and `lossy` is `false`.

## Notes

- **Front matter key order is exact and frozen** — see
  [profile-v1](../../profile-v1.md) for the full key-by-key reference.
  `anchors:`, `losses:` (only present when `lossy: true`) and `assets:` are
  each omitted entirely when empty, never emitted as `[]`.
- **The body is never assembled as raw text.** This module builds an
  `@awacloud/md` AST with the `mdNode` factory and serialises it with the
  resolved `md` module's `renderMarkdown(ast)` — escaping, table padding and
  fence widths are `@awacloud/md`'s job (`src/write/ir-to-md.js:8-11`).
- **The asset manifest's `bytes` field is read from the shape the reader
  really produces.** `imageNode` populates `assets[].bytes` from an IR
  `image` node's `escapes.docx.bytes` — the nested field `docx-to-ir.js`
  stores for an embedded image. The array is passed through **by
  reference** (the same `Uint8Array`, never copied) and is never serialized
  into the YAML front matter. A flat `escapes.bytes` is not read: no
  shipped reader produces it, so the single nested shape is the contract.
  The real-corpus leg `poi-with-gif.docx` in
  `tests/fidelity.integration.test.js` pins it end to end: `toMd` returns
  one asset (`Grafik 1`) whose `bytes` is a 6554-byte `Uint8Array`, with
  `lossy` still `false`.
- A `run.link === ''` (present but empty) records `link/target-missing` and
  emits the run unlinked; a `run.link === undefined` is a plain run, no
  loss. See the [loss matrix](../../loss-matrix.md) for the published
  Preserved/Degraded/Dropped classification of `block/dropped` and
  `link/target-missing`.
- A table cell's block content is flattened to inline text (paragraphs and
  headings joined by a space); a heading flattened inside a cell produces no
  `#`-heading and contributes **no anchor**.
- Capture-free by contract (`fw/no-factory-capture`): the anchor-slug
  algorithm is re-declared inside this module's factory rather than
  imported from `./anchors.js`, and a drift test pins the two copies
  identical.
- `opts` is accepted but read nowhere (`void opts` in the source) — v1
  defines no writer option.

## See also

- [`ir-to-docx`](./ir-to-docx.md) / [`ir-to-odt`](./ir-to-odt.md) /
  [`ir-to-pdf`](./ir-to-pdf.md) — the other three IR writers.
- [Structured-markdown profile v1](../../profile-v1.md) — the full wire
  contract this module emits.
- [Loss matrix](../../loss-matrix.md) — published fidelity classification.
