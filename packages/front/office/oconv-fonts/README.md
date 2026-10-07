# @awacloud/oconv-fonts

The SIL OFL companion of `@awacloud/oconv`: the Liberation 2.1.5
Sans/Serif/Mono families (Regular/Bold/Italic/BoldItalic — 12 faces),
vendored byte-identical, registered as an `@awacloud/fw` descriptor so
`oconv`'s `md → pdf` route embeds real faces by default instead of falling
back to the PDF Standard 14. If this package is absent from the runtime,
`oconv` still resolves to Standard 14 and the module graph still links —
this package is optional at every layer.

## Installation

```bash
npm install @awacloud/oconv-fonts
```

Browser-side, via import map:

```html
<script type="importmap">
{ "imports": {
    "@awacloud/oconv-fonts":  "/node_modules/@awacloud/oconv-fonts/src/main.js",
    "@awacloud/oconv-fonts/": "/node_modules/@awacloud/oconv-fonts/src/"
}}
</script>
```

No npm install of a runtime dependency, no bundler, either way. The loader
fetches the vendored faces from `../vendor/liberation/` relative to
`src/loader.js`, so `vendor/` must be served next to `src/` — or pass
`opts.baseUrl` to point elsewhere. Under Bun and in a browser the faces are
read through `fetch`; under Node.js 20+, whose `fetch` refuses `file:` URLs,
they are read through `node:fs/promises` (imported only on that path).
The `ModuleRuntime` used below comes from
[`@awacloud/fw`](https://github.com/awacloud/awa/tree/@awacloud/oconv-fonts@1.0.0/packages/front/fw).

## Quick Start

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { registerDefaultFaces } from '@awacloud/oconv-fonts';

const runtime = new ModuleRuntime();
await registerDefaultFaces(runtime);          // fetches the 5 vendored faces the
                                               // default route uses and registers
                                               // the 'oconvDefaultFaces' descriptor

const api = runtime.resolve('oconvDefaultFaces');
console.log(api.family, api.release);          // 'Liberation' '2.1.5'
console.log(Object.keys(api.defaultFaces()));  // [ 'regular', 'bold', 'italic', 'boldItalic', 'mono' ]

// oconv reaches the descriptor by NAME only — an ordinary dependency on
// 'oconvDefaultFaces' that a built-in stand-in satisfies when this package is
// absent — never by an import, and applies it per style class:
//   explicit opts.pdf.fonts[<class>]  >  default map[<class>]  >  Standard 14
// where the default map is a posted `defaultFaces` map (a worker request
// field; it wins whole) when supplied, else the registered oconvDefaultFaces.
```

`loadDefaultFaces(opts)` is the lower-level, explicit byte path for a
caller that wants the frozen face map without registering a descriptor
(e.g. to pass it straight into `opts.pdf.fonts`). See
[`docs/descriptor.md`](./docs/descriptor.md) for the frozen descriptor
contract, the full precedence rule and its worked example.

## Registering twice

A second `registerDefaultFaces(runtime)` call does not hot-swap by itself —
`ModuleRuntime#register` is descriptor-only (pinned on a real runtime in
`src/loader.test.js`): no resolve in between → the first resolve returns
the **second** registration; resolve, register again, resolve again → the
second resolve still returns the **first** (cached in `runtime.instances`);
`runtime.invalidate('oconvDefaultFaces', { cascade: true })` after
re-registering → the next resolve returns the second.

**Host rule**: register the face pack before the first `resolve` of a
module depending on `oconvDefaultFaces` (e.g. `oconv`'s writer), or call
`invalidate(..., { cascade: true })` after re-registering. See
[`docs/descriptor.md`](./docs/descriptor.md) for the frozen contract.

## Coverage, measured

Measured from each vendored face's own `cmap` (`font.glyphIndexForCodePoint`
over each block's code points) — identical across all 12 faces:

| block | coverage |
|---|---|
| Basic Latin, Latin-1 Supplement, Latin Extended-A | **100 %** |
| Cyrillic (U+0400 to U+04FF) | **100 %** |
| Greek and Coptic (U+0370 to U+03FF) | **88.2 %** |
| Hebrew (U+0590 to U+05FF) | **77.7 %** |
| Arabic, Devanagari, Hiragana, Katakana | **0 %** |
| CJK Unified Ideographs, Hangul Syllables (first 256 code points of each, probed) | **0 %** |

**Not covered**: Arabic, Devanagari (or any other Indic script), Hiragana,
Katakana, CJK Unified Ideographs, Hangul. A code point outside the covered
ranges still records `text/unencodable` — nothing is silently dropped.

Coverage is a `cmap` fact, not a shaping claim: `oconv`'s PDF writer
refuses shaping at tier 2, and this package does not change that — a
script that needs shaping renders wrong even where the glyphs exist.

## Vendored fonts

The vendored fonts are **SIL Open Font License 1.1** with Reserved Font Names
`Liberation`, `Arimo`, `Tinos`, `Cousine` — verbatim text in
[`vendor/OFL.txt`](./vendor/OFL.txt), obligations summarised in
[`vendor/NOTICE-liberation`](./vendor/NOTICE-liberation).

**Never pre-subset or otherwise modify the vendored faces.** OFL 1.1
condition 3 forbids distributing a Modified Version under a Reserved Font
Name, and the licence defines "Modified Version" to include any change to
the font's format — which includes subsetting. A pre-subsetted face could
no longer be called "Liberation". This is unnecessary in any case:
`@awacloud/oconv` already subsets at PDF-embed time, so the emitted PDF
carries only the glyphs actually used — the full 12-face vendored weight
is a tarball concern, never a runtime one.

## Payload

12 faces, **4 359 164 bytes**, TrueType flavour, vendored byte-identical
from Liberation Fonts release 2.1.5 (the byte total is the sum of the 12
`vendor/liberation/*.ttf` files). Per-file provenance and sha256 pins live in
[`vendor/PROVENANCE.json`](./vendor/PROVENANCE.json); integrity is pinned by
`vendor/provenance.test.js`.

## Tests

```bash
bun test packages/front/office/oconv-fonts/
```

## Exposed sub-paths

| Sub-path | Target | Usage |
|---|---|---|
| `@awacloud/oconv-fonts` | `src/main.js` | The entry point: re-exports `createOconvDefaultFaces`, `loadDefaultFaces` and `registerDefaultFaces`; nothing is fetched or registered at import. |
| `@awacloud/oconv-fonts/faces.js` | `src/faces.js` | `createOconvDefaultFaces(faces)` — builds the `oconvDefaultFaces` descriptor around five font programs you already hold. |
| `@awacloud/oconv-fonts/loader.js` | `src/loader.js` | `loadDefaultFaces(opts)` (the async byte path) and `registerDefaultFaces(runtime, opts)` (load, then register). |

The `.js`-suffixed keys are the form to import from browser code: an import
map that maps `@awacloud/oconv-fonts/` to a path prefix resolves them
directly. See the [API index](./docs/api/README.md) for one page per exported
function.

## Maturity

`L3` (`awa.maturity` in `package.json`): the three exported functions each have
an API page, the source is covered at 100.00 % of the declared `src/**` basis
against a `0.98` floor, the tarball contents (including the licence files and
all 12 faces) are pinned by an integration test, and the sha256 of every
vendored face is pinned.

## Licence

This package's own JavaScript is [`AGPL-3.0-only`](./LICENSE); a commercial
licence is also available (see [`NOTICE`](./NOTICE)). Copyright (c) 2026
AwaCloud SAS. The vendored Liberation fonts keep their own licence, the SIL
OFL 1.1 — see [Vendored fonts](#vendored-fonts) above.

## Project

- Website: https://awaforge.eu
- Source: [`packages/front/office/oconv-fonts`](https://github.com/awacloud/awa/tree/@awacloud/oconv-fonts@1.0.0/packages/front/office/oconv-fonts)
- Issues: https://github.com/awacloud/awa/issues
- Security policy: [`SECURITY.md`](https://github.com/awacloud/awa/blob/@awacloud/oconv-fonts@1.0.0/SECURITY.md)
