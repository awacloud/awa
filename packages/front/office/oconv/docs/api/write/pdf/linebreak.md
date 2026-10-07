---
module: oconvPdfLinebreak
category: oconv/write/pdf
dependencies: []
returns: object
worker-safe: true
status: complete
---

# oconvPdfLinebreak

> Style-tagged tokenizer + greedy space-only line breaking (bounded typesetter).

**Module** `oconvPdfLinebreak` | **Source** `packages/front/office/oconv/src/write/pdf/linebreak.js` | **Deps** — none | **Worker-safe** yes

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconvPdfLinebreak = runtime.resolve('oconvPdfLinebreak');
```

Composed internally by [`ir-to-pdf`](../ir-to-pdf.md) (installed on
`ctx.linebreak`) and by [`pdf/stack`](./stack.md)'s `flowBlocks`; resolving
it directly is for measuring/breaking a run of inline text in isolation.

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `tokenize` | `(inlines: object[], measurer: object, sizePt: number, styleOverride?: string) => Token[]` | style-tagged word/space tokens | — |
| `greedyBreak` | `(tokens: Token[], columnPt: number) => {lines: Line[], overflowLines: number}` | broken lines | — |
| `breakInlines` | `(inlines: object[], measurer: object, sizePt: number, columnPt: number, styleOverride?: string) => {lines: Line[], losses: Loss[]}` | tokenize + break + loss recording: `layout/line-overflow` (one per overflowing line), then `inline/strike-dropped` and `inline/code-emphasis-dropped` (one each per call, when present) | — |
| `lineText` | `(line: Line) => string` | plain-text rendering of one line | — |

## Examples

### Tokenize and break a run of text

```js
const { node } = runtime.resolve('oconvIr');
const metrics = runtime.resolve('oconvPdfMetrics');
const measurer = metrics.createMeasurer();
const inlines = [node('run', { text: 'The quick brown fox jumps over the lazy dog' })];
const { lines, losses } = oconvPdfLinebreak.breakInlines(inlines, measurer, 11, 80);
lines.length;                          // 4 (at an 80pt column)
oconvPdfLinebreak.lineText(lines[0]);  // 'The quick'
losses;                                // [] (no unbreakable token wider than the column)
```

Executed against the live package (2026-10-06): 4 lines at an 80pt column
and 11pt body size, first line `'The quick'`, `losses === []`.

## Notes

- **Bounded exactly as the PDF writer publishes**: break on spaces only, no
  hyphenation, no justification (left-aligned ragged-right), no
  widow/orphan control. A single token wider than the column is NOT
  broken — it is emitted overflowing on a line of its own and recorded
  (`layout/line-overflow`), never silently clipped.
- **Two inline records, bytes unchanged**: `breakInlines` scans the `run`
  inlines it was given (`styleOverride` plays no part in this scan) and
  records `inline/strike-dropped` when at least one run has `strike: true`
  (no strikethrough rule is drawn) and `inline/code-emphasis-dropped` when
  at least one run has `code: true` together with `bold` or `italic` (the
  monospace class wins, the emphasis is not drawn). One record per code per
  call, `detail: { runs, text }` — `runs` counts the affected runs, `text`
  is the first one's text truncated to 40 characters — placed after the
  overflow records. Tokens, lines and drawn bytes are exactly those of the
  unflagged runs; only the ledger differs. Through
  [`pdf/stack`](./stack.md) each record gains the text block's
  `{index, kind}`, and list items, table cells and blockquote children are
  covered because they flow through the same path.
- **`styleOfRun` is re-declared here, verbatim, not imported from
  `oconvPdfMetrics`.** `oconvPdfMetrics.styleOfRun` only exists on the
  RESOLVED module instance, and even a static import of the source would
  trip `fw/no-factory-capture` (a factory may reference only its own
  parameters and factory-local declarations, so `factory.toString()` stays
  self-contained for Worker serialization / the standalone build). The two
  implementations are pinned identical by each module's own test suite.
- **Latin script only (v1)** — no bidi, no CJK breaking; out of scope
  for this module and recorded nowhere.
- `tokenize`'s `styleOverride` forces every token's style class regardless
  of the run's own flags (e.g. `'code'` for a fenced code block passed
  through this path, `'italic'` for a placeholder image caption) — used by
  [`pdf/render/table`](./render/table.md)'s header-cell measurement and
  [`pdf/render/image`](./render/image.md)'s placeholder path.
- `greedyBreak`'s FIRST word of a line always goes on, even alone
  overflowing — the typesetter refuses hyphenation, so an unbreakable token has nowhere
  else to go.
- Pure module, `dependencies: []`: everything it composes with (the
  `Measurer`) arrives as a call-time ARGUMENT, never a factory-injected
  dependency — keeps the linebreaker measurer-agnostic and worker-safe.
  Capture-free (`fw/no-factory-capture`).

## See also

- [`pdf/metrics`](./metrics.md) — supplies the `Measurer` this module
  measures with (`widthOf`).
- [`pdf/stack`](./stack.md) — the sole caller of `breakInlines` for
  top-level text blocks (`ctx.linebreak`, mandatory on the stack's `ctx`).
- [`pdf/render/table`](./render/table.md),
  [`pdf/render/image`](./render/image.md) — use `tokenize` directly for
  cell measurement and placeholder text.
- [`pdf-writer.md`](../../../pdf-writer.md) — the loss codes in the
  audience-facing reference.
