---
title: "@awacloud/oconv — the convert facade member (allowlisted cross-format pairs)"
---

# `oconv.convert` — allowlisted cross-format pairs

> **Purpose.** The reference for `oconv.convert({ bytes, target })`, the
> facade member that turns a `.docx`/`.odt` document straight into another
> document format, and for the worker's third message kind. Audience:
> anyone calling it directly or wiring that message. For the published
> Preserved/Degraded/Dropped fidelity table per pair see
> [`docs/loss-matrix.md`](./loss-matrix.md) — this page never repeats those
> rows, only cross-links them.
>
> **Prerequisites.** The `@awacloud/oconv` main entry (`fw_require` and
> `modules`, registered on an `@awacloud/fw` `ModuleRuntime` as below); the
> `@awacloud/oconv/src/worker.js` sub-path for the worker message. Runs in a
> browser or on the runtimes the package's `engines` field names (Bun ≥ 1.0,
> Node ≥ 20); the conversion itself performs no network or filesystem access.

`convert` is pure wiring, additive to the frozen `oconv` facade:
`read <format> → oconv-ir/v1 → write <target>`,
the same two pipelines `toMd` and `fromMd` already implement, composed back
to back for exactly four shipped pairs. It adds no dependency to the
`oconv` module descriptor and no new office-package wiring — every reader
and writer it calls was already reachable from `toMd`/`fromMd`.

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconv = runtime.resolve('oconv');

const result = await oconv.convert({
    bytes: docxBytes,      // Uint8Array — REQUIRED
    name: 'report.docx',   // optional — extension drives `format` detection
    target: 'odt'           // REQUIRED, never derived — see below
});
// result.bytes — a .odt Uint8Array; result.format === 'docx'; result.target === 'odt'
```

## Signature

```
OconvConvertInput = {
    bytes: Uint8Array,             // REQUIRED — source document bytes
    name?: string,                 // source file name; extension drives `format` when `format` is omitted
    format?: 'docx' | 'odt',       // explicit value wins over `name`'s extension
    target: string,                // REQUIRED, never derived — 'docx' | 'odt' | 'pdf'
    includeNotes?: boolean,        // forwarded to the reader (docx/odt readers ignore it — see below)
    opts?: { pdf?: OconvPdfOptions }, // opts.pdf only, target 'pdf' only
    defaultFaces?: { regular?: Uint8Array, bold?: Uint8Array, italic?: Uint8Array,
                      boldItalic?: Uint8Array, mono?: Uint8Array } // target 'pdf' only
}

OconvConvertResult = {
    bytes: Uint8Array,             // target bytes
    format: string,                // resolved source format
    target: string,                // resolved target
    lossy: boolean,                // losses.length > 0
    losses: { code: string, detail: * }[], // reader losses then writer losses, document order
    ms: number                     // wall-clock duration of this call, in milliseconds
}
```

`name` names the **source** here, unlike `fromMd`'s `name` — `convert`
never derives a target from a file name, because the source and target
extensions can legitimately differ (that IS the point of a converter).
`includeNotes` is accepted for signature symmetry with `toMd` but is a
no-op for every shipped pair (pinned by `src/oconv.test.js`):
neither `docx` nor `odt` is a notes-carrying format (`pptx`/`odp` are,
but no `pptx`/`odp` source is shipped here — see "Not shipped" below).

`opts.pdf` is the same `OconvPdfOptions` block `fromMd` accepts, validated
in exactly one place (`oconvPdfBox.resolveLayout`) — see
[`docs/pdf-writer.md`](./pdf-writer.md) for the full option table and its
error names.

No `assets` input on `convert`: image bytes come from the reader's own
escapes only (e.g. `escapes.docx.bytes` for a `docx` source, the rule all
three writers share) — a `convert` caller has no markdown image destinations to key an
asset manifest by, unlike `fromMd`.

## Errors, in check order

`bytes → format → target → pair → opts.pdf → defaultFaces`. Each check is
independent of the others — a later error is never reported when an
earlier one already applies. The five stage-to-stage boundaries up to
`opts.pdf` are each pinned by `src/oconv.test.js` (one test per adjacent
boundary); the two `defaultFaces` checks (rows 6-7) follow directly
from the same linear if-chain in `src/oconv.js`'s `convert()`.

| Order | Condition | Error |
|---|---|---|
| 1 | `bytes` is absent or not a `Uint8Array` | `oconv: bytes is required` |
| 2 | The source format is neither given explicitly (`format`) nor derivable from `name`'s extension, or is none of the seven `toMd` formats (`docx`/`odt`/`xlsx`/`ods`/`pptx`/`odp`/`pdf`) | `oconv: unsupported format` |
| 3 | `target` is absent or is not `'docx'`/`'odt'`/`'pdf'` | `oconv: unsupported target` |
| 4 | `format` and `target` are both individually valid but `format>target` is not one of the four shipped pairs — this is where an `xlsx`/`ods`/`pptx`/`odp`/`pdf` source is rejected, as is a same-format pair (`docx>docx`) | `oconv: unsupported pair` |
| 5 | `opts.pdf` is supplied for a `target` other than `'pdf'` | `oconv: pdf options need target pdf` |
| 6 | `defaultFaces` is supplied for a `target` other than `'pdf'` (checked LAST, after `opts.pdf`) | `oconv: default faces need target pdf` |
| 7 | `defaultFaces` is supplied and is not a non-null, non-array object whose every own value is a `Uint8Array` | `oconv: bad default faces` |

A bad `opts.pdf` key (once `target === 'pdf'`) surfaces the pdf writer's
own single validator error, `oconv: bad pdf option <key>` /
`oconv: bad pdf font <style>` (pinned by `src/oconv.test.js` through
`convert`) — see [`docs/pdf-writer.md`](./pdf-writer.md). An unknown
`defaultFaces` key is likewise rejected downstream by the same measurer,
`oconv: bad default font <key>`.

## Shipped pairs

| Pair | Reader | Writer | Measured tier | Matrix row |
|---|---|---|---|---|
| `docx → odt` | `oconvDocxToIr` | `oconvIrToOdt` | 2 | [`docs/loss-matrix.md` § Cross-format pairs](./loss-matrix.md#cross-format-pairs) |
| `odt → docx` | `oconvOdtToIr` | `oconvIrToDocx` | 2 | [`docs/loss-matrix.md` § Cross-format pairs](./loss-matrix.md#cross-format-pairs) |
| `docx → pdf` | `oconvDocxToIr` | `oconvIrToPdf` | 2 (bounded typesetter) | [`docs/loss-matrix.md` § Cross-format pairs](./loss-matrix.md#cross-format-pairs) |
| `odt → pdf` | `oconvOdtToIr` | `oconvIrToPdf` | 2 (bounded typesetter) | [`docs/loss-matrix.md` § Cross-format pairs](./loss-matrix.md#cross-format-pairs) |

Fidelity for each pair is the composition of the reader's `→ IR` row and
the writer's `IR →` row already published in
[`docs/loss-matrix.md`](./loss-matrix.md) — this page names no new
Preserved/Degraded/Dropped facts of its own, it only wires the two
halves. One writer fact is measured on the `odt → docx` pair:
`ir-to-docx.js` gives every top-level list its own numbering instance, so
two adjacent same-kind lists from the odt source stay two lists on re-read
and nothing merges; only the nested item flattens, and the return leg
records that as `list/nesting-flattened`
(`tests/crossformat-ooxml-odf.integration.test.js` §
"odt-structured.odt -> docx — MEASURED DIFFERENT: the two bullet lists stay
distinct; only the nested item flattens (exact difference pinned)"). The
`→ docx` target inherits the same writer's fixed built-in
`word/styles.xml` (`Normal`, `Heading1`–`Heading6`, `Table Grid`) and
bordered tables, and the `→ odt` target the odt writer's fixed
built-in `styles.xml` (`Standard`, `Text_20_body`, `Heading`,
`Heading_20_1`–`Heading_20_6`) and bordered, margins-aligned tables
— a presentation fact of each writer, not the source document's
styles carried over. `docx →
odt`/`odt → docx` reach tier 2 (both writers do); `→ pdf`
is the bounded typesetter (see [`docs/pdf-writer.md`](./pdf-writer.md)).
The **measured tier** column above mirrors, for a reader at the call
site, the tier column of [`docs/loss-matrix.md`](./loss-matrix.md)'s own
"Cross-format pairs" table — that table, backed by the
`tests/crossformat-*.integration.test.js` harnesses, is the traceable
source of truth; this page never restates its Preserved/Degraded/Dropped
content.

## Not shipped

| Excluded family | Reason |
|---|---|
| `xlsx ↔ ods`, `pptx ↔ odp` | No pivot-IR **writer** targets a spreadsheet or presentation container today (`oconvIrToDocx`/`oconvIrToOdt`/`oconvIrToPdf` are the only three write targets this package ships) — outside the converter's initial design scope, not a gap in the docx/odt pair |
| `{xlsx, ods, pptx, odp} → pdf` | Deferred pending a measured fidelity statement for laying out a spreadsheet/presentation through the bounded typesetter — no reader/writer composition has been measured for these sources |
| `pdf → docx`, `pdf → odt` | Out of scope — `pdf` is a `convert` **target** only, never a `convert` **source**; no `oconvPdfToIr → write` composition is wired here |
| Same-format pairs (`docx → docx`, `odt → odt`) | Never a `convert` (there is nothing to convert); not in `SUPPORTED_PAIRS` |
| Any `→ md` pair | That is `toMd`, the existing read-direction facade member, not `convert` |

Adding a pair beyond the four above is a later, measured decision — never
inferred from this table.

## The worker message (third kind, additive)

`src/worker.js`'s `self.onmessage` discriminates three message kinds. A
`toMd` message never carries `markdown` or `target`; a `fromMd` message
always carries `markdown` (and MAY also carry `target`); a `convert`
message carries `target` but never `markdown` — so the check order is
unambiguous:

```js
const reply = typeof data.markdown === 'string' ? await handleFromMd(data)
    : typeof data.target === 'string' ? await handleConvert(data)
    : await handleToMd(data);
```

**In**: `{ id, name?, bytes: ArrayBuffer, format?, target, includeNotes?,
opts?, defaultFaces? }` (`bytes` transferred, zero-copy, same convention
as the `toMd` message) → `convert({ name, bytes: new Uint8Array(bytes),
format, target, includeNotes, opts, defaultFaces })`, with `opts` and
`defaultFaces` each forwarded only when the caller sent the key — pinned
by `tests/worker.integration.test.js`.

**Out**: `{ id, ms, error, bytes, warnings, losses }` — **identical shape to
the `fromMd` reply**. `bytes` is a `Uint8Array` (structured-cloned, not
transferred on the reply) or `null` on error; `losses` is the facade's
`{ code, detail }` ledger itself, verbatim (`[]` on error; a reader code
carries a string `detail`, the pdf writer's `layout/*`, `text/unencodable`
and `inline/*` codes an object one, and both cross the structured clone
unchanged); `warnings = losses.length`, kept for existing callers; `error`
a string or `null` — same data-not-thrown contract as `toMd` and `fromMd`.
The `toMd` and `fromMd` request envelopes are byte-unchanged by this
addition.

## Provenance and reproducibility

Provenance in the target container is target-specific, not uniformly
absent (same as `fromMd` — see the package [README](../README.md)):
`docx` writes none (no `docProps`/core-properties part at all, pinned by
`tests/roundtrip.integration.test.js`); `odt` always carries
`meta:generator: '@awacloud/odf'` in `meta.xml` (`@awacloud/odf`'s
`writeSidecars` fallback is never nothing); `pdf` always carries
`/Producer` and `/Creator`, both literally `'@awacloud/oconv'`
(`src/write/ir-to-pdf.js`'s `addMetadata` call). For the `docx`/`odt`
targets, reproducibility differs. The `docx` target is **byte-reproducible**:
`@awacloud/ooxml` stamps every zip entry with a fixed 1980-01-01 00:00
timestamp, so the `odt → docx` pair gives identical bytes across calls
(`tests/crossformat-ooxml-odf.integration.test.js` "odt -> docx: two convert
runs are BYTE-identical"; `src/oconv.test.js` "convert odt -> docx is
byte-reproducible across two calls"). The `odt` target is **not**: the ODF
package writer stamps the current time, so two identical `docx → odt` calls
give equal document models (model-equal for every fixture measured — 6
`docx→odt` + 2 `odt→docx` fixtures in the `crossformat-ooxml-odf` harness) but
may give different bytes. The `pdf` target **is** byte-reproducible: no zip
container, no date, no `/ID` (see [`docs/pdf-writer.md`](./pdf-writer.md)'s
determinism note), so both `→ pdf` pairs reproduce. **No round-trip stability
claim** is made for any pair — converting `docx → odt` and back is not asserted to reproduce the
original bytes or even the original IR.

## See also

- [`docs/loss-matrix.md`](./loss-matrix.md) — the published fidelity table
  `convert` composes from, per reader/writer row.
- [`docs/pdf-writer.md`](./pdf-writer.md) — `opts.pdf`, loss codes and
  determinism for the `→ pdf` half of `docx → pdf` / `odt → pdf`.
- [`docs/profile-v1.md`](./profile-v1.md) — the pivot IR `convert` reads
  into and writes out of.
- [`../README.md`](../README.md) — package overview.
