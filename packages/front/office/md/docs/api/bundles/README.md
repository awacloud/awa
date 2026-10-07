# Bundles `@awacloud/md`

`@awacloud/md` ships **one** pre-wired composition, [`md-full`](./md-full.md) (core + all 10 extras). The core surface is simply the [`md`](../md.md) module itself, resolved directly (see [`bundles/md.md`](./md.md)).

**Prerequisites**: the `ModuleRuntime` registration of `fw_require`, `modules`, `extras` and `bundle` shown on [`md-full`](./md-full.md), or the pre-built `dist/` roots below.

| Bundle | Source | Includes | Helper |
|--------|--------|----------|--------|
| [`md`](./md.md) (the core, no wrapper) | `src/md.js` | Core only (CommonMark + GFM) | `runtime.resolve('md')` |
| [`md-full`](./md-full.md) | `src/bundles/md-full.js` | Core + 10 pre-wired extras | `runtime.resolve('mdFullBundle')` |

## Choosing

| Need | Bundle |
|------|--------|
| CommonMark + GFM Markdown only | Resolve [`md`](../md.md) directly |
| Frontmatter + math + footnotes + wikilinks + … | [`md-full`](./md-full.md) |
| Custom selection | `md.createMd().use(...)` chaining |

## Composition

`md ⊂ md-full` strictly — `md-full` is a superset (core + 10 `.use(...)` calls).

## Pre-built alternative

For zero-setup consumption (no `ModuleRuntime` registration), each of the 2 assembly roots is also available pre-built under `dist/` (`dist/standalone/md.js` / `dist/standalone/md-full.js`, deps `[]`) — see [Getting started](../../guide/getting-started.md#pre-built-bundles-worker--zero-setup).

## See also

- [Extras](../extra/README.md) — detail of each opt-in module
- [Coverage](../../guide/coverage.md) — tiers + scope
- [Getting started](../../guide/getting-started.md)
