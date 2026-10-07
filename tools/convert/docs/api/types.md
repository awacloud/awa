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
}
```

## `ToMdOutput`

```ts
interface ToMdOutput {
    error: null;
    markdown: string;
    losses: Loss[];
    lossy: boolean;
}
```

## `ToMdResult`

```ts
type ToMdResult = CoreError | ToMdOutput;
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
