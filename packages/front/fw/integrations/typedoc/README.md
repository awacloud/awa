# `@awacloud/fw` — TypeDoc

**Optional** generation of an HTML API reference from the framework types, as a complement to (not a replacement for) the hand-written docs at [`docs/api/`](../../docs/api/).

## Source: `dist/types/**` (strategy 1)

TypeDoc consumes the declarations already emitted by `bun run types` (JSDoc → tsc), so the generated docs reflect **exactly** the typed surface seen by TS consumers. No re-parsing of JSDoc.

## Output: `docs/api-generated/` (separate, generated)

The HTML docs are written to **`docs/api-generated/`** — a **distinct** subfolder from `docs/api/` (editorial) to avoid confusion. This folder is:

- **generated on demand**, never committed (`.gitignore`);
- **outside the npm tarball** (`package.json#files` → `!docs/api-generated/**`).

## Usage

```sh
bun run setup:typedoc    # installs typedoc on demand (not persisted)
bun run docs:api         # bun run types  →  typedoc --options integrations/typedoc/typedoc.json
```

Then open `docs/api-generated/index.html`. To publish (GitHub Pages, etc.), point CI at this folder.

## `docs:api` pipeline

```
rm -rf dist/types          # purge the outDir (tsc does not delete stale .d.ts files)
→ bun run types            # regenerate dist/types
→ categorize.js            # injects @module + @category (index grouping)
→ typedoc                  # generates docs/api-generated/
```

### Index categorization — [`categorize.js`](./categorize.js)
Without annotation, TypeDoc groups **all** modules under "Other" (it only groups by `@category`). The script derives the category from the **`type`** field of each module (`fw.io.codec` → `io/codec`, fallback: directory), and prepends a `/** @module <path> @category <cat> */` comment in the `dist/types` `.d.ts` files (never `src/`). Result: index grouped by taxonomy (`crypto/hash`, `dom/query`, `io/codec`…), aligned with the source of truth. Idempotent (already-tagged files, e.g. `notifications`, are respected). Only captures `type: 'fw.…'` — not nested `type:` values (`'audio'`, MIME…).

> **Purge `dist/types`**: `docs:api` runs `rm -rf dist/types` before `tsc` (which does not delete stale `.d.ts` files) — otherwise old files (vectors `*.kat.d.ts`, build remnants) pollute the index under "Other". The `types` script itself **does not purge** (intentionally manual); for a clean **publication** (the lean tarball ships `dist/types/**`), run `rm -rf dist/types && bun run types` beforehand.

## Configuration

- [`typedoc.json`](./typedoc.json) — `entryPoints: dist/types` (`entryPointStrategy: "expand"` → one documented module per file), `out: ../../docs/api-generated`, `excludeInternal/Private`. Excludes `*.test.d.ts`, `*.kat.d.ts`, `registry.generated.d.ts`, `typed.d.ts`.
- [`tsconfig.typedoc.json`](./tsconfig.typedoc.json) — minimal `compilerOptions` (no `include`, to avoid inheriting the `src/**/*.js` from `tsconfig.types.json`).

## Known limitation — double module/namespace page

Each fw module (`export const x = {…}`) is emitted by `tsc` as `export namespace x`. TypeDoc therefore generates **two pages**: the *module* page (the file, e.g. `io/codec/cbor`) and the *namespace* page (`cbor`, which carries the `name/version/deps/factory` descriptor). **No TypeDoc option merges** a module with its internal namespace (verified: no `inline`/`merge`/`flatten`). Mitigation: the `@module` is named by **path** (`io/codec/cbor`), distinct from the namespace (`cbor`), to remove the "cbor → cbor" confusion. A single page per module would require *unpacking* the namespace in the `.d.ts` files — fragile and tied to the descriptor-vs-useful-API (`CborAPI`) distinction, out of scope here.

## Relationship with `docs/api/`

- `docs/api/*.md` (hand-written, usage-oriented + Worker Usage + Notes) remains **canonical and editorial**.
- TypeDoc = **exhaustive generated reference** (complete signatures), useful for completeness/navigation.

## Notes

- `typedoc` is installed **on demand** (not a committed dependency) — like the other integration tools.
- Prerequisite: `dist/types` must exist → `docs:api` chains `bun run types` first.
- Quality reflects the actual state of `@returns` (see [`docs/tools/audit.md`](../../docs/tools/audit.md)): until they are all tightened, some entries will be broad — a useful completeness signal.
