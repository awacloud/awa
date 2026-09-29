# Development — DX sheets

Practical sheets for **operating** the `@awacloud/fw` repo (running, building, generating), distinct from the *writing* guides (`../guide/`). `fw` is self-contained: it can be cloned and developed standalone, under **bun** (default) or **Node**.

| Sheet | Subject |
|---|---|
| [runtime.md](./runtime.md) | Dev runtime choice: bun by default vs Node — which task, which prerequisites, lean install policy. |
| [testing.md](./testing.md) | Running the suite (bun / Node-vitest), categories, extended crypto, KAT/ACVP vectors. |
| [types.md](./types.md) | Generating `.d.ts`, typed registry, audit. |
| [provenance.md](./provenance.md) | Origin of third-party-derived code (SJCL, BSD-2-Clause; TweetNaCl, public domain; Penner easing equations, BSD); the notices shipped out of prudence live under `third-party/`. |
| [publishing.md](./publishing.md) | **Lean** npm package (consumer) + transparency via git/CDN-git + CDN usage. |

Quick start (mono-repo **or** standalone clone):

```sh
cd packages/front/fw
bun install
bun run test         # tests under bun
bun run prebuild     # build bundles
# Node variant:
bun run setup:vitest && bun run test:vitest
bun run prebuild:node
```

See also: [writing tests](../guide/test-format.md) · [internal tooling](../tools/README.md) · [integrations](../../integrations/README.md).
