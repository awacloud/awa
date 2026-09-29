# `@awacloud/fw/turbopack`

`fwTurbopack()` — Turbopack has no plugin API, so this adapter materializes fw's virtual modules to real files and returns a `turbopack.resolveAlias` map.

## Usage

Via the Next.js integration (`withFw` wires this adapter in automatically for `next dev --turbopack` / Next ≥16 default — nothing to do on your side):

```js
// next.config.mjs
import withFw from '@awacloud/fw/next';

export default withFw(
    { /* your Next config */ reactStrictMode: true },
    { preset: 'site-interactive' },
);
```

Direct usage (any Turbopack-based tool accepting a resolve-alias map):

```js
import { fwTurbopack } from '@awacloud/fw/turbopack';
const { resolveAlias } = fwTurbopack({ preset: 'site-interactive' });
// → { 'virtual:@awacloud/fw/preset': './.fw-virtual/preset-default.js', … }
```

## Options

| Option | Type | Default | Role |
|---|---|---|---|
| `preset` | `string` | `'site'` | Default preset for the bare `virtual:@awacloud/fw/preset` specifier. |
| `sideBundles` | `string[]` | `[]` | Side-bundles validated up-front. |
| `packageName` | `string` | `'@awacloud/fw'` | Package specifier used in the emitted imports. |
| `configPath` | `string` | bundled | Override `fw.config.json` path. |
| `outDir` | `string` | `'.fw-virtual'` | Directory (relative to cwd) receiving the materialized modules. |

## Notes

- **The one adapter here that is not side-effect-free at construction.**
  Reading any property of the returned `resolveAlias` (access, `Object.keys`,
  a `{ ...spread }`) — or calling the returned `materialize()` explicitly —
  lazily runs `rmSync` + `mkdirSync` + `writeFileSync` into `cwd/.fw-virtual`
  by default. Merely calling `fwTurbopack(...)` never touches disk. Import/
  construction gates (tests, config inspection) must pass an absolute
  temporary `outDir` to avoid writing into the repo. See
  [Bundler integration § Side-effecting modules](../../docs/guide/integration-bundlers.md#side-effecting-modules).
- **Consumed by the Next.js adapter** for `next dev --turbopack` / Next ≥16
  (Turbopack default) — see [`../nextjs/README.md`](../nextjs/README.md).
- Same shared core as every adapter: `../_shared/core.js` emits code against
  the committed catalog (`_shared/catalog.generated.json`), so the generated
  modules are identical to those produced by the other bundler integrations.

## See also

- [Integrations overview](../README.md)
- [Next.js integration](../nextjs/README.md)
