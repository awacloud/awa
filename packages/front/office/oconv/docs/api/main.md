---
module: manifest
category: oconv
dependencies: []
returns: object
worker-safe: true
status: complete
---

# manifest

> The package entry point — five arrays (`fw_require`, `pkg_require`, `modules`, `extras`, `bundle`), nothing else.

**Module** `manifest` (`fw_require`, `pkg_require`, `modules`, `extras`, `bundle`) | **Source** `packages/front/office/oconv/src/main.js` | **Deps** — | **Worker-safe** yes

Re-exports the `@awacloud/oconv` module factory descriptors. Consumers register them in their own `@awacloud/fw` `ModuleRuntime` to wire dependency injection automatically. This is the package's `"."` `exports` entry point (see the [boundary note](./README.md#boundary-note)) — `src/worker.js` is reached separately, by path or by its own `./src/worker.js` sub-path.

## Resolve

```js
import { fw_require, modules } from '@awacloud/oconv';
```

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `fw_require` | `{name, dependencies, factory}[]` | the dedup'd union of the fw providers `@awacloud/md`/`@awacloud/ooxml`/`@awacloud/odf`/`@awacloud/pdf` each need registered in the host runtime | — |
| `pkg_require` | `{name, dependencies, factory}[]` | the individual sibling module descriptors `@awacloud/oconv`'s own readers/writers declare as `dependencies`, bound by bare specifier — codegen-only, NOT spread into `modules` (already registered there through the sibling `modules` spreads) | — |
| `modules` | `{name, dependencies, factory}[]` | every `@awacloud/oconv` local descriptor (27, dependencies-before-dependents order) PLUS the full transitive graph of the four office packages it composes (`ooxmlModules`, `odfModules`, `mdModules`, `mdExtras`, `pdfPkgRequire`, `pdfModules`) | — |
| `extras` | `{name, dependencies, factory}[]` | `[]` — no opt-in extras today | — |
| `bundle` | `object[]` | `[]` — no pre-assembled bundle today | — |

## Examples

### Register the full graph and resolve the facade

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconv = runtime.resolve('oconv');
```

## Notes

- `modules` registers only the SINGLE format descriptor being resolved would resolve fine at registration time but throw "Module not found" the first time a consumer actually calls e.g. `runtime.resolve('docx')` — so `modules` also carries the composed office packages' own module arrays, dependencies before dependents.
- `pkg_require` exists so `@awacloud/tool-fw-codegen deps` can statically resolve each local descriptor's `dependencies` NAME to an importable binding and emit the inline `deps:` field on every descriptor — it is runtime-inert: every entry it lists is already registered through the `modules` spreads, so including it too would double-list into a non-deduped array.
- `fw_require` de-duplicates by descriptor `name` (`@awacloud/ooxml` and `@awacloud/odf` both need the zip/deflate/xml closure) so re-registering a provider present in several sibling manifests stays idempotent.
- 27 local `@awacloud/oconv` descriptors are registered in `modules`: the pivot (`oconvIr`), 7 format readers (`oconvDocxToIr`/`oconvOdtToIr`/`oconvXlsxToIr`/`oconvOdsToIr`/`oconvPptxToIr`/`oconvOdpToIr`/`oconvPdfToIr`), `oconvPdfFontDecoder`/`oconvPdfTextExtract`/`oconvPdfStruct` (the pdf reader's own dependencies), `oconvMdToIr`, 4 writers (`oconvIrToMd`/`oconvIrToDocx`/`oconvIrToOdt`/`oconvIrToPdf`), 9 md→pdf typesetter descriptors, the `oconvDefaultFaces` stand-in, and the `oconv` facade itself — count derived from `modules` (its entries whose name starts with `oconv`).
- `@awacloud/md`'s `extras` (`mdExtras`, 10 opt-in descriptors) are spread right after `mdModules`: md's `modules` carries `mdHtmlDocument`, which depends on four of them (`mdToc`, `mdFrontmatter`, `mdFootnotes`, `mdAdmonitions`), and `@awacloud/md` documents that a consumer registers both `modules` and `extras` (`@awacloud/md` `docs/api/document/html-document.md` § Resolve). `mdFrontmatter` — which `oconvMdToIr` depends on — is registered through that spread, not as a separate element, so `modules` lists every descriptor name exactly once.

## See also

- [docs/api/README.md](./README.md) — full module index + `exports` boundary note (the 29-row derivation)
- [`oconv`](./oconv.md) — the facade this manifest's `modules` array resolves
- [`worker`](./worker.md) — reached by path or its `./src/worker.js` sub-path, not through this manifest
