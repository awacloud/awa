# API reference

The public surface of `@awacloud/tool-convert` has three parts. This
directory mirrors all of it. `tests/docs-mirror.integration.test.ts` fails
when an export, a CLI verb or an MCP tool has no page or section here.

## Core — `import … from '@awacloud/tool-convert'` (`src/core.ts`)

| Export | Kind | Page |
|---|---|---|
| `toMd` | function | [toMd.md](./toMd.md) |
| `fromMd` | function | [fromMd.md](./fromMd.md) |
| `convert` | function | [convert.md](./convert.md) |
| `toHtml` | function | [toHtml.md](./toHtml.md) |
| `isCoreError` | function | [isCoreError.md](./isCoreError.md) |
| `TO_MD_FORMATS`, `FROM_MD_TARGETS`, `CONVERT_PAIRS` | constants | [types.md](./types.md#constants) |
| `Loss`, `CoreError`, `ToMdInput`, `ToMdOutput`, `ToMdResult`, `FromMdInput`, `FromMdOutput`, `FromMdResult`, `ConvertInput`, `ConvertOutput`, `ConvertResult`, `ToHtmlInput`, `ToHtmlOutput`, `ToHtmlResult` | types | [types.md](./types.md) |

## CLI — `src/index.ts`

[cli.md](./cli.md): the verbs `to-md`, `from-md`, `convert` and `to-html`,
the flags, the stdout/stderr contract and the exit codes.

## MCP server — `src/mcp.ts`

[mcp.md](./mcp.md): the transport, the tools `to_md`, `from_md`, `convert`
and `to_html`, the large-output rule and the error payloads.

## Conventions used on these pages

- Every example was run, and its output is quoted as printed. Long base64
  strings and long Markdown strings are shortened with `…`.
- The fixture `tests/fixtures/sample.docx` is 1,556 bytes: three headings
  and three short paragraphs.
- Commands are run from the package directory.
- For brevity, core examples read output fields without first calling
  [`isCoreError`](./isCoreError.md). Typed code must narrow the result
  first.
