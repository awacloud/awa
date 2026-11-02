# @awacloud/oconv-fonts

The SIL OFL companion of `@awacloud/oconv`: the Liberation 2.1.5
Sans/Serif/Mono families (Regular/Bold/Italic/BoldItalic — 12 faces),
vendored byte-identical, registered as an `@awacloud/fw` descriptor so
`oconv`'s `md → pdf` route embeds real faces by default instead of falling
back to the PDF Standard 14. If this package is absent from the runtime,
`oconv` still resolves to Standard 14 and the module graph still links —
this package is optional at every layer.

It also vendors **Carlito** and **Caladea** (4 faces each), the metric
twins of Calibri and Cambria, two faces office documents name constantly —
for an application that serves faces itself: `faceUrls(opts)` gives the
URL of every vendored face, Liberation included. They are not part of the
`oconvDefaultFaces` face map.

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
[`@awacloud/fw`](https://github.com/awacloud/awa/tree/@awacloud/oconv-fonts@1.1.0/packages/front/fw).

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

## Serving the faces yourself

`faceUrls(opts)` returns, without reading anything, a frozen map from each
vendored family to the `URL` of its four styles (`regular`, `bold`,
`italic`, `boldItalic`): the families are `Liberation Sans`, `Liberation
Serif`, `Liberation Mono`, `Carlito` and `Caladea`, 20 files in all. By
default the URLs point at this package's own `vendor/` directory, resolved
against `src/loader.js`; pass `opts.vendorUrl` (the directory serving a copy
of `vendor/`, absolute or root-relative) when your application serves them
from elsewhere. Note the difference with `opts.baseUrl` of
`loadDefaultFaces`, which names the `vendor/liberation/` directory itself.

```js
import { faceUrls } from '@awacloud/oconv-fonts';

const urls = faceUrls({ vendorUrl: 'https://cdn.example.com/fonts/' });
console.log(Object.keys(urls));
// [ 'Liberation Sans', 'Liberation Serif', 'Liberation Mono', 'Carlito', 'Caladea' ]
console.log(urls.Carlito.bold.href);
// 'https://cdn.example.com/fonts/carlito/Carlito-Bold.ttf'
```

Serve each family's licence and notice file with its faces (the table
under [Vendored fonts](#vendored-fonts)). Carlito and Caladea are not part
of the `oconvDefaultFaces` face map: `oconvDefaultFaces`,
`loadDefaultFaces` and `registerDefaultFaces` behave as before. See
[`docs/api/face-urls.md`](./docs/api/face-urls.md).

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

Measured from each vendored Liberation face's own `cmap`
(`font.glyphIndexForCodePoint` over each block's code points) — identical
across the 12 Liberation faces, the ones the default route embeds (Carlito
and Caladea are not measured here):

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

Each vendored family keeps its own licence:

| Family | Licence | Licence text | Notice |
|---|---|---|---|
| Liberation Sans, Serif, Mono 2.1.5 | SIL OFL 1.1, Reserved Font Names `Liberation`, `Arimo`, `Tinos`, `Cousine` | [`vendor/OFL.txt`](./vendor/OFL.txt) | [`vendor/NOTICE-liberation`](./vendor/NOTICE-liberation) |
| Carlito 1.103 | SIL OFL 1.1, Reserved Font Name `Carlito` | [`vendor/OFL-carlito.txt`](./vendor/OFL-carlito.txt) | [`vendor/NOTICE-carlito`](./vendor/NOTICE-carlito) |
| Caladea 1.002 | Apache License 2.0 | [`vendor/LICENSE-apache-2.0.txt`](./vendor/LICENSE-apache-2.0.txt) | [`vendor/NOTICE-caladea`](./vendor/NOTICE-caladea) |

Caladea is the 2013 build, the one that keeps Cambria's metrics; a later
Caladea published under the OFL has other metrics and is not this payload.

**Never pre-subset or otherwise modify the vendored faces.** OFL 1.1
condition 3 forbids distributing a Modified Version under a Reserved Font
Name, and the licence defines "Modified Version" to include any change to
the font's format — which includes subsetting. A pre-subsetted face could
no longer be called "Liberation" (or "Carlito"); Caladea is vendored
unmodified too. This is unnecessary in any case:
`@awacloud/oconv` already subsets at PDF-embed time, so the emitted PDF
carries only the glyphs actually used — the full 20-face vendored weight
is a tarball concern, never a runtime one.

## Payload

20 faces, TrueType flavour, vendored byte-identical: the 12 Liberation
faces of release 2.1.5 (**4 359 164 bytes**, `vendor/liberation/*.ttf`),
the 4 Carlito faces (**2 766 644 bytes**, `vendor/carlito/*.ttf`) and the
4 Caladea faces (**241 544 bytes**, `vendor/caladea/*.ttf`), from the
Chrome OS archives `crosextrafonts-carlito-20130920` and
`crosextrafonts-20130214`. Per-file provenance and sha256 pins live in
[`vendor/PROVENANCE.json`](./vendor/PROVENANCE.json); integrity is pinned by
`vendor/provenance.test.js`.

## Tests

```bash
bun test packages/front/office/oconv-fonts/
```

## Exposed sub-paths

| Sub-path | Target | Usage |
|---|---|---|
| `@awacloud/oconv-fonts` | `src/main.js` | The entry point: re-exports `createOconvDefaultFaces`, `loadDefaultFaces`, `registerDefaultFaces` and `faceUrls`; nothing is fetched or registered at import. |
| `@awacloud/oconv-fonts/faces.js` | `src/faces.js` | `createOconvDefaultFaces(faces)` — builds the `oconvDefaultFaces` descriptor around five font programs you already hold. |
| `@awacloud/oconv-fonts/loader.js` | `src/loader.js` | `loadDefaultFaces(opts)` (the async byte path), `registerDefaultFaces(runtime, opts)` (load, then register) and `faceUrls(opts)` (every vendored face's URL). |

The `.js`-suffixed keys are the form to import from browser code: an import
map that maps `@awacloud/oconv-fonts/` to a path prefix resolves them
directly. See the [API index](./docs/api/README.md) for one page per exported
function.

## Maturity

`L3` (`awa.maturity` in `package.json`): the four exported functions each have
an API page, the source is covered at 100.00 % of the declared `src/**` basis
against a `0.98` floor, the tarball contents (including the licence files and
all 20 faces) are pinned by an integration test, and the sha256 of every
vendored face is pinned.

## Licence

This package's own JavaScript is [`AGPL-3.0-only`](./LICENSE); a commercial
licence is also available (see [`NOTICE`](./NOTICE)). Copyright (c) 2026
AwaCloud SAS. The vendored fonts keep their own licences, the SIL OFL 1.1
(Liberation, Carlito) and the Apache License 2.0 (Caladea) — see
[Vendored fonts](#vendored-fonts) above.

## Project

- Website: https://awaforge.eu
- Source: [`packages/front/office/oconv-fonts`](https://github.com/awacloud/awa/tree/@awacloud/oconv-fonts@1.1.0/packages/front/office/oconv-fonts)
- Issues: https://github.com/awacloud/awa/issues
- Security policy: [`SECURITY.md`](https://github.com/awacloud/awa/blob/@awacloud/oconv-fonts@1.1.0/SECURITY.md)
