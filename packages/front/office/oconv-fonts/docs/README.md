# Documentation `@awacloud/oconv-fonts`

The SIL OFL companion of `@awacloud/oconv` — vendored Liberation 2.1.5
Sans/Serif/Mono font faces (12 TrueType programs) registered as an
`@awacloud/fw` descriptor so `oconv`'s `md → pdf` route embeds real faces by
default instead of falling back to the PDF Standard 14. See the
[package README](../README.md) for the high-level overview, installation,
coverage table and licence.

## Guides

| Guide | Topic |
|---|---|
| [`descriptor.md`](./descriptor.md) | The frozen `oconvDefaultFaces` contract — resolved API, frozen surface, the per-style-class precedence rule (`explicit opts.pdf.fonts[<class>] > default map[<class>] > Standard 14`, the default map being a posted `defaultFaces` map — which wins whole — else the registered `oconvDefaultFaces`) and worked examples. |

## API reference

Per-module reference, mirroring `src/`: see the [API index](./api/README.md)
— one page per public member (3 pages, `createOconvDefaultFaces` /
`loadDefaultFaces` / `registerDefaultFaces`).

## Project documents

- [README](../README.md) — package overview, installation, Quick Start,
  coverage table, licence.
- [CHANGELOG](../CHANGELOG.md) — the package changelog.
