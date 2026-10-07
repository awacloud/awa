# Bundles — pre-wired pdf API factories

Three module descriptors re-export the core PDF API with different subsets of extras wired in. Each declares its dependencies (core `pdf` + extras) and is resolved through a `ModuleRuntime`; the factory wires the extras into `pdf` via `.use(...)` and returns the enriched instance with `.read()`, `.write()`, `.use()`, and a namespace per wired extra.

| Bundle | Extras | When to choose |
|--------|--------|---------------|
| [`pdfLargeBundle`](./pdf-large.md) | P0 + P1 | Standard production: the common PDF 2.0 features. No linearization-dictionary builder, no 3D, no legacy 1.7. |
| [`pdfFullBundle`](./pdf-full.md) | P0 + P1 + P2 + P3 | Every PDF 2.0 extra. Adds the linearization-dictionary builder, 3D/RichMedia, JBIG2 segment-header read, Info lint, misc tail, sandbox. |
| [`pdfLegacyBundle`](./pdf-legacy.md) | full + `legacy-*` | Legacy 1.7 ingestion. Adds XFA read, RC4 decryption helpers, LZW / CCITT fax decode and DCT / JPX passthrough, Sound/Movie/Screen typing. |

Each bundle's extras are listed literally in its descriptor's `dependencies`
and enumerated on its page.

These three descriptors are the **source-side** bundles. The committed `dist/` build additionally crosses them with a Read / Read+Write family axis — see [Committed `dist/` bundle matrix](./dist-matrix.md) for the eight roots, the `-rw` naming scheme and the write inventory. Every `-rw` root also ships the signature verifier `pdfSignature` beside the signer, so a Read+Write bundle can verify what it signs; no Read root carries it.

Bundles are `{ name, dependencies, factory }` descriptors — consumption is exclusively declarative via `ModuleRuntime`. The three bundle descriptors are reachable through the root `bundle` array (as above) or through their own subpath exports (`@awacloud/pdf/pdf-large`, `@awacloud/pdf/pdf-full`, `@awacloud/pdf/pdf-legacy`); they are **not** re-exported from the package root by binding name, so `import { pdfLargeBundle } from '@awacloud/pdf'` is `undefined`. The same holds for every `extras` descriptor.

## Common pattern

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules, extras, bundle } from '@awacloud/pdf';

const rt = new ModuleRuntime();
for (const m of fw_require)  rt.register(m);
for (const m of pkg_require) rt.register(m);
for (const m of modules)     rt.register(m);
for (const m of extras)      rt.register(m);
for (const m of bundle)      rt.register(m);

const api = rt.resolve('pdfLargeBundle');
const doc = api.read(bytes);                 // PDF 2.0 read
const out = api.write(doc);                  // PDF 2.0 write

// Extras are reachable by their own name
api.pdfSigPades.detectPadesProfile(sigDict, ctx);

// Adding a custom extra
api.use({
    name: 'myExt',
    register() { return { myExt: { /* … */ } }; }
});
```

## Decision

```
Ingesting only PDF 2.0?
├── strict + simple → pdf-large
└── strict + complete (linearization dictionary, 3D, JBIG2 headers, Info lint) → pdf-full

Ingesting PDF 1.7 (XFA, RC4, LZW, Sound/Movie)?
└── → pdf-legacy  (write still emits a %PDF-2.0 header; legacy content is not converted)
```

## Common errors

| Code | Class | When |
|------|--------|------|
| `pdf/use/bad-extension` | `ContractError` | `.use()` is called with an object missing `name`/`register` (thrown by the core `pdf` orchestrator itself; every bundle inherits it). |
| `pdf/filters/missing-lzw` | `ParseError` | `pdf-legacy` only — `pdfLegacyDeprecatedFilters` constructed without a valid `@awacloud/fw` `lzw` factory output. |

## See also

- [Committed `dist/` bundle matrix](./dist-matrix.md)
- [Extras](../extra/README.md)
- [`pdf`](../pdf.md)
- [API index](../README.md)
