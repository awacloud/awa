---
module: oconvPdfBox
category: oconv/write/pdf
dependencies: []
returns: object
worker-safe: true
status: complete
---

# oconvPdfBox

> Page geometry and the single `opts.pdf` option validator.

**Module** `oconvPdfBox` | **Source** `packages/front/office/oconv/src/write/pdf/box.js` | **Deps** — none | **Worker-safe** yes

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconvPdfBox = runtime.resolve('oconvPdfBox');
```

Composed internally by [`ir-to-pdf`](../ir-to-pdf.md), which forwards the
WHOLE `opts.pdf` block here so option validation lives in exactly ONE
place; resolving it directly is for validating or previewing a layout in
isolation.

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `PAGE_SIZES` | `object` | `{A4: [595.276, 841.89], Letter: [612, 792]}` (points) | — |
| `DEFAULTS` | `object` | the frozen default option block | — |
| `resolveLayout` | `(pdfOpts?: object) => Layout` | frozen `Layout` | `Error` `oconv: bad pdf option <key>` |

`Layout` members: `pageWidth`/`pageHeight` (media box, pt), `margin`
(uniform, pt), `column` (`pageWidth − 2·margin`), `contentHeight`
(`pageHeight − 2·margin`), `baseSize` (pt), `codeSize` (pt), `pageNumbers`
(boolean), `leading(sizePt)` (baseline-to-baseline distance =
`leadingRatio · sizePt`), `sizeFor(kind, level?)` (`'heading'` →
`headingScale[level−1]`, `'code'` → `codeSize`, else `baseSize`).

## Examples

### Resolve the default layout, and reject an unknown key

```js
const layout = oconvPdfBox.resolveLayout();
layout.column;                     // 481.89 (595.276 − 2·56.693)
layout.contentHeight;              // 728.504
layout.leading(11);                // 14.520000000000001 (1.32 × 11, floating point)
layout.sizeFor('heading', 1);      // 22
layout.sizeFor('code');            // 9.5

try {
    oconvPdfBox.resolveLayout({ bogus: true });
} catch (e) {
    e.message;  // 'oconv: bad pdf option bogus'
}
```

Executed against the live package (2026-10-06): values exactly as shown
above, `e.message === 'oconv: bad pdf option bogus'`.

## Notes

- **`fonts` is accepted-and-ignored here** (`FORWARDED_KEYS`): it carries
  the caller's embedded font bytes and is consumed by
  [`pdf/metrics`](./metrics.md)`.createMeasurer({fonts})` (the embedded-font route), not
  by geometry. Listing it here is what lets the facade forward ONE object
  to ONE validator — every other key outside `DEFAULTS` throws.
- **Full `opts.pdf` table** (key, type, default, exact error literal) is on
  [`pdf-writer.md`](../../../pdf-writer.md) — restated in the
  [`ir-to-pdf`](../ir-to-pdf.md) API section too; not duplicated a third
  time here.
- `margin` validation is BOTH a lower bound (`≥ 0`) and an upper bound tied
  to page size (`2·margin < min(pageWidth, pageHeight)`) — a margin that
  would leave zero or negative column width throws `oconv: bad pdf option
  margin`, not a silent empty column.
- `pageSize` accepts either a named size (`'A4'`/`'Letter'`) or an explicit
  `[width, height]` pair of positive numbers, in points — anything else
  (a third array length, a non-positive number, an unknown name) throws
  `oconv: bad pdf option pageSize`.
- Pure module, `dependencies: []`: no I/O, no `@awacloud/*` coupling.
  Capture-free (`fw/no-factory-capture`) — every constant is declared in
  the factory body, so the descriptor survives Worker serialization and the
  standalone builder's `factory.toString()` inlining.

## See also

- [`ir-to-pdf`](../ir-to-pdf.md) — the sole caller, which forwards the
  whole `opts.pdf` block here.
- [`pdf/metrics`](./metrics.md) — consumes the `fonts` key this module
  forwards untouched.
- [`pdf/stack`](./stack.md) — reads `layout.leading`/`layout.sizeFor`/
  `layout.column`/`layout.contentHeight` during flow and page stacking.
- [`pdf-writer.md`](../../../pdf-writer.md) — the audience-facing `opts.pdf`
  reference, including every validation error literal.
