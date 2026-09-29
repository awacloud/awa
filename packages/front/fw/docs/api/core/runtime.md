---
module: runtime
category: core
dependencies: []
returns: class
worker-safe: partial
status: complete
---

# ModuleRuntime

> Framework DI engine: registry, lazy resolution, singleton cache, **native multi-version**, worker serialisation.

**Module** `runtime` | **Source** `packages/front/fw/src/core/runtime.js` | **Deps** none | **Worker-safe** partial (class injected into workers via `runtimeSource`)

## Resolve

```js
// Not resolved via runtime — directly accessible from the fw object:
import fw from './fw/main.js';
const { runtime } = fw;

// Or manual instantiation:
import { ModuleRuntime } from './fw/src/core/runtime.js';
const rt = new ModuleRuntime();
```

## Key concepts

### Module spec

A **spec** is either:
- `'foo'` — resolves to the **highest registered version** of `foo`
- `'foo@1.2.3'` — resolves to the **exact version** (canonical name)

A module's `dependencies` can mix both forms:
```js
dependencies: ['hex', 'utf8@1.0.0', 'lz4']
```

### Multi-version

Multiple versions of the same `name` can coexist:
```js
runtime.register({ name: 'foo', version: '1.0.0', dependencies: [], factory: () => 'v1' });
runtime.register({ name: 'foo', version: '2.0.0', dependencies: [], factory: () => 'v2' });

runtime.resolve('foo');                        // → 'v2' (latest)
runtime.resolve('foo@1.0.0');                  // → 'v1'
runtime.resolve('foo', { version: '1.0.0' });  // → 'v1'
```

The "latest" selection is precomputed at register time: `resolve('foo')` remains **O(1)**.

### Validation at register

| Field | Validation | If absent |
|---|---|---|
| `name` | required (truthy) | throw `Invalid module definition` |
| `factory` | required (truthy) | throw `Invalid module definition` |
| `version` | semver regex `MAJOR.MINOR.PATCH[-pre][+build]` | default `'0.0.0'` |
| `type` | regex `^(fw\|sd\|sde\|sdc\|lib)\.[a-z][\w.]*$` | accepted absent |
| `dependencies` | list of specs | default `[]` |

## API

### `runtime.register(module)`

Registers a module. Chainable. A re-registered `(name, version)` pair overwrites the previous. Multiple `version` values of the same `name` coexist.

```js
runtime.register(myModule);

// Chaining
runtime.register(modA).register(modB);

// Multi-version
runtime
  .register({ name: 'codec', version: '1.0.0', dependencies: [], factory: () => v1 })
  .register({ name: 'codec', version: '2.0.0', dependencies: [], factory: () => v2 });
```

| Param | Type | Description |
|-------|------|-------------|
| `module` | `ModuleDefinition` | Object `{ name, version?, type?, dependencies, factory }` |

**Throws:**
- `Invalid module definition` — `name` or `factory` missing
- `Invalid version "<v>" for module "<name>"` — `version` does not match semver
- `Invalid type "<t>" for module "<name>"` — `type` does not match the taxonomy

Returns: `this` (chainable).

> **Re-registration is descriptor-only.** Overwriting a `(name, version)` pair
> swaps the stored definition; it does **not** touch the `instances` cache. A
> module already resolved under that pair keeps returning the **old** instance,
> and so does every later `resolve()` — `unregister()` followed by `register()`
> behaves the same way. Bumping `version` self-invalidates the module (the cache
> is keyed `name` → `version` → instance) but does **not** refresh dependents
> that already hold a resolved handle: handles once handed out are never
> upgraded. Build hot-invalidation on top of the public `instances` map and
> `list()`'s dependency data; `{ isolation: true }` instances are never cached.

---

### `runtime.registerAll(modules)`

Registers an array of definitions in a single operation. Equivalent to calling `register()` for each entry. Chainable.

```js
import netModules from '/dist/build/fw.pack.realtime.pure.min.js';
runtime.registerAll(netModules);

// Chaining
runtime
  .registerAll(coreModules)
  .registerAll(extraModules)
  .register(customMod);
```

| Param | Type | Description |
|-------|------|-------------|
| `modules` | `ModuleDefinition[]` | Array of definitions to register in order |

Returns: `this` (chainable).

**Typical use**: consuming the **module packs** produced by the prebuild in pure mode (`fw.pack.<group>.pure.min.js` exports `default [m1, m2, …]`). See [docs/tools/bundler.md](../../tools/bundler.md).

---

### `runtime.registerDeep(module)`

Registers `module` **along with all its transitive dependencies** declared via its `deps` field (direct JS references). Works depth-first and registers each missing module on the return path, guaranteeing the dependencies-before-dependants order expected by `resolve`. Chainable.

```js
import { sanitize } from '@awacloud/fw/dom/rendering/sanitize.js';
runtime.registerDeep(sanitize);
// → registers sanitize + parser + render + secPolicy + ...
const s = runtime.resolve('sanitize');
```

| Param | Type | Description |
|-------|------|-------------|
| `module` | `ModuleDefinition & { deps?: ModuleDefinition[] }` | Module whose `deps` field (JS references) will be traversed |

**Behaviour:**
- Idempotent — a module `(name, version)` already registered is skipped.
- Cycle-safe via a `Set` of visited nodes shared per call (key: `module.name`).
- `deps` is **only** the bundler-friendly counterpart of `dependencies` (strings). Resolution is still driven by `dependencies`; `deps` simply allows Rollup/Vite/esbuild to trace the graph via JS `import` statements.
- **Invariant** (validated at build): `module.deps.map(d => d.name)` = `module.dependencies.map(s => s.split('@')[0])`.
- `serialize` does **not** embed `deps` (only `dependencies`) — the worker-side closure is still computed from the canonical form.

Returns: `this` (chainable).

---

### `runtime.registerAllDeep(modules)`

Equivalent to `registerDeep` applied to each entry of the array. Shares a visited `Set` to avoid re-traversing common dependencies. Chainable.

```js
import modules from '@awacloud/fw/core/modules.js';
runtime.registerAllDeep(modules);
```

| Param | Type | Description |
|-------|------|-------------|
| `modules` | `Array<ModuleDefinition & { deps?: ModuleDefinition[] }>` | Array of modules to register deeply |

Returns: `this` (chainable).

**Tree-shaking note**: `registerAllDeep([a, b, c])` still references all bindings `a`/`b`/`c` at the call site. A bundler therefore cannot eliminate any of them. For a minimal graph, import a single module by its subpath and call `registerDeep(module)` — the transitive closure then comes **via the module's own JS imports**.

---

### `runtime.resolve(spec, options?)`

Resolves a module by **spec** (`'name'` or `'name@version'`). Recursively instantiates dependencies. Singleton cache by default, per `(name, version)`.

```js
const hex = runtime.resolve('hex');                 // latest
const v1  = runtime.resolve('hex@1.0.0');           // exact
const v2  = runtime.resolve('hex', { version: '2.0.0' });

// Without cache
const fresh = runtime.resolve('hex', { isolation: true });

// Custom shared cache (canonical keys `name@version`)
const map = new Map();
const a = runtime.resolve('hex', { instances: map });
const b = runtime.resolve('hex', { instances: map }); // same instance
```

| Param | Type | Description |
|-------|------|-------------|
| `spec` | `string` | `'name'` (latest) or `'name@version'` (exact) |
| `options.version` | `string` | Explicit version — ignored if `spec` already contains `@version` |
| `options.isolation` | `boolean` | If `true`, creates a new instance without caching it |
| `options.instances` | `Map` | Custom instance map (canonical keys `name@version`) |

Returns: module instance.
**Throws:** `Module not found: <name>` or `Module not found: <name>@<version>`.

---

### `runtime.resolveAll(specs, options?)`

Resolves multiple modules in one operation. The **result keys** are the **original specs** (preserving any `@version` suffix).

```js
const { hex, utf8 } = runtime.resolveAll(['hex', 'utf8']);

// Mix latest + exact
const r = runtime.resolveAll(['hex', 'utf8@1.0.0']);
r['hex'];          // latest
r['utf8@1.0.0'];   // exact
```

Returns: `Object<string, instance>`.

---

### `runtime.unregister(spec, version?)`

Removes a module definition. **Does not touch the instance cache**: references already obtained via `resolve` continue to work; only subsequent resolutions fail.

```js
runtime.unregister('foo');             // removes ALL versions of 'foo'
runtime.unregister('foo', '1.0.0');    // removes only '1.0.0'
runtime.unregister('foo@1.0.0');       // same (canonical notation)
```

| Param | Type | Description |
|---|---|---|
| `spec` | `string` | Module name or `'name@version'` |
| `version` | `string` | Explicit version (ignored if `spec` already contains `@`) |

Returns: `boolean` — `true` if at least one definition was removed.

**Effects:**
- If the removed version was the `latest`, the pointer is recomputed over the remaining versions.
- If the last version of a name is removed, the registry entry is deleted.
- The `instances` cache is **unchanged**: already-resolved instances survive on the caller side. A subsequent `register` of the same `(name, version)` will hit the same cached instance (unless `isolation: true`).

---

### `runtime.has(name, version?)`

Checks whether a module (or a specific version) is registered.

```js
runtime.has('hex');           // true
runtime.has('hex', '1.0.0');  // true
runtime.has('hex', '9.9.9');  // false
runtime.has('foobar');        // false
```

Returns: `boolean`.

---

### `runtime.list(filter?)`

Discovery — returns module definitions matching the filter.

```js
runtime.list();                              // all (all versions)
runtime.list({ name: 'hex' });               // all versions of 'hex'
runtime.list({ version: '1.0.0' });          // all '1.0.0' versions
runtime.list({ type: 'fw.io.codec' });       // exact type
runtime.list({ type: 'fw.' });               // PREFIX (trailing `.`) — all fw.*
runtime.list({ name: 'hex', version: '2.0.0' }); // combined
```

| Filter | Type | Description |
|---|---|---|
| `name` | `string` | Exact match |
| `version` | `string` | Exact match |
| `type` | `string` | Exact match, **or prefix if trailing `.`** |

Returns: `ModuleDefinition[]`. Linear — performant up to several hundred modules.

> **`list()` hands out live definitions.** The returned objects are the
> registered `ModuleDefinition`s themselves — including the live `factory` and
> the live `dependencies` array, which a caller can splice in place. Use it for
> discovery inside trusted code; for a **read-only** view (devtools, an
> inspector panel, anything that only needs to *look*), use
> [`snapshot()`](#runtimesnapshotfilter) below.

---

### `runtime.snapshot(filter?)`

Passive, **read-only** view of the registry: frozen metadata rows, no live
handles, **no instantiation**.

```js
runtime.snapshot();
// → [
//     { name: 'hex',  version: '1.0.0', type: 'fw.io.codec',
//       dependencies: [], latest: false, instantiated: true },
//     { name: 'hex',  version: '2.0.0', type: 'fw.io.codec',
//       dependencies: [], latest: true,  instantiated: false },
//     { name: 'utf8', version: '0.0.0', type: null,
//       dependencies: ['hex'], latest: true, instantiated: false },
//   ]

runtime.snapshot({ name: 'hex' });          // all versions of 'hex'
runtime.snapshot({ type: 'fw.io.' });       // PREFIX (trailing `.`)
runtime.snapshot({ name: 'hex', version: '2.0.0' });
```

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Registered module name |
| `version` | `string` | Resolved version — `'0.0.0'` when the descriptor omitted `version` |
| `type` | `string \| null` | Declared taxonomy type, `null` when undeclared |
| `dependencies` | `readonly string[]` | Frozen **copy** of the declared dependency specs |
| `latest` | `boolean` | `true` for the version a version-less `resolve(name)` would pick |
| `instantiated` | `boolean` | `true` when an instance for this `(name, version)` is already in the default cache |

`filter` is the same object `list()` accepts, with the same semantics (exact
`name` / `version`; exact `type`, or prefix match when `type` ends with `.`).

Returns: `ReadonlyArray<RegistrySnapshotEntry>` — the array is frozen, every row
is frozen, and every row's `dependencies` is a frozen copy. Linear scan, like
`list()`.

**Guarantees**

- **It does not instantiate.** No `factory` is invoked and the `instances` cache
  is never written — not even the per-name sub-`Map`. Calling it on a registry
  where nothing has been resolved leaves the cache byte-identical. This is the
  difference from `resolve()`, which is a *full instantiate*, not a peek.
- **It is read-only.** Nothing the caller receives can write back into registry
  state: the array cannot be extended, a row cannot be re-keyed, and
  `dependencies` is a copy, so splicing it does not touch the registered
  definition. (In strict mode — i.e. any ES module — such an attempt throws.)
- **It leaks no live handle.** Rows carry the six metadata fields above and
  nothing else: no `factory`, no `deps`, no instance. `instantiated` is an
  observation of the cache, never a way to reach what is in it.
- **Lockdown-compatible, measured, zero carve-out** — see
  `packages/front/fw/tests/registry-accessor-lockdown.integration.test.js`:
  enumeration, filtering, freezing and the "instantiates nothing" property all
  hold after `sanity/lockdown()`, on a runtime built before the freeze and on
  one constructed after it.

---

### `runtime.invalidate(spec, options?)`

Drops cached instances so the next `resolve()` re-runs the factory — the
registry-side half of a hot module swap. Full guide:
[`docs/guide/hmr.md`](../../guide/hmr.md).

```js
runtime.register(nextTodoView);              // descriptor-only: cache untouched
const { invalidated, state } = runtime.invalidate('todoView', { cascade: true });
runtime.resolve('todoView');                 // built from the NEW factory
```

| Parameter | Type | Description |
|---|---|---|
| `spec` | `string` | `'name'` (every registered version) or `'name@version'` (exact) |
| `options.cascade` | `boolean` | Also invalidate every module declaring the target among its `dependencies`, transitively |

Returns: `InvalidateResult` — frozen `{ invalidated, state }`.

| Field | Type | Description |
|---|---|---|
| `invalidated` | `readonly string[]` | Canonical `name@version` keys whose cached instance was actually dropped |
| `state` | `Object<string, *>` | Frozen map of canonical key → value returned by the outgoing instance's opt-in `dehydrate()` |

Throws `Module not found: <name>` (or `<name>@<version>`) for an unregistered
target, and refuses any target — direct or cascaded — in
`ModuleRuntime.NEVER_SWAP`.

**Semantics**

- **Dependents, not dependencies.** A cascade walks *upward*: the modules whose
  factories already ran with the outgoing instance baked into their closure. A
  version-less dependency spec (`'foo'`) only cascades when the invalidated
  version is the entry's `latest`; a pinned spec cascades only for its own
  version.
- **Atomic.** The never-swap check and every `dehydrate()` call run before the
  first cache write, so a refusal or a throwing `dehydrate()` leaves the cache
  exactly as it was.
- **The registry is not touched.** `invalidate` evicts instances; `unregister`
  removes definitions. They are independent.
- **`ModuleRuntime.NEVER_SWAP`** is a frozen, pinned array of module names — it
  contains `signal`, whose effect tracking is per-factory-instance, so swapping
  it would silently detach every existing effect. Not configurable per runtime.

**Limits** (structural, documented rather than deferred)

- Handles already handed out are **never** upgraded — only subsequent `resolve`
  calls see the new instance.
- Factory-closure state is **lost**: re-running the factory is exactly what
  clears it. The opt-in `dehydrate()` / `hydrate()` convention is the answer.
- Only the default cache is affected: `{ isolation: true }` instances are never
  cached, and a caller-supplied `{ instances: map }` is the caller's to clear.

---

### `runtime.serialize(specs)`

Serialises the transitive dependency graph as a JS string for injection into a Worker.

```js
const { list, content } = runtime.serialize(['uuid']);
// list    → "['hex@1.0.0','uuid@1.0.0']"   (topological canonical names)
// content → "[{name:'hex',version:'1.0.0',type:'fw.io.codec',dependencies:[],factory:function(){...}},...]"
```

Returns: `{ list: string, content: string }`.

**Notes:**
- `specs` can be bare (`'foo'` → latest) or `'foo@1.0.0'`.
- **Each serialised module's dependencies are rewritten to canonical form** (`'hex'` → `'hex@1.0.0'`) to guarantee exact resolution on the worker side.
- `version` and `type` are preserved in the bundle.
- Used internally by `createWorker`. The `toString()` of factories is embedded; shorthand methods are converted to `function` keyword for eval compatibility.

---

### `runtime._buildGraph(specs)` *(internal)*

Depth-first topological sort over the transitive closure. Returns `[{name, version, def}]` — dependencies before dependants. Deduplicates by canonical `name@version`.

## Internal properties

| Property | Type | Description |
|-----------|------|-------------|
| `modules` | `Map<string, ModuleEntry>` | Registry by name — `ModuleEntry = {versions, latest, latestDef}` |
| `instances` | `Map<string, Map<string, *>>` | Singleton cache per `(name, version)` |
| `context` | `Object` | Reserved for worker bootstrap (populated by `worker-helper.js`) |

## Typedef: ModuleDefinition

```js
{
    name: string,                          // unique identifier
    version?: string,                      // semver — default '0.0.0'
    type?: string,                         // taxonomy 'fw.<sub>' | 'sd.<sub>' | 'sde.<sub>' | 'sdc.<sub>' | 'lib.<sub>' — regex ^(fw|sd|sde|sdc|lib)\.[a-z][\w.]*$
    dependencies: string[],                // specs ('name' or 'name@version') — runtime contract
    deps?: ModuleDefinition[],             // direct JS refs — bundler-friendly, traversed by registerDeep
    factory: Function                      // factory(...deps) => instance
}
```

> **`deps` vs `dependencies`** — `dependencies` is the **runtime contract** (strings, support `@version`, embedded in `serialize`). `deps` is a **bundler-friendly counterpart**: an array of direct JS references (from static imports) that `registerDeep`/`registerAllDeep` traverse. Build-time invariant: `deps.map(d => d.name)` corresponds to `dependencies.map(s => s.split('@')[0])`. Not transferred to workers.

## Examples

### Register and resolve a module

```js
import { ModuleRuntime } from './fw/src/core/runtime.js';

const rt = new ModuleRuntime();
rt.register({ name: 'greet', dependencies: [], factory: () => ({ hello: (name) => `Hello ${name}` }) });
const greet = rt.resolve('greet');
greet.hello('world'); // 'Hello world'
```

### Multi-version

```js
rt.register({ name: 'codec', version: '1.0.0', dependencies: [], factory: () => 'v1' });
rt.register({ name: 'codec', version: '2.0.0', dependencies: [], factory: () => 'v2' });

rt.resolve('codec');          // → 'v2' (latest)
rt.resolve('codec@1.0.0');   // → 'v1'
```

## Notes

- The "latest" selection is precomputed at `register` — `resolve('foo')` remains O(1) regardless of the number of versions.
- `unregister` does not touch the `instances` cache: already-obtained references continue to work.
- `list()` returns **live** definitions (mutable `dependencies`, callable `factory`); `snapshot()` returns frozen metadata copies and instantiates nothing — pick `snapshot()` for any read-only consumer.
- `serialize` emits dependencies in canonical `name@version` form to guarantee exact worker-side resolution.
- `runtimeSource` exports the private helpers + the class, enabling their injection into a Worker without `import`.

## Backwards compatibility

| Legacy case | Behaviour |
|---|---|
| Module without `version` or `type` | OK — default version `'0.0.0'`, no type validation |
| `resolve('foo')` after legacy register | returns the single version (`'0.0.0'`) |
| Mix of legacy + versioned | explicit version wins (`'1.0.0'` > `'0.0.0'`) |
| `serialize(['foo'])` legacy | OK — emits `'foo@0.0.0'` |
| `dependencies: ['hex']` legacy | OK — resolves latest |

No existing fw module is broken by the evolution.

## See also

- [Module pattern](../../guide/module-pattern.md)
- [Web Workers](../../guide/workers.md)
- [worker-helper](./worker-helper.md)
