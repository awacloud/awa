# Playground — Integrations

One minimal runnable example per `@awacloud/fw` integration. Each
sub-directory has a `README.md` (goal, files, run command). Integration
scope: [`../../integrations/README.md`](../../integrations/README.md).

> Third-party tools (bundlers, runners) install on demand (`bun run setup:e2e` /
> `setup:vitest` / `setup:jest` from the fw package root), consistent with the
> lean policy.

**Every command below runs from the example's own directory**
(`cd playground/integrations/<name>`).

| Example | Integration | Demonstrates |
|---|---|---|
| [vite](./vite/README.md) | `@awacloud/fw/vite` | virtual preset + sanity, dev server |
| [esbuild](./esbuild/README.md) | `@awacloud/fw/esbuild` | consumer plugin via `esbuild.build` |
| [rollup](./rollup/README.md) | `@awacloud/fw/rollup` | consumer plugin via `rollup -c` |
| [bun](./bun/README.md) | `@awacloud/fw/bun` | `Bun.build` + runtime preload |
| [webpack](./webpack/README.md) | `@awacloud/fw/webpack` | `FwWebpackPlugin` (WP5 schemes) |
| [astro](./astro/README.md) | `@awacloud/fw/astro` | island + SSR data |
| [next](./next/README.md) | `@awacloud/fw/next` | `withFw` + client component + SSR |
| [nest](./nest/README.md) | `@awacloud/fw/nest` | `FwModule.forFeature` providers |
| [vitest](./vitest/README.md) | `@awacloud/fw/vitest` | `bun:test` suite under Vitest |
| [jest](./jest/README.md) | `@awacloud/fw/jest` | `bun:test` suite under Jest |
| [typedoc](./typedoc/README.md) | `@awacloud/fw/typedoc` | generated API reference |
| [eslint](./eslint/README.md) | ESLint | `fw/no-factory-capture` in action |
| [nodejs](./nodejs/README.md) | Node target | consumption + build under plain Node |
| [deno](./deno/README.md) | Deno target | consumption under Deno (`npm:`/import map) |
