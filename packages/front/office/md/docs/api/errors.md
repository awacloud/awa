---
module: mdErrors
category: md
dependencies: []
returns: object
worker-safe: true
status: complete
---

# mdErrors

> Typed error hierarchy — `MdError` + `ParseError` + `RenderError` + `ContractError`.

**Module** `mdErrors` | **Source** `packages/front/office/md/src/errors.js` | **Deps** none | **Worker-safe** yes

Every error thrown by `@awacloud/md` extends `MdError` and carries a kebab-case `code` (`'md/parse-not-string'`, `'md/render-invalid-root'`, …). Consumers can match on the code rather than the message.

### Stable codes

| Code | Class | Thrown by | Meaning |
|------|-------|-----------|---------|
| `md/parse-not-string` | `ContractError` | `md.parse`, `blockParser.parse` | Non-string input argument |
| `md/use-bad-extension` | `ContractError` | `md.use` | Extension without `install(md)` |
| `md/render-invalid-root` | `RenderError` | `renderHtml`, `renderMarkdown`, `renderXml` | Missing or non-object AST root |
| `md/replace-node-no-parent` | `ContractError` | `replaceNode` | `oldNode` is detached |
| `md/wrap-node-no-parent` | `ContractError` | `wrapNode` | `node` is detached |
| `md/flatten-node-no-parent` | `ContractError` | `flattenNode` | `node` is detached |
| `md/limit-exceeded` | `ContractError` | `md.parse` | `maxDepth` / `maxNodes` / `maxUrlLength` exceeded |
| `md/parse-error` | `ContractError` | `blockCursor.incorporateLine` (internal invariant) | A block `continue` rule returned an illegal value |
| `md/document-bad-input` | `ContractError` | `mdHtmlDocument.renderFragment`, `mdHtmlDocument.build` | `documents` empty / entry without string `path`+`source` |
| `md/document-bad-option` | `ContractError` | `mdHtmlTheme.css`, `mdHtmlDocument.build` | Unknown `theme`, or an invalid `mdHtmlDocument.build` option |

Invalid input arguments (`null`/`undefined` objects passed to `replaceNode`/`wrapNode`/`cloneNode`) throw a native `TypeError`. That is a deliberate choice, aligned with the JavaScript convention for trivially-violable argument preconditions.

## Resolve

`mdErrors` has **no dependencies** — its classes are declared inside the factory body (kept serialisable to a Worker via `factory.toString()`). Two consumption modes:

```js
// 1. Via a ModuleRuntime — worker-safe, and the canonical mode: every
//    other @awacloud/md module (`mdMod`, `blockParser`, `renderHtmlMod`,
//    `renderMarkdownMod`, `renderXmlMod`, `mdAstManipulation`) receives
//    this SAME resolved `mdErrors` instance as its first dependency, so
//    `instanceof` checks agree package-wide:
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const { MdError, ParseError, RenderError, ContractError, isMdError } = runtime.resolve('mdErrors');

// 2. Direct factory call — an isolated instance, no runtime needed
//    (`mdErrors` has zero dependencies of its own):
import { mdErrors } from '@awacloud/md';
const { MdError, ParseError, RenderError, ContractError, isMdError } = mdErrors.factory();
```

> `@awacloud/md`'s package root (`src/main.js`) is a strict descriptor
> manifest: it exports the `modules`/`extras`/`bundle`/`fw_require`
> arrays plus every module descriptor by binding name (`mdErrors`,
> `mdCommon`, …) — it never materializes or re-exports the error
> *classes* themselves. There is no `import { MdError } from '@awacloud/md'`;
> the classes only exist after `mdErrors.factory()` runs, either
> directly (mode 2 above) or through a `ModuleRuntime` (mode 1). A
> consumer that calls another module's factory manually (e.g.
> `blockParser.factory(...)`) must pass its own `mdErrors.factory()`
> result as the first argument, to keep a consistent class identity
> between that module and the consumer.

## API

| Class | Thrown when |
|-------|-------------|
| `MdError` | Base — never thrown directly |
| `ParseError` | Malformed input (rare in Markdown: the spec accepts anything) |
| `RenderError` | Invalid AST encountered while rendering |
| `ContractError` | Contract violation (wrong type, missing field) |
| `isMdError(e)` | `(e) => boolean` |

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Class name (`'ParseError'`, etc.) |
| `code` | `string` | Kebab-case identifier (`'md/parse-not-string'`) |
| `message` | `string` | Human-readable message |
| `context` | `object?` | Structured data (optional) |
| `cause` | `Error?` | Parent error (optional) |

## Examples

### Typed catch

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const { MdError, ContractError } = runtime.resolve('mdErrors');
const { createMd } = runtime.resolve('md');

try {
    createMd().parse(123);
} catch (e) {
    if (e instanceof ContractError) console.log(e.code); // 'md/parse-not-string'
    if (e instanceof MdError)       console.log(e.name);
}
```

### With context

```js
const { RenderError } = runtime.resolve('mdErrors');
const node = { type: 'mystery', sourcepos: null };

try {
    throw new RenderError('md/render-invalid-root', 'Unknown node type', {
        context: { type: node.type, sourcepos: node.sourcepos }
    });
} catch (e) {
    e.code;      // 'md/render-invalid-root'
    e.context;   // { type: 'mystery', sourcepos: null }
}
```

## Notes

- `MdError` is never thrown directly — always a subclass.
- The code follows the `'md/<kebab-case>'` format, for consistency with `@awacloud/fw` errors.
- Renderers use `RenderError` to signal a corrupted AST (a node missing `literal`, an unknown type).
- `ContractError` is reserved for API violations by the caller (typically a wrong argument type).
- `tests/errors-doc-snapshot.test.js` locates the table above by splitting on the exact `### Stable codes` heading — renaming that heading requires updating the test's anchor string in the same change.

## See also

- [`md`](./md.md) — the facade that throws `ContractError` on non-string input
- [`render/html`](./render/html.md) — throws `RenderError`
- [`@awacloud/fw` errors](https://github.com/awacloud/awa/tree/@awacloud/md@1.0.0/packages/front/fw/docs/api) — the framework's own error pattern
