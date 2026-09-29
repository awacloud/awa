# Playground — Bun consumer

Runnable example of a third-party app consuming `@awacloud/fw` virtual presets via
the official [`@awacloud/fw/bun`](../../../integrations/bun/README.md) plugin
(default export `fwBun`).

> **Distinct from fw's internal builder** (`tools/fw-bundler` (`bundle`)). That builder
> uses `Bun.build` to emit `dist/build/*` for fw itself. Here we are a *consumer*:
> our own `src/app.js` is bundled with the consumer plugin.

## Run

```sh
bun build.ts && bun dist/app.js
```

Run from this directory. `build.ts` calls `Bun.build({ entrypoints: ['./src/app.js'], outdir: './dist', plugins: [fwBun({ preset: 'core' })] })`.
The plugin resolves the `virtual:@awacloud/fw/preset/core` import in `src/app.js` and
emits a pre-instantiated runtime. Output lands in `dist/app.js`; `bun dist/app.js` runs it.

Expected output:

```
preset "core" modules: errors, eventBus, signal, valid, ui8, abort, clock
resolved clock: object now = <timestamp>
```

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
