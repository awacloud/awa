---
module: odfErrors
category: odf/errors
dependencies: []
returns: object
worker-safe: true
status: complete
---

# odfErrors

> Package's typed error hierarchy — `OdfError` + `ParseError` / `RenderError` / `ContractError`.

**Module** `odfErrors` | **Source** `packages/front/office/odf/src/errors.js` | **Deps** none | **Worker-safe** yes

Every `throw` in the package uses these classes with a stable kebab-case `code` and a structured `context`.

The classes are declared **inside the factory body** — so the factory
stays a self-contained closure serializable to a Worker via
`factory.toString()`. **No class is exported at the top level**: the
only way to obtain `ParseError` (etc.) is through the `odfErrors`
factory.

## Resolve (via ModuleRuntime)

```js
const errors = runtime.resolve('odfErrors');
const { OdfError, ParseError, RenderError, ContractError, isOdfError } = errors;
```

## Resolve (direct factory, outside the runtime)

```js
import { odfErrors } from '@awacloud/odf/errors';
const { OdfError, ParseError } = odfErrors.factory();
```

This is also the pattern used by the package's other consumer
factories: the first positional parameter of any factory that can
`throw` is the `odfErrors` object (other dependencies follow). To
manually instantiate a consumer factory outside the runtime:

```js
const otherModule = someModule.factory(odfErrors.factory(), /* …deps */);
```

## API

| Member | Role |
|--------|------|
| `OdfError` | Base class — `{ code, message, context?, cause? }`. |
| `ParseError` | Malformed input encountered while reading. |
| `RenderError` | Serialization impossible (invalid model). |
| `ContractError` | API contract violated by the consumer. |
| `isOdfError(e)` | Type guard — `true` if `e instanceof OdfError`. |

## Examples

```js
const { OdfError } = runtime.resolve('odfErrors');
const odt = runtime.resolve('odt');

try { odt.read(bytes); }
catch (e) {
    if (e instanceof OdfError) console.log(e.code, e.context);
    else throw e;
}
```

## Notes

- The base constructor takes `(code, message, { context, cause })`.
- `e.name` reflects the subclass (`ParseError`, etc.).
- No fixed internal `code` — each throw site chooses its own (e.g. `'odf/parse-error'`).
- **Breaking**: `ParseError` / `RenderError` / `ContractError` /
  `OdfError` are no longer re-exported at the top level from
  `@awacloud/odf`. Always go through `odfErrors.factory()` or
  `runtime.resolve('odfErrors')`.

## See also

- [pkg/package](./pkg/package.md) — first consumer.
