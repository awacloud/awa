# Documentation `@awacloud/oconv`

Document conversion through the `oconv-ir/v1` pivot representation:
document-to-Markdown readers, the structured-markdown profile, the
`md → docx` / `md → odt` / `md → pdf` writers, and the `convert`
cross-format pairs. The [package README](../README.md) gives the overview,
installation, Quick Start and worker usage.

## Guides

| Guide | Topic |
|---|---|
| [`guide/getting-started.md`](./guide/getting-started.md) | From an empty module to one `toMd`, one `fromMd` and one `convert` call; where to read losses. |

## Reference pages

| Page | Topic |
|---|---|
| [`profile-v1.md`](./profile-v1.md) | The structured-markdown wire contract — every front-matter key, determinism/auditability, chunking usage, the loss-ledger vocabulary. |
| [`loss-matrix.md`](./loss-matrix.md) | The published Preserved/Degraded/Dropped fidelity table for every shipped to-md, from-md and cross-format pair. |
| [`convert.md`](./convert.md) | The `convert` facade member — signature, error order, allowlisted pairs, worker message. |
| [`pdf-writer.md`](./pdf-writer.md) | The `md → pdf` bounded typesetter — options, loss codes, font-route reference. |

## API reference

Per-module reference, mirroring `src/`, one page per public member: see the
[API index](./api/README.md).

## Project documents

- [README](../README.md) — package overview, Quick Start, worker usage.
- [CHANGELOG](../CHANGELOG.md) — the package changelog.
