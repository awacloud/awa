# Types and constants

All of these are exported from `src/core.ts`, the package's `.` export.

## Constants

Read-only lists of what `@awacloud/oconv` supports. They are used for the
hint appended to an "unsupported" error message and for help text. They
never gate a request: validation is `@awacloud/oconv`'s own.

| Constant | Value |
|---|---|
| `TO_MD_FORMATS` | `['docx', 'odt', 'xlsx', 'ods', 'pptx', 'odp', 'pdf']` |
| `FROM_MD_TARGETS` | `['docx', 'odt', 'pdf']` |
| `CONVERT_PAIRS` | `['docx>odt', 'odt>docx', 'docx>pdf', 'odt>pdf']` |

```ts
import { TO_MD_FORMATS, FROM_MD_TARGETS, CONVERT_PAIRS } from '@awacloud/tool-convert';
console.log(JSON.stringify({ TO_MD_FORMATS, FROM_MD_TARGETS, CONVERT_PAIRS }));
// {"TO_MD_FORMATS":["docx","odt","xlsx","ods","pptx","odp","pdf"],"FROM_MD_TARGETS":["docx","odt","pdf"],"CONVERT_PAIRS":["docx>odt","odt>docx","docx>pdf","odt>pdf"]}
```

## `Loss`

One fidelity loss, in document order: reader losses first, then writer
losses.

```ts
interface Loss {
    code: string;
    detail: string | Record<string, unknown>;
    index?: string;
    kind?: string;
}
```

| Field | Meaning |
|---|---|
| `code` | Namespaced code, e.g. `block/dropped`, `image/dropped`, `list/task-marker-dropped`, `layout/image-dropped`, `layout/line-overflow`. |
| `detail` | A string for most losses. An object for the PDF writer's layout losses. |
| `index` | PDF writer losses only: the index of the block the loss refers to. |
| `kind` | PDF writer losses only: the block kind (`paragraph`, `image`, …). |

Measured examples (`fromMd`):

```json
{ "code": "block/dropped", "detail": "html_block" }
{ "code": "image/dropped", "detail": "pic.png" }
{ "index": "1.i0", "kind": "image", "code": "layout/image-dropped",
  "detail": { "index": "1.i0", "name": "pic.png", "alt": "alt", "reason": "no-bytes", "bytes": 0 } }
```

The first two come from a `docx` target. The third comes from a `pdf`
target given `![alt](pic.png)` with no image bytes.

## `LossSummaryEntry`

One entry of a result's `lossSummary`: a distinct `code` + `detail` of
`losses`, and how many times it occurs.

```ts
interface LossSummaryEntry {
    code: string;
    detail: string | Record<string, unknown>;
    count: number;
}
```

| Field | Meaning |
|---|---|
| `code` | As in [`Loss`](#loss). |
| `detail` | As in [`Loss`](#loss): the first occurrence's own value. A string is compared as is, an object by its JSON form. |
| `count` | How many entries of `losses` have this `code` and `detail` (at least 1). |

Entries keep the order in which each first occurs. A PDF loss's `index`
and `kind` are not part of the key and are not copied: the summary says
what was lost and how often, `losses` says where. A lossless result has
`lossSummary: []`. Measured (`fromMd`, `docx` target, two raw HTML
blocks and one inline `<br>`):

```json
[{ "code": "block/dropped", "detail": "html_block", "count": 2 },
 { "code": "inline/dropped", "detail": "html_inline", "count": 1 }]
```

## `CoreError`

Returned in place of an output when an operation fails. See
[`isCoreError`](./isCoreError.md).

```ts
interface CoreError {
    error: string;
    usage: boolean;
}
```

| Field | Meaning |
|---|---|
| `error` | The message. Unsupported format, target and pair messages end with the supported list. |
| `usage` | `true` for a caller mistake: an unsupported format, target or pair. The CLI exits `2` for these and `1` otherwise. |

## `ToMdInput`

Input of [`toMd`](./toMd.md).

```ts
interface ToMdInput {
    name: string;
    bytes: Uint8Array;
    convertedAt: string;
    format?: string;
    includeNotes?: boolean;
    sheets?: string;   // 'table' | 'csv' | 'tsv', xlsx/ods only
    formOpBudget?: number;              // pdf only
    pdfInfer?: string[];                // pdf only: 'headings', 'tables', 'running'
    pdfDeclare?: string[];              // pdf only: 'positional'
    pdfInclude?: string[];              // pdf only: 'images'
    pdfPassword?: string | Uint8Array;  // pdf only
    pdfRecoverXref?: boolean;           // pdf only
    pdfLineHyphens?: string;            // pdf only: 'drop' | 'keep'
    odtInclude?: string[];              // odt only: 'toc'
    docxInclude?: string[];             // docx only: 'toc'
    sheetCellBudget?: number;           // xlsx/ods only
    archiveLimits?: ArchiveLimits;      // office formats only
    outputBudget?: OutputBudget;        // every format
    opts?: { frontMatter?: string };    // 'full' | 'compact' | 'none'
}
```

## `ArchiveLimits`

`ToMdInput.archiveLimits`: any of the office readers' archive limits,
each a non-negative integer (`0` disables that check). odt, ods and odp
take the first three.

```ts
interface ArchiveLimits {
    maxParts?: number;
    maxUncompressed?: number;
    maxRatio?: number;
    maxDepth?: number;
}
```

## `OutputBudget`

`ToMdInput.outputBudget`: past `bytes` of text (UTF-8, checked before the
markdown is built), `'throw'` (the default) fails with `oconv: output too
large`, `'truncate'` keeps what fits and records `doc/truncated`.

```ts
interface OutputBudget {
    bytes: number;
    overflow?: 'throw' | 'truncate';
}
```

## `ToMdOutput`

```ts
interface ToMdOutput {
    error: null;
    markdown: string;
    losses: Loss[];
    lossSummary: LossSummaryEntry[];
    lossy: boolean;
    assets: Asset[];
}
```

## `ToMdResult`

```ts
type ToMdResult = CoreError | ToMdOutput;
```

## `Asset`

One entry of the asset manifest of a [`ToMdOutput`](#tomdoutput): an image
the markdown references by `name`, in document order, one entry per name.
`bytes` is present when the reader captured the image (a docx, odt or pptx
picture; a pdf picture under `pdfInclude: ['images']`).

```ts
interface Asset {
    kind: string;       // 'image'
    name: string;
    bytes?: Uint8Array;
}
```

## `SkippedAsset`

An asset [`assetFiles`](./assetFiles.md) will not write, and why.

```ts
interface SkippedAsset {
    name: string;
    reason: 'no bytes' | 'unsafe name';
}
```

## `FromMdInput`

Input of [`fromMd`](./fromMd.md).

```ts
interface FromMdInput {
    markdown: string;
    name?: string;
    target?: string;
}
```

## `FromMdOutput`

```ts
interface FromMdOutput {
    error: null;
    bytes: Uint8Array;
    target: string;
    losses: Loss[];
    lossSummary: LossSummaryEntry[];
    lossy: boolean;
}
```

## `FromMdResult`

```ts
type FromMdResult = CoreError | FromMdOutput;
```

## `ConvertInput`

Input of [`convert`](./convert.md).

```ts
interface ConvertInput {
    bytes: Uint8Array;
    name?: string;
    format?: string;
    target: string;
}
```

## `ConvertOutput`

```ts
interface ConvertOutput {
    error: null;
    bytes: Uint8Array;
    format: string;
    target: string;
    losses: Loss[];
    lossSummary: LossSummaryEntry[];
    lossy: boolean;
}
```

## `ConvertResult`

```ts
type ConvertResult = CoreError | ConvertOutput;
```

## `ToHtmlInput`

Input of [`toHtml`](./toHtml.md).

```ts
interface ToHtmlInput {
    markdown: string;
}
```

## `ToHtmlOutput`

```ts
interface ToHtmlOutput {
    error: null;
    html: string;
}
```

## `ToHtmlResult`

```ts
type ToHtmlResult = CoreError | ToHtmlOutput;
```
