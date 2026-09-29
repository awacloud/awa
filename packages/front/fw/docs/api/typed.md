---
module: typed
category: (root)
dependencies: [runtime]
returns: object
worker-safe: true
status: complete
---

# typed — typed-runtime facade (`@awacloud/fw/typed`)

> Two entry points giving `resolve`/`resolveAll` a type narrowed by module
> name, without changing the runtime's actual behavior.

**Module** `typed` | **Source** `packages/front/fw/src/typed.js` | **Deps** `runtime` | **Worker-safe** yes (pure functions; `createRuntime` only constructs a `ModuleRuntime`)

## Resolve

```js
import { asTyped, createRuntime } from '@awacloud/fw/typed';
```

Not a DI module — imported directly by subpath, like `sanity/lockdown`.

## API

Exactly the two exports of `src/typed.js`:

| Export | Signature | Returns |
|---|---|---|
| `asTyped` | `(runtime: *) => *` | identity cast — re-types an existing `ModuleRuntime` at the type level; no runtime effect |
| `createRuntime` | `(modules?: *) => *` | builds a fresh `ModuleRuntime`, deep-registers `modules` (via `registerAllDeep`, so transitive `deps` come along) when provided, and returns it typed |

`createRuntime`'s `modules` argument accepts either an array of module
definitions or a namespace object whose values are module definitions (the
shape of `@awacloud/fw/core/modules`).

**Narrowing caveat** (quoted from `src/typed.js`'s file header): *"`resolve`
is typed against the FULL catalog, not against what you actually
registered (module `name` is `string` in the emitted `.d.ts`, not a
literal, so the registered set can't be tracked at the type level). Only
call `resolve(name)` for modules you injected — resolving an unregistered
name type-checks but throws 'Module not found' at runtime."*

## Types

The precise return types live in `types/typed.d.ts` plus the generated
`types/registry.generated.d.ts` (module-name → instance-shape map), rebuilt
with:

```bash
bun run types:registry
```

## Examples

```js
import { createRuntime } from '@awacloud/fw/typed';
import modules from '@awacloud/fw/core/modules';

const rt = createRuntime(modules);
const hex = rt.resolve('hex'); // narrowed to hex's instance shape
```

```js
import { runtime } from '@awacloud/fw';
import { asTyped } from '@awacloud/fw/typed';

const typedRuntime = asTyped(runtime); // same instance, typed
```

## Notes

- `asTyped` imports nothing; `createRuntime` pulls in `ModuleRuntime`.
  Consumers using only `asTyped` tree-shake `createRuntime` (and
  `ModuleRuntime`) away.
- Both exports are runtime no-ops beyond `createRuntime`'s actual
  registration work — the typing value is entirely at the TypeScript level,
  resolved via `types/typed.d.ts` and the generated registry map.

## See also

- [TypeScript guide](../guide/typescript.md)
- [runtime](./core/runtime.md) — the `ModuleRuntime` class both exports wrap
- [main](./core/main.md) — the default `@awacloud/fw` entry point
