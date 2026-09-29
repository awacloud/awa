# Module Pattern

The fundamental pattern of the framework: each module is a descriptor object with a pure factory.

## Structure

```js
import { hex } from '../io/codec/hex.js';
import { b64 } from '../io/codec/b64.js';

export const myModule = {
    name: 'myModule',                // unique identifier (string)
    version: '1.0.0',                 // semver (optional — default '0.0.0')
    type: 'fw.io.codec',              // taxonomy (optional): fw.<sub> | sd.<sub> | sde.<sub> | sdc.<sub> | lib.<sub>
    dependencies: ['hex', 'b64@1.0.0'], // specs ('name' = latest, 'name@version' = exact)
    deps: [hex, b64],                 // direct JS refs — bundler mirror of `dependencies`

    factory(hex, b64) {               // args = resolved dependencies in order
        // private state — isolated, never shared between instances
        const state = {};

        return {
            method() { /* ... */ }
        };
    }
};
```

### The `dependencies` / `deps` tandem

| Field | Role | Format |
|---|---|---|
| `dependencies` | **Runtime resolution contract.** Specifies the names (and versions) resolved by `runtime.resolve` and serialised towards workers. | `string[]` — `'name'` or `'name@version'`. |
| `deps` | **Bundler mirror.** Direct JS references to the dependency modules, statically imported at the top of the source file. Allows Rollup / Webpack / Vite / esbuild to trace the graph via `import` and tree-shake correctly. | `ModuleDefinition[]` — no strings. |

**Invariant** (validated at build time):

```
module.deps.map(d => d.name) === module.dependencies.map(s => s.split('@')[0])
```

Both **must** list the same modules in the same order. `dependencies` carries
version constraints; `deps` carries JS references. Workers only receive
`dependencies` (the runtime serialisation), not `deps` — the import graph
has no meaning inside a Worker, which has no module loader.

**Absolute rules:**
1. `factory` is a **pure** function — no access to `window`, `document`, global variables
2. No side-effects when calling the factory (no `fetch`, `console.log`, listeners)
3. **Serialisable** code — `factory.toString()` must produce valid JS (no closures over main-thread values)
4. Dependencies **declared explicitly** in `dependencies[]` — no direct `import`

### `version` and `type` fields

| Field | Format | Validation at `register` |
|---|---|---|
| `version` | semver `MAJOR.MINOR.PATCH[-pre][+build]` | strict regex; default `'0.0.0'` if absent |
| `type` | `^(fw\|sde\|lib)\.[a-z][\w.]*$` | strict regex; tolerated absent |

`runtime.register()` **throws** on invalid version or type. Validation is backwards-compatible: a legacy module without `version`/`type` continues to work.

### Coexisting multi-version

Several `version` values of the same `name` can coexist in the same runtime:

```js
runtime.register({ name: 'codec', version: '1.0.0', dependencies: [], factory: () => v1 });
runtime.register({ name: 'codec', version: '2.0.0', dependencies: [], factory: () => v2 });

runtime.resolve('codec');           // → v2 (latest)
runtime.resolve('codec@1.0.0');     // → v1 (exact)
runtime.has('codec', '2.0.0');      // → true
runtime.list({ name: 'codec' });    // → [def@1.0.0, def@2.0.0]
```

Enables **progressive migration**: two versions of a module can be used by different consumers during a transition.

## Return shapes

Factories return different shapes depending on the module:

### 1. API object (most common)

```js
// hex, b64, utf8, dom, events, ...
const hex = runtime.resolve('hex');
hex.fromBytes(bytes); // direct method
hex.toBytes(str);
```

### 2. Constructor

```js
// crc32, adler32, queue
const CRC32 = runtime.resolve('crc32');
const checksum = new CRC32();
checksum.append(data);
checksum.get(); // → number
```

### 3. Value generator

```js
// uuid
const uuid = runtime.resolve('uuid');
uuid.v1();        // string UUID v1 (time-based)
uuid.v1(true);    // raw Uint8Array[16]
uuid.v4();        // string UUID v4 (random)
```

### 4. Complex namespaced object

```js
// processMessage
const pm = runtime.resolve('processMessage');
pm.sync();             // in-memory channel
pm.worker();           // proxy inside a Worker
pm.workerCommand(ref); // commands to a Worker
pm.workerFramework(runtime, modules, args); // standard bootstrap
```

## Singleton vs isolation

By default, `runtime.resolve` returns the **same instance** on every call:

```js
const a = runtime.resolve('hex');
const b = runtime.resolve('hex');
a === b; // true — singleton

// Fresh instance (not cached)
const c = runtime.resolve('hex', { isolation: true });
const d = runtime.resolve('hex', { isolation: true });
c === d; // false
```

### Custom instance map

For isolated groups of instances sharing the same registry:

```js
const instancesA = new Map();
const instancesB = new Map();

const hexA = runtime.resolve('hex', { instances: instancesA });
const hexB = runtime.resolve('hex', { instances: instancesB });
hexA === hexB; // false — separate instances

// Typical use: inline vs worker side by side
const libs = runtime.resolveAll(['hex', 'uuid'], { instances: new Map() });
```

## Module naming

Current format (short):
```
'hex', 'b64', 'utf8', 'uuid', 'template', 'uiSession', ...
```

Recommended format for new modules:
```
'io_codec_hex', 'dom_rendering_template', ...
```

## Dynamic registration

```js
const myModule = {
    name: 'dynModule',
    version: '1.0.0',
    dependencies: [],
    deps: [],
    factory() {
        return (x) => x * 2;
    }
};

fw.runtime.register(myModule);
const double = fw.runtime.resolve('dynModule');
double(21); // 42
```

### Transitive registration via `deps`

`registerDeep(module)` registers `module` **and** recursively all its `deps`
(depth-first, idempotent, cycle-safe). `registerAllDeep([...])`
applies the same logic to an array and shares the "seen" set across entries.

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime';
import { sanitize } from '@awacloud/fw/dom/rendering/sanitize.js';

const runtime = new ModuleRuntime();
runtime.registerDeep(sanitize);
// → sanitize + parser + render + secPolicy + their transitives registered
```

Typical use:

| Method | When |
|---|---|
| `register(module)` | Single module, dependencies already registered. |
| `registerAll([modules])` | Pre-sorted array (e.g. `core/modules.js` listing everything in canonical order). |
| `registerDeep(module)` | Manual composition — let the runtime find transitives via `deps`. |
| `registerAllDeep([modules])` | Same for a subset (e.g. a Vite preset). |

## Discovery — `runtime.list()`

```js
// All modules in a category
fw.runtime.list({ type: 'fw.io.codec' });    // exact
fw.runtime.list({ type: 'fw.' });            // prefix (trailing `.`)

// All versions of a module
fw.runtime.list({ name: 'hex' });

// Combinations
fw.runtime.list({ type: 'sde.', version: '1.0.0' });
```

> **`list()` hands out live definitions, not a read-only view.** The
> `ModuleDefinition` objects it returns are the registered ones themselves —
> live `factory`, live `dependencies` array — so a caller can splice
> `dependencies` in place or replace `factory`. Reserve `list()` for trusted
> internal code that genuinely needs that write channel (e.g. registration
> bookkeeping). Anything read-only — devtools, an inspector panel, a status
> view — should use [`runtime.snapshot()`](../api/core/runtime.md#runtimesnapshotfilter)
> instead: same filter shape, but frozen metadata rows with no live handles
> and no instantiation.

## Golden rules

| Rule | Why |
|-------|----------|
| No `import` **inside the factory body** | Not serialisable for workers (top-of-file imports are normal and feed `deps`) |
| No `document`/`window` in the factory | Not available in workers |
| No global state | Violates isolation, bugs in workers |
| Declare all deps in `dependencies[]` AND `deps[]` | Runtime resolution + bundler tree-shaking |
| Idempotent factory | Testable, cleanly re-instantiable |

## See also

- [ModuleRuntime API](../api/core/runtime.md)
- [Web Workers](./workers.md)
