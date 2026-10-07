---
module: oconvDefaultFaces
category: oconv/write/pdf
dependencies: []
returns: object
worker-safe: true
status: complete
---

# oconvDefaultFaces (stand-in)

> The name-only seam an optional default-face pack registers over.

**Module** `oconvDefaultFaces` (binding `oconvDefaultFacesAbsent`) | **Source** `packages/front/office/oconv/src/write/pdf/default-faces.js` | **Deps** — none | **Worker-safe** yes

This page documents the **stand-in** descriptor `@awacloud/oconv` itself
registers under the name `oconvDefaultFaces` — not a real face pack. No
face pack is a dependency of `@awacloud/oconv`; this module is the whole of
what `@awacloud/oconv` knows about the name.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconvDefaultFaces = runtime.resolve('oconvDefaultFaces');
```

While no real face pack is registered on the same runtime, this resolves
the stand-in above. `oconvIrToPdf` (`../ir-to-pdf.md`) is the only consumer
— it depends on the NAME `oconvDefaultFaces`, never imports this file or a
face pack directly.

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `defaultFaces` | `() => null` | `null` (no default face map registered) | — |
| `family` | `string \| null` | `null` | — |
| `release` | `string \| null` | `null` | — |

A real face pack registered on the same runtime carries the SAME three
members with real values (a `{regular, bold, italic, boldItalic, mono}`
font-bytes map from `defaultFaces()`, and non-null `family`/`release`
strings) — this page describes only the absent-pack shape.

## Examples

### Resolve the stand-in on a fresh runtime

```js
// `oconvDefaultFaces` as resolved in the Resolve block above.
oconvDefaultFaces.defaultFaces();  // null
oconvDefaultFaces.family;          // null
oconvDefaultFaces.release;         // null
```

Executed against the live package (2026-10-06) on a runtime built from
`@awacloud/oconv`'s own `fw_require`/`modules` with no other package
registered: `defaultFaces()` returns `null`, `family` and `release` are
`null` — exactly the stand-in shape above.

### Displacement by a real pack

With the optional companion package `@awacloud/oconv-fonts` installed,
registering its face pack on the same runtime displaces the stand-in. The
`runtime` above already resolved the stand-in, so this session also shows
the cache caveat from the Notes: the held handle is not upgraded in place.

```js
import { registerDefaultFaces } from '@awacloud/oconv-fonts';

await registerDefaultFaces(runtime);          // registers oconvDefaultFaces@1.0.0
runtime.has('oconvDefaultFaces', '1.0.0');    // true
runtime.has('oconvDefaultFaces', '0.0.0');    // true — the stand-in stays registered,
                                              // it is simply no longer the LATEST version
oconvDefaultFaces.family;                     // null — the handle resolved earlier is not upgraded

runtime.invalidate('oconvDefaultFaces', { cascade: true });
const realFaces = runtime.resolve('oconvDefaultFaces');
realFaces.family;                             // 'Liberation'
realFaces.release;                            // '2.1.5'
Object.keys(realFaces.defaultFaces());        // ['regular', 'bold', 'italic', 'boldItalic', 'mono']
```

Executed against the live package (2026-10-06) with `@awacloud/oconv-fonts`
resolvable from the same project: every value as shown above. The package's
integration tests pin the displacement rule at the public facade
(`oconv.fromMd`), never at this module's own seam, including both
registration-order legs (before the first `resolve('oconv')`, and after it
via `invalidate(..., {cascade: true})`).
## Notes

- **Why a stand-in, not a runtime probe.** An fw factory never sees the
  runtime — `ModuleRuntime#resolve` invokes `def.factory.apply({}, deps)`,
  so `oconvIrToPdf`'s factory cannot call `runtime.has(...)` from inside
  itself. The fw-native way to depend on an optional module BY NAME is a
  stand-in registered under that same name at the LOWEST version.
- **Displacement rule (frozen, verbatim).** A descriptor without an
  explicit version defaults to `'0.0.0'` (`DEFAULT_VERSION`,
  `@awacloud/fw`'s `core/runtime.js`), the lowest semver there is;
  `ModuleRuntime#register` re-points an entry's `latestDef` only when the
  newly registered version sorts `>=` the current latest. So a real face
  pack carrying any version above `0.0.0` (the companion package ships
  `1.0.0`) displaces this stand-in **whichever order the two are
  registered in** — registration alone switches the default tier on, no
  import of the companion package anywhere in `@awacloud/oconv`, no flag.
- **The cache caveat.** `ModuleRuntime` caches resolved instances. A face
  pack must be registered BEFORE the first `resolve('oconvIrToPdf')` (or of
  anything depending on it, i.e. `resolve('oconv')`) to take effect on that
  handle. Registered afterwards, the already-resolved handle keeps using
  the stand-in until
  `runtime.invalidate('oconvDefaultFaces', { cascade: true })` is called —
  a held handle is never upgraded in place (`@awacloud/fw`'s own contract);
  the caller must re-resolve after invalidating.
  The integration tests pin exactly this sequence (the session above shows it).
- **Capture-free and serializable.** The resolved API carries no bytes and
  closes over nothing (`fw/no-factory-capture`), so it survives
  `ModuleRuntime#serialize` — but bytes never travel inside the descriptor
  either way: a Worker receives the registered map as a separate
  `writeOpts.defaultFaces` field (structured clone), posted by the HOST
  after it resolves `oconvDefaultFaces` on the main thread. See
  [`ir-to-pdf`](../ir-to-pdf.md) and [`pdf-writer.md`](../../../pdf-writer.md)
  for the worker-boundary detail.
- This is a name-only optional-dependency seam, not a documented public
  extension point of `@awacloud/oconv-fonts` — the companion package's own
  `docs/descriptor.md` is the authoritative source for the REAL descriptor
  a face pack registers.

## See also

- [`ir-to-pdf`](../ir-to-pdf.md) — the sole consumer of this name.
- [`pdf-writer.md`](../../../pdf-writer.md) § "The default-face tier"
  — the full host-registration recipe and worker-boundary reasoning.
- [`pdf/metrics`](./metrics.md) — where the resolved default-face map (real
  or absent) feeds into font-route resolution.
