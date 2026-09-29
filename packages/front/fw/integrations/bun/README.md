# `@awacloud/fw/bun`

Official Bun plugin — **consumer role**. For a third-party app built or run with Bun that wants the `@awacloud/fw` virtual modules.

> **Distinct from the internal builder.** `tools/fw-bundler` (`bundle`) already uses `Bun.build` to produce `dist/build/*`. This plugin is the *consumer* bridge — same engine, different scope.

`Bun.plugin` mirrors the esbuild `onResolve`/`onLoad` API: it is the shortest adapter. Emitted code is identical to Vite/esbuild/Rollup.

## Usage — build

```js
import fwBun from '@awacloud/fw/bun';

await Bun.build({
    entrypoints: ['./src/app.js'],
    outdir: './dist',
    plugins: [fwBun({ preset: 'site-interactive', sanity: 'base' })],
});
```

## Usage — runtime (`bunfig.toml`)

```toml
# bunfig.toml
preload = ["./fw-register.js"]
```

```js
// fw-register.js
import { plugin } from 'bun';
import fwBun from '@awacloud/fw/bun';

plugin(fwBun({ preset: 'site' }));
```

```js
// app.js — resolved at runtime via the preloaded plugin
import { runtime } from 'virtual:@awacloud/fw/preset/site';
```

## Virtual modules

| Specifier | Content |
|---|---|
| `virtual:@awacloud/fw/preset` | pre-instantiated runtime for the default preset |
| `virtual:@awacloud/fw/preset/<name>` | same for preset `<name>` |
| `virtual:@awacloud/fw/side-bundle/<name>` | `install(runtime)` + `modules` |

## Options

| Option | Type | Default | Role |
|---|---|---|---|
| `preset` | `string` | `'site'` | preset of the specifier without suffix |
| `sideBundles` | `string[]` | `[]` | side-bundles validated at startup |
| `sanity` | `'base' \| 'community' \| 'lockdown' \| false` | `false` | sanity layer on each entry (**build-time only**) |
| `packageName` | `string` | `'@awacloud/fw'` | specifier used in emitted imports |
| `configPath` | `string` | bundled | override for `fw.config.json` |

## Notes

- **Sanity**: injected on `entrypoints` at build time (`build.config.entrypoints`). `'lockdown'` emits `import { lockdown } from '…'; lockdown();` (explicit-call module, not an IIFE). In runtime mode (`plugin()`), `build.config` is absent → import manually (`import { applyBase } from '@awacloud/fw/sanity/base'; applyBase();` or `import { lockdown } from '@awacloud/fw/sanity/lockdown'; lockdown();`). Browser-only.
- **Dual use**: the same plugin object works for both `Bun.build({ plugins })` and the runtime `plugin()`.
