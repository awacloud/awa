# `toHtml`

Renders Markdown to an HTML fragment through `@awacloud/md`'s `md` facade
(`renderHtml`).

```ts
function toHtml(input: ToHtmlInput): Promise<ToHtmlResult>
```

The output is a plain fragment. It has no `<html>` wrapper, no embedded CSS
and no table of contents.

The render is **safe and sanitised**, whatever md's own defaults are: raw
HTML is dropped (a raw block with its content; inline tags keep their
text), `javascript:`, `vbscript:`, `file:` and `data:` URLs (images
included) are neutralised to an empty `href`/`src`, and the fw sanitiser
then runs over the fragment with its default allowlist plus disabled
task-list checkboxes. Fenced code, Mermaid included, stays escaped text.
Task-list items keep their checkbox, as a disabled `input` carrying
`checked` when ticked. Footnotes, front matter and math are not
interpreted.

## Input — [`ToHtmlInput`](./types.md#tohtmlinput)

| Field | Type | Required | Meaning |
|---|---|---|---|
| `markdown` | `string` | yes | The Markdown source. |

## Output — [`ToHtmlResult`](./types.md#tohtmlresult)

On success, a [`ToHtmlOutput`](./types.md#tohtmloutput):

| Field | Type | Meaning |
|---|---|---|
| `error` | `null` | Marks success. |
| `html` | `string` | The HTML fragment. |

The result has no `losses` field: the render drops content (above) but does
not itemise it.

On failure, a [`CoreError`](./types.md#coreerror). The function never
throws.

## Errors

| `error` | `usage` | Cause |
|---|---|---|
| `internal/descriptor: …` | `false` | A module descriptor from `@awacloud/md` is malformed (packaging defect). |
| any message thrown by the renderer | `false` | The renderer failed. |

## Example

```ts
import { toHtml } from '@awacloud/tool-convert';

console.log(JSON.stringify(await toHtml({ markdown: '# Hello\n\nA *short* note.\n' })));
```

Output:

```text
{"error":null,"html":"<h1>Hello</h1>\n<p>A <em>short</em> note.</p>\n"}
```

See also: [`to-html`](./cli.md#to-html) (CLI), [`to_html`](./mcp.md#to_html) (MCP).
