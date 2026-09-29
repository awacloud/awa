# Playground — TypeDoc

**Type:** generated-doc example · **Integration:** [`@awacloud/fw/typedoc`](../../../integrations/typedoc/README.md)

> Unlike the other playgrounds, there is **no per-app build** here. TypeDoc
> documents the **whole** package from its `dist/types`, so this "example" is
> a **guide** (not an isolated generation run): it explains how to launch the
> pipeline, where the output lands, and the typing convention that keeps the
> reference readable.

## Run

```sh
bun run docs:api
```

Run from this directory's package root (`packages/front/fw/`). Then open
**`docs/api-generated/index.html`** in a browser.

## The `docs:api` pipeline

```
rm -rf dist/types          # purge the outDir (tsc doesn't remove stale .d.ts)
→ bun run types             # regenerates dist/types (JSDoc → tsc → .d.ts)
→ categorize.js              # injects @module + @category into the .d.ts
→ typedoc                   # writes docs/api-generated/
```

The source is `dist/types/**` (strategy 1): TypeDoc consumes the
declarations already emitted by `bun run types`, so the generated doc
reflects **exactly** the typed surface seen by TS consumers — no re-parsing
of JSDoc. Details and configuration:
[`integrations/typedoc/README.md`](../../../integrations/typedoc/README.md).

## Index grouped by taxonomy

Without annotation, TypeDoc files **all** modules under "Other" (it only
groups by `@category`). [`categorize.js`](../../../integrations/typedoc/categorize.js)
derives the category from each module's **`type`** field (`fw.io.codec` →
`io/codec`, fallback: folder path) and prefixes a
`/** @module <path> @category <cat> */` into the `.d.ts` files under
`dist/types` (never `src/`). Result: an index grouped by taxonomy
(`crypto/hash`, `dom/query`, `io/codec`…), aligned with the source of truth.

## Separate, unpublished output

`docs/api-generated/` is a folder **distinct** from `docs/api/` (editorial):

- **generated on demand**, never committed (`.gitignore`);
- **outside the npm tarball** (`package.json#files` → `!docs/api-generated/**`).

It **complements** the hand-written doc [`docs/api/`](../../../docs/api/)
(usage-oriented), which stays canonical: TypeDoc is the exhaustive
**generated** reference (full signatures), useful for completeness and
navigation.

## Why a `@typedef <Name>API`? (the "Type Alias" convention)

The reference's quality depends on the `factory`'s `@returns`. A **named**
`@returns` becomes a clean **Type Alias** in the TypeDoc output; an
**anonymous inline** return produces an unreadable, bloated, non-navigable
shape.

```js
// ❌ Anonymous inline return → TypeDoc shows a verbose literal object,
//    no "Type Aliases" entry, nothing to point to from elsewhere.
export const counter = {
    name: 'counter', version: '1.0.0', type: 'fw.demo', dependencies: [],
    /** @returns {{ inc: () => number, value: () => number }} */
    factory() { /* … */ },
};

// ✅ Named return via @typedef → becomes "CounterAPI" in "Type Aliases",
//    referenceable, and readable in the signature of resolve('counter').
/**
 * @typedef {object} CounterAPI
 * @property {() => number} inc   Increments then returns the value.
 * @property {() => number} value Reads the current value.
 */
export const counter2 = {
    name: 'counter', version: '1.0.0', type: 'fw.demo', dependencies: [],
    /** @returns {CounterAPI} */
    factory() { /* … */ },
};
```

That is exactly what the audit measures: a wide `@returns` (`{Object}`,
`{Function}`, `{*}`…) is classified **LOSSY** and defeats inference. To
check the real state of the package's `@returns`:

```sh
bun run types:audit             # full report (TYPED / INFER / LOSSY)
bun run types:audit --lossy-only  # only the targets to fix
```

See [`docs/tools/audit.md`](../../../docs/tools/audit.md) (reference model:
`src/io/calc/adler32.js`). While entries stay wide, the generated reference
will show it — a good completeness signal.

## Illustration file

[`example-module.js`](./example-module.js) — **illustrative** module (not
built) showing the `@typedef ExampleAPI` + `@returns {ExampleAPI}` convention.
