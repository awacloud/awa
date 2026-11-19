# Playground — Bun consumer

Runnable example of a third-party app consuming `@awacloud/fw` virtual presets via
the official [`@awacloud/fw/bun`](../../../integrations/bun/README.md) plugin
(default export `fwBun`).

> **Distinct from fw's internal builder** (`tools/fw-bundler` (`bundle`)). That builder
> uses `Bun.build` to emit `dist/build/*` for fw itself. Here we are a *consumer*:
> our own `src/app.js` is bundled with the consumer plugin.

## Run

Once, from `packages/front/fw`: `bun run setup:playground` (it builds the fw bundles and type declarations the playgrounds read; both are git-ignored, a published package ships them). Then, from this directory:

```sh
bun run start
```

No install step: `build.ts` resolves `@awacloud/fw/bun` from the in-repo package. It calls `Bun.build({ entrypoints: ['./src/app.js'], outdir: './dist', plugins: [fwBun({ preset: 'core' })] })`, which resolves the `virtual:@awacloud/fw/preset/core` import and emits a pre-instantiated runtime to `dist/app.js`; `bun dist/app.js` runs it.

## Runtime variant (`bunfig.toml` preload)

Instead of a build step, the same plugin can be preloaded so the virtual import
is resolved at execution time (cf. the integration README). Add:

```toml
# bunfig.toml
preload = ["./fw-register.js"]
```

```js
// fw-register.js
import { plugin } from 'bun';
import fwBun from '@awacloud/fw/bun';

plugin(fwBun({ preset: 'core' }));
```

Then `bun run src/app.js` resolves `virtual:@awacloud/fw/preset/core` directly — no
`dist/` needed. Note: the `sanity` option is build-time only (it injects on
`Bun.build` entrypoints); in preload mode import the sanity layer manually.
