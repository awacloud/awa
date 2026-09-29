# awa

`awa` is the published core of the awa platform: the
`@awacloud/fw` browser framework (zero npm runtime dependencies), its WebAssembly crypto companion, and
the three build tools that produce them. The wider SDE/SDC platform
(Software Defined Environment / Container) is built on these same
packages; it is not part of this repository's published subset.

## Published packages

No release of these packages has been published yet — the table below
names their publication targets.

| Package | Directory | Repository | npm | Licence |
|---|---|---|---|---|
| `@awacloud/fw` | [`packages/front/fw`](packages/front/fw/) | [`awacloud/fw`](https://github.com/awacloud/fw) | [`@awacloud/fw`](https://www.npmjs.com/package/@awacloud/fw) | Apache-2.0 |
| `@awacloud/fw-wasm-crypto` | [`packages/front/fw-wasm-crypto`](packages/front/fw-wasm-crypto/) | [`awacloud/fw-wasm-crypto`](https://github.com/awacloud/fw-wasm-crypto) | [`@awacloud/fw-wasm-crypto`](https://www.npmjs.com/package/@awacloud/fw-wasm-crypto) | Apache-2.0 |
| `@awacloud/tool-fw-bundler` | [`tools/fw-bundler`](tools/fw-bundler/) | [`awacloud/tool-fw-bundler`](https://github.com/awacloud/tool-fw-bundler) | [`@awacloud/tool-fw-bundler`](https://www.npmjs.com/package/@awacloud/tool-fw-bundler) | Apache-2.0 |
| `@awacloud/tool-fw-codegen` | [`tools/fw-codegen`](tools/fw-codegen/) | [`awacloud/tool-fw-codegen`](https://github.com/awacloud/tool-fw-codegen) | [`@awacloud/tool-fw-codegen`](https://www.npmjs.com/package/@awacloud/tool-fw-codegen) | Apache-2.0 |
| `@awacloud/tool-wasm-crypto` | [`tools/wasm-crypto`](tools/wasm-crypto/) | [`awacloud/tool-wasm-crypto`](https://github.com/awacloud/tool-wasm-crypto) | [`@awacloud/tool-wasm-crypto`](https://www.npmjs.com/package/@awacloud/tool-wasm-crypto) | Apache-2.0 |

The `cli.ts` router and this monorepo's other tooling are not published; commands shown elsewhere as `bun cli.ts …` do not apply to this tree — each tool package above ships its own `bin` command once installed (`fw-bundler`, `fw-codegen`, `wasm-crypto`).

Each derived repository above is a read-only mirror; issues are disabled
there. Report issues at https://github.com/awacloud/awa/issues.

## Project

- Security: [SECURITY.md](SECURITY.md) — vulnerability reporting and
  release verification ([§ Release integrity](SECURITY.md#release-integrity),
  [§ Release keys](SECURITY.md#release-keys)).
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).
- Maintenance: [MAINTENANCE.md](MAINTENANCE.md) — versioning, support
  windows and release discipline.
- Website: https://awaforge.eu.

## Licence

`Copyright (c) 2026 AwaCloud SAS`. This repository publishes packages under
two licensing regimes: Apache-2.0, and AGPL-3.0-only with a commercial
licence available from AwaCloud SAS. Each package's own `package.json`
`license` field, and its own `LICENSE` and `NOTICE`, decide which regime
applies to it — see the table above. The full, unmodified text of both
regimes is carried at the repository root:
[`LICENSES/Apache-2.0.txt`](LICENSES/Apache-2.0.txt) and
[`LICENSES/AGPL-3.0-only.txt`](LICENSES/AGPL-3.0-only.txt).

AWACLOUD and AWA are trademarks of Towards Conseil, used under licence.
