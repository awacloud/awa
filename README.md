# awa

> Zero-dependency JavaScript browser framework, WebAssembly crypto, and office libraries for PDF, Word, Excel, ODF and Markdown.

`awa` is the published part of the awa platform, for developers who want to
build on plain ES modules without a mandatory bundler. It carries two sets of
packages: the Apache-2.0 core — the `@awacloud/fw` browser framework (zero
npm runtime dependencies), its WebAssembly crypto companion, and the three
build tools that produce them — and the AGPL-3.0-only / commercial office
libraries — `@awacloud/pdf`, `@awacloud/ooxml`, `@awacloud/odf`,
`@awacloud/md`, `@awacloud/fonts`, the `@awacloud/oconv` document
converter with its `@awacloud/oconv-fonts` font companion, and the
`@awacloud/tool-convert` command-line tool. The wider SDE/SDC platform
(Software Defined Environment / Container) is built on these same
packages; it is not part of this repository's published subset. The
repository also carries the sources of two browser apps, AWA Viewer and AWA
Notepad (see [Apps](#apps)).

## Quick start

Install one package, here the framework, from the npm registry:

```bash
npm i @awacloud/fw
```

Then, on Bun (or any ESM runtime that resolves the package), import the entry
and resolve modules from the runtime:

```js
import fw from '@awacloud/fw';
import modules from '@awacloud/fw/core/modules.js';
fw.runtime.registerAll(modules);

const hex = fw.runtime.resolve('hex');
const utf8 = fw.runtime.resolve('utf8');
console.log(hex.fromBytes(utf8.toBytes('fw')));   // 6677
```

The package's own README covers the browser setup with an import map; the
other packages are listed below, each with its own README.

## Published packages

The Apache-2.0 packages were first published at `0.1.0` on 2026-09-29 (lot
1); the office libraries were published at `1.0.0` on 2026-10-07 (lot 2),
seven of them at `1.1.0` on 2026-10-21 (`@awacloud/oconv-fonts` was not
re-released then), and eight of them again on 2026-11-04, all at `1.2.0`
but `@awacloud/oconv-fonts` at `1.1.0`: `@awacloud/pdf`, `@awacloud/ooxml`,
`@awacloud/odf`, `@awacloud/oconv`, `@awacloud/tool-convert`, `@awacloud/md`,
`@awacloud/fonts` and `@awacloud/oconv-fonts`. The `Published` column gives
the latest version on the npm registry and the day it was published.

| Package | Directory | Repository | npm | Published | Lot | Licence |
|---|---|---|---|---|---|---|
| `@awacloud/fw` | [`packages/front/fw`](packages/front/fw/) | [`awacloud/fw`](https://github.com/awacloud/fw) | [`@awacloud/fw`](https://www.npmjs.com/package/@awacloud/fw) | `0.1.0` · 2026-09-29 | 1 | Apache-2.0 |
| `@awacloud/fw-wasm-crypto` | [`packages/front/fw-wasm-crypto`](packages/front/fw-wasm-crypto/) | [`awacloud/fw-wasm-crypto`](https://github.com/awacloud/fw-wasm-crypto) | [`@awacloud/fw-wasm-crypto`](https://www.npmjs.com/package/@awacloud/fw-wasm-crypto) | `0.1.0` · 2026-09-29 | 1 | Apache-2.0 |
| `@awacloud/tool-fw-bundler` | [`tools/fw-bundler`](tools/fw-bundler/) | [`awacloud/tool-fw-bundler`](https://github.com/awacloud/tool-fw-bundler) | [`@awacloud/tool-fw-bundler`](https://www.npmjs.com/package/@awacloud/tool-fw-bundler) | `0.1.0` · 2026-09-29 | 1 | Apache-2.0 |
| `@awacloud/tool-fw-codegen` | [`tools/fw-codegen`](tools/fw-codegen/) | [`awacloud/tool-fw-codegen`](https://github.com/awacloud/tool-fw-codegen) | [`@awacloud/tool-fw-codegen`](https://www.npmjs.com/package/@awacloud/tool-fw-codegen) | `0.1.0` · 2026-09-29 | 1 | Apache-2.0 |
| `@awacloud/tool-wasm-crypto` | [`tools/wasm-crypto`](tools/wasm-crypto/) | [`awacloud/tool-wasm-crypto`](https://github.com/awacloud/tool-wasm-crypto) | [`@awacloud/tool-wasm-crypto`](https://www.npmjs.com/package/@awacloud/tool-wasm-crypto) | `0.1.0` · 2026-09-29 | 1 | Apache-2.0 |
| `@awacloud/pdf` | [`packages/front/office/pdf`](packages/front/office/pdf/) | [`awacloud/pdf`](https://github.com/awacloud/pdf) | [`@awacloud/pdf`](https://www.npmjs.com/package/@awacloud/pdf) | `1.2.0` · 2026-11-04 | 2 | AGPL-3.0-only |
| `@awacloud/ooxml` | [`packages/front/office/ooxml`](packages/front/office/ooxml/) | [`awacloud/ooxml`](https://github.com/awacloud/ooxml) | [`@awacloud/ooxml`](https://www.npmjs.com/package/@awacloud/ooxml) | `1.2.0` · 2026-11-04 | 2 | AGPL-3.0-only |
| `@awacloud/odf` | [`packages/front/office/odf`](packages/front/office/odf/) | [`awacloud/odf`](https://github.com/awacloud/odf) | [`@awacloud/odf`](https://www.npmjs.com/package/@awacloud/odf) | `1.2.0` · 2026-11-04 | 2 | AGPL-3.0-only |
| `@awacloud/md` | [`packages/front/office/md`](packages/front/office/md/) | [`awacloud/md`](https://github.com/awacloud/md) | [`@awacloud/md`](https://www.npmjs.com/package/@awacloud/md) | `1.2.0` · 2026-11-04 | 2 | AGPL-3.0-only |
| `@awacloud/fonts` | [`packages/front/office/fonts`](packages/front/office/fonts/) | [`awacloud/fonts`](https://github.com/awacloud/fonts) | [`@awacloud/fonts`](https://www.npmjs.com/package/@awacloud/fonts) | `1.2.0` · 2026-11-04 | 2 | AGPL-3.0-only |
| `@awacloud/oconv` | [`packages/front/office/oconv`](packages/front/office/oconv/) | [`awacloud/oconv`](https://github.com/awacloud/oconv) | [`@awacloud/oconv`](https://www.npmjs.com/package/@awacloud/oconv) | `1.2.0` · 2026-11-04 | 2 | AGPL-3.0-only |
| `@awacloud/oconv-fonts` | [`packages/front/office/oconv-fonts`](packages/front/office/oconv-fonts/) | [`awacloud/oconv-fonts`](https://github.com/awacloud/oconv-fonts) | [`@awacloud/oconv-fonts`](https://www.npmjs.com/package/@awacloud/oconv-fonts) | `1.1.0` · 2026-11-04 | 2 | AGPL-3.0-only |
| `@awacloud/tool-convert` | [`tools/convert`](tools/convert/) | [`awacloud/tool-convert`](https://github.com/awacloud/tool-convert) | [`@awacloud/tool-convert`](https://www.npmjs.com/package/@awacloud/tool-convert) | `1.2.0` · 2026-11-04 | 2 | AGPL-3.0-only |

### Install

Install only the packages you use, from the npm registry.

Lot 1, published 2026-09-29:

```bash
npm i @awacloud/fw
npm i @awacloud/fw-wasm-crypto
npm i @awacloud/tool-fw-bundler
npm i @awacloud/tool-fw-codegen
npm i @awacloud/tool-wasm-crypto
```

Lot 2, published 2026-10-07:

```bash
npm i @awacloud/pdf
npm i @awacloud/ooxml
npm i @awacloud/odf
npm i @awacloud/md
npm i @awacloud/fonts
npm i @awacloud/oconv
npm i @awacloud/oconv-fonts
npm i @awacloud/tool-convert
```

The browser packages — `@awacloud/fw` and the seven office libraries — are
plain ES modules with no bundler required: a statically served page maps
each package name to its files through an import map. Each package's own
README shows its setup, and the documentation at https://awaforge.eu/docs/
walks through a first import map.

The `cli.ts` router and this monorepo's other tooling are not published; commands shown elsewhere as `bun cli.ts …` do not apply to this tree — each build tool package above ships its own `bin` command once installed (`fw-bundler`, `fw-codegen`, `wasm-crypto`); `@awacloud/tool-convert` declares no `bin` — its command-line entry file is run by path, as its own README shows.

Each derived repository above is a read-only mirror; issues are disabled
there. Report issues at https://github.com/awacloud/awa/issues.

## Apps

| App | Directory | Live at | Licence |
|---|---|---|---|
| AWA Viewer | [`apps/services/viewer`](apps/services/viewer/) | https://viewer.awacloud.com/ | AGPL-3.0-only |
| AWA Notepad | [`apps/services/notepad`](apps/services/notepad/) | https://notepad.awacloud.com/ | AGPL-3.0-only |

AWA Viewer opens PDF, Word, Excel, PowerPoint, OpenDocument, Markdown and
plain-text documents in the browser, and AWA Notepad is a plain-text editor;
both are installable web apps and neither uploads what you open. They are
not published to npm, so there is no `npm i` line for them. Their sources are
carried here for reading and audit; their build and tests run from the full
monorepo, and the viewer's core is a package that is not part of this
repository's published subset.

## Experimental packages

Work in progress - Experimental - R&D: these packages are shared as source
only and are not published to npm, so there is no `npm i` line for them;
their API may change or disappear and they carry no support commitment.

| Package | Directory | Licence |
|---|---|---|
| `@awacloud/media-audio` | [`packages/front/media/audio`](packages/front/media/audio/) | AGPL-3.0-only |
| `@awacloud/media-stream` | [`packages/front/media/stream`](packages/front/media/stream/) | AGPL-3.0-only |
| `@awacloud/media-video` | [`packages/front/media/video`](packages/front/media/video/) | AGPL-3.0-only |

## Licence

`Copyright (c) 2026 AwaCloud SAS`. This repository publishes packages under
two licensing regimes: Apache-2.0, and AGPL-3.0-only with a commercial
licence available from AwaCloud SAS. Each package's own `package.json`
`license` field, and its own `LICENSE` and `NOTICE`, decide which regime
applies to it — see the table above. The full, unmodified text of both
regimes is carried at the repository root:
[`LICENSES/Apache-2.0.txt`](LICENSES/Apache-2.0.txt) and
[`LICENSES/AGPL-3.0-only.txt`](LICENSES/AGPL-3.0-only.txt). The `NOTICE`
of each AGPL-3.0-only package also carries additional terms under section 7
of the AGPL-3.0, and names where the commercial licence is offered:
https://awacloud.com/offers.

AWACLOUD and AWA are trademarks of Towards Conseil, used under licence.

## Project

- Security: [SECURITY.md](SECURITY.md) — vulnerability reporting and
  release verification ([§ Release integrity](SECURITY.md#release-integrity),
  [§ Release keys](SECURITY.md#release-keys)).
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).
- Maintenance: [MAINTENANCE.md](MAINTENANCE.md) — versioning, support
  windows and release discipline.
- Website: https://awaforge.eu/ — documentation.
