# `@awacloud/odf` — Documentation

Documentation index for the ODF package (`awa.maturity: "L4"`).

## Guides

- [Getting started](./guide/getting-started.md) — first read/write
- [Read & write `.odt`](./guide/read-write-odt.md) — practical examples
- [Read & write `.ods`](./guide/read-write-ods.md)
- [Read & write `.odp`](./guide/read-write-odp.md)
- [Pkg overview](./guide/pkg-overview.md) — ZIP + mimetype + manifest layout
- [Coverage tiers](./guide/coverage.md) — L0 → L4 maturity layering
- [Extending](./guide/extending.md) — hook `.use(...)` + extras

## API reference

- [API index](./api/README.md)
- Core: [errors](./api/errors.md), [meta](./api/meta.md),
  [settings](./api/settings.md)
- XML codec consumed from `@awacloud/fw/io/codec/xml.js` (no local page)
- Pkg: [pkg/mimetype](./api/pkg/mimetype.md), [pkg/manifest](./api/pkg/manifest.md),
  [pkg/package](./api/pkg/package.md)
- Style: [style/styles](./api/style/styles.md)
- Text: [text/paragraph](./api/text/paragraph.md), [text/content](./api/text/content.md)
- Orchestrators: [odt/odt](./api/odt/odt.md), [ods/ods](./api/ods/ods.md), [odp/odp](./api/odp/odp.md)

## Status

`awa.maturity: "L4"` — publication-ready (code/tests/docs).
Legal metadata (`license`, `author`, `repository`, …) is pending — see
the root [`CHANGELOG.md`](../CHANGELOG.md) before publishing.
