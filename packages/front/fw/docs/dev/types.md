# Type generation

Practical guide. For TypeScript usage on the **consumer** side (runtime typing, `InstanceOf`, etc.), see [`../guide/typescript.md`](../guide/typescript.md).

The source `.js` files (annotated with JSDoc) remain the authority; the `.d.ts` files are **generated** in `dist/types/` and published in the tarball.

```sh
bun run types          # tsc → dist/types/**/*.d.ts (+ .d.ts.map)
bun run types:watch    # watch mode
```

> **`tsc` does NOT clean its `outDir`**: stale `.d.ts` files can accumulate in `dist/types/` (renamed/deleted source files). Cleanup is **manual** — before a clean types build/publication:
> ```sh
> rm -rf dist/types && bun run types
> ```
> `bun run docs:api` already does this `rm -rf dist/types` upfront, so the TypeDoc reference always starts from a clean tree.

Under Node without bun: `npx tsc -p tsconfig.types.json` (the `tsconfig.types.json` is self-contained — no `extends` to the root; `typescript` is a committed devDependency).

## Typed registry

```sh
bun run types:registry         # (re)generates the typed runtime registry
bun run types:registry:check   # verifies it is up to date (CI)
```

## Audit

```sh
bun run types:audit            # reports overly broad @returns to tighten
```

Tooling details: [`../tools/codegen.md`](../tools/codegen.md), [`../tools/audit.md`](../tools/audit.md).

> Co-location of `.d.ts` files in `src/` was attempted then abandoned: tsc refuses to overwrite a file already seen as a companion declaration (input/output collision). Generated declarations therefore live in `dist/types/`.
