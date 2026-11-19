---
module: pdfPageText
category: pdf/extra
dependencies: [pdfErrors, pdfResources, pdfFilterDispatch, pdfContentStream, pdfFontDecoder]
returns: object
worker-safe: true
status: complete
---

# pdfPageText

> A page's text (an opt-in extra) — its positioned runs, and its plain text.

**Module** `pdfPageText` (`pdfPageText`) | **Source** `packages/front/office/pdf/src/extra/page-text.js` | **Deps** `pdfErrors`, `pdfResources`, `pdfFilterDispatch`, `pdfContentStream`, `pdfFontDecoder` | **Worker-safe** yes

Walks a page's content streams with a minimal text and graphics state and returns one positioned run per show operator, in content-stream order, with the walk's counts and its text losses. Form XObjects are executed in place, under three guards. `pageText` joins the runs into lines. Characters and glyph widths are [`pdfFontDecoder`](./font-decoder.md)'s. The walk is the page walk of `@awacloud/oconv`'s pdf reader without its layout opt-ins (rules, pictures): on 5,217 pages of 1,678 PDFs, its runs, counts and text losses equal that reader's.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules, extras } from '@awacloud/pdf';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(pkg_require);
runtime.registerAll(modules);
runtime.registerAll(extras);
const { extractPage, pageText } = runtime.resolve('pdfPageText');
```

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `extractPage` | `(page: object, resolve: (ref) => object, opts?: {formOpBudget?, cellKerns?, visit?}) => {runs, counts, losses}` | `runs`: `[{ text, x, y, xEnd, fontSize, bold, mcid }]`; `counts`: `{ operators, decoded, undecodable }`; `losses`: `[{ code, detail }]` | `ContractError` `pdf/page-text/bad-form-op-budget`, `pdf/page-text/bad-visit` |
| `pageText` | `(page: object, resolve: (ref) => object, opts?: {formOpBudget?, cellKerns?, visit?}) => string` | the runs joined into lines, `\n` between lines | as `extractPage` |

`page` is a typed page (`pdf.read(bytes).pages[i]`), `resolve` the document's resolver (`doc._raw.resolve`).

## Options

| Option | Default | Effect |
|---|---|---|
| `formOpBudget` | 1,000,000 | the operators a page may run inside Form XObjects; later form draws are skipped (`xobject/form-budget`). A safe integer ≥ 1, else `pdf/page-text/bad-form-op-budget`. |
| `cellKerns` | `false` | a `TJ` with 2 or more adjustments of more than 1 em to the right between drawn strings is cut there, one run per part (a table row drawn as one `TJ`). |
| `visit` | none | `(op, ctx) => void`, called for every operator the walk runs (the page's and the forms'), before the walk applies it. `ctx` = `{ ctm, mcid, resources, depth, runCount, lossCount }`. Not a function: `pdf/page-text/bad-visit`. |

## Examples

### A page's plain text

```js
const doc = runtime.resolve('pdf').read(bytes);
const text = doc.pages.map((page) => pageText(page, doc._raw.resolve)).join('\n');
```

### Runs, and a caller's own items among them

```js
const pictures = [];
const visit = (op, ctx) => {
    if (op.op === 'Do' || op.op === 'BI') pictures.push({ before: ctx.runCount, mcid: ctx.mcid, ctm: ctx.ctm });
};
const { runs, losses } = extractPage(doc.pages[0], doc._raw.resolve, { visit });
// runs[i] = { text, x, y, xEnd, fontSize, bold, mcid }; a picture falls before runs[before].
```

## Notes

- **Placement.** `x`/`y` is the run's start and `xEnd` the x where it ends, in the page's device space. `fontSize` is the font size scaled by the text and current matrices. Each show advances the text matrix by the string's displacement (ISO 32000-2 §9.4.4): Σ ((w0 / 1000) × Tfs + Tc + (Tw if the code is single-byte 32)) × Th; a `TJ` number n moves it by −n / 1000 × Tfs × Th. A vertical-mode font and a show under an unresolved font advance nothing.
- **`q`/`Q`** save and restore the font and its size, the leading, `Tc`, `Tw` and `Tz` with the CTM (ISO 32000-2 §8.4.1): text after a `q … Tf … Q` is shown in the font set before the `q`. A `Q` with nothing saved keeps the font in force.
- **Word spaces in a `TJ`.** An adjustment of more than 0.15 em to the right is one space between the strings around it, never doubled.
- **`mcid`** is the innermost marked-content id in scope, the key to the structure tree's content items, or `null`.
- **Form XObjects** run under their `/Matrix` and their own `/Resources` (the page's when they have none). The state is restored on return, even after an unbalanced `Q` or `EMC` in the form. A form already running is not re-entered (`xobject/form-cycle`); nesting stops at 12 forms (`xobject/form-depth`); the operator budget above (`xobject/form-budget`, once per page).
- **Image draws** are no loss of text and are not recorded; a caller that keeps pictures sees them through `visit` (`Do` of a non-form XObject, `BI`).
- **`visit`'s `ctx`.** `ctm` and `mcid` are in force at the operator. `resources` is the typed map in force: the page's, or the form's inside a form; `null` when the page's failed to type. `depth` is the form nesting (0 on the page). `runCount` is the number of runs so far, `lossCount` the number of losses so far: a caller's own items and losses fall in order among the walk's. `ctx` and its values are the walk's own: read-only, valid during the call. What the visitor throws reaches the caller.
- **`pageText`'s lines.** A run joins the current line when its baseline is within 0.5 × its font size of the line's first baseline (the line's size when the run has none, at least 0.5). A run that repeats the previous run of its line (same text, within 0.5 in x and y) is dropped. One space goes between two runs when the next starts more than 0.15 em right or left of the previous one's end and neither side is whitespace — never on a line whose runs go backwards. Lines are trimmed, blank ones dropped. It is the line pass of `@awacloud/oconv`'s paragraph grouping.

## Loss codes

| Code | Meaning |
|---|---|
| `text/undecodable` | ≥1 char code of a show resolved to no Unicode (detail = count) |
| `text/font-unresolved` | a `Tf` named a font absent from the resources or whose dict failed to type; that show's bytes are counted undecodable |
| `text/width-approximated` | a font's widths could not be read and a fallback placed its text; once per font per page (detail = the resource name) |
| `xobject/form-dropped` | a Form XObject whose stream cannot be used; detail = `<name>: not a stream`, `undecodable stream` or `unparsable stream` |
| `xobject/form-cycle` | a Form XObject drawn from inside itself, not re-entered (detail = the resource name) |
| `xobject/form-depth` | a Form XObject nested deeper than 12 forms, not executed (detail = the resource name) |
| `xobject/form-budget` | the page ran `formOpBudget` operators inside forms; later form draws skipped, once per page (detail = the first skipped name) |
| `content/undecodable` | a page content stream failed to resolve, decode or parse and is skipped; detail = `stream <objNum>: <cause>` (one line, at most 160 characters) |

## See also

- [`pdfFontDecoder`](./font-decoder.md) — the decoder this walk uses
- [`pdfContentStream`](../content/stream.md) — the content-stream parser
- [Extras index](./README.md)
