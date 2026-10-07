# `isCoreError`

Type guard that tells a failed result from a successful one.

```ts
function isCoreError(v: { error: string | null }): v is CoreError
```

## Input

Any result returned by [`toMd`](./toMd.md), [`fromMd`](./fromMd.md),
[`convert`](./convert.md) or [`toHtml`](./toHtml.md).

## Output

`true` when `v.error` is not `null`. TypeScript then narrows `v` to
[`CoreError`](./types.md#coreerror); in the `false` branch it narrows to the
operation's output type.

## Errors

None. It only reads `v.error`.

## Example

```ts
import { fromMd, isCoreError } from '@awacloud/tool-convert';

for (const target of ['pdf', 'xlsx']) {
    const result = await fromMd({ markdown: '# x', target });
    if (isCoreError(result)) {
        console.log('failed:', result.error, 'usage:', result.usage);
    } else {
        console.log('ok:', result.target, result.bytes.byteLength > 0);
    }
}
```

Output:

```text
ok: pdf true
failed: oconv: unsupported target (supported: docx, odt, pdf) usage: true
```
