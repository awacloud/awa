# Playground — Deno

Consumer-style example: run `@awacloud/fw` under Deno using native Web APIs, through
an import map onto the in-repo sources (no install, no build). See the integration doc:
[`integrations/deno/README.md`](../../../integrations/deno/README.md).

## Run

```sh
deno run --allow-read app.ts
```

Run from this directory (or `deno task start`).

## Files

- `deno.json` — import map (`@awacloud/fw` → `../../../src/main.js`, `@awacloud/fw/` →
  `../../../src/`) + `start` task.
- `app.ts` — builds a `ModuleRuntime`, registers worker-safe modules (`hex`,
  `utf8`, `sha256`), runs a small op (SHA-256 of `"Hi"` → hex via
  `bitArray.ba_to_ui8`), and confirms native Web APIs (`crypto.subtle`,
  `crypto.getRandomValues`, `TextEncoder`, `structuredClone`).

## Notes

- **In-repo sources, by design**: the import map points at `../../../src/`, so the
  project runs on the working tree with nothing to install. A consumer of the
  published package maps `@awacloud/fw` to `npm:@awacloud/fw` instead (see the
  integration doc).
- **Tests run via Vitest, not `deno test`** — `deno test` has its own API with no
  `expect()`, so the `bun:test` shim doesn't map. See
  [`integrations/vitest/`](../../../integrations/vitest/README.md).
- **Worker serialization is the point to validate under Deno.** The core fw
  model is `runtime.serialize(specs)` → `new Worker(url, { type: 'module' })`.
  It's Web-standard so it should work, but the Deno Worker context differs from a
  browser's — this is the one thing that still needs a real Deno run to confirm.
