# API stability

This page defines what `@awacloud/fw` promises to keep from one release to
the next: the public surface frozen at 1.0.0, the SemVer rules that apply to
it, and the deprecation cycle that a breaking change goes through. The
snapshot in [`docs/api/surface.json`](../api/surface.json) is the
machine-readable form of the surface, and a test keeps the package equal to
it.

## The public surface

The surface covered by SemVer is everything a consumer reaches through the
package's `exports` map:

| Part | What is frozen |
|---|---|
| Entry points | Every key of the `exports` map (`.`, `./core/*`, `./typed`, `./sanity/*`, `./config`, the bundler integrations, `./dist/build/*`) and, for a JavaScript entry, the names it exports. |
| Registry modules | The 208 modules of `core/modules.js`, reached as `./io/…`, `./dom/…`, `./crypto/…`, `./process/…`: each module's registry `name`, its module file path, the names that file exports, and the API its factory returns — every public key, its kind (function, class, object, constant) and its signature as published in the declaration files. |
| Types | The published declarations: the `dist/types/` tree generated from the JSDoc, `types/*.d.ts` and the integrations' `.d.ts`. |
| Documented behaviour | What a module's page under [`docs/api/`](../api/README.md) states: return values, defaults, the `false`-on-invalid-input convention, the error `code` strings, the option names. |

The surface does **not** cover:

- the **internal slot**: the primitives some modules keep for their vector
  tests and for one another (`makeSha` of sha256 / sha512, the NTT of
  ml_kem, `encodeTlv` of hybridSign…) sit under a non-enumerable property
  keyed by `Symbol.for('@awacloud/fw/internal')` — not an API key, not in
  the types or the pages' key lists, and free to change in any release
  (the API pages name them as `internalOf(module).name`, the helper of
  `src/core/internal.js`, which the `exports` map does not expose). No API
  object carries a `_` key;
- the `_`-prefixed **methods of classes** (`sha256.fn.prototype._block`,
  the stream classes' `_take` / `_emit`, the rendering session's helpers):
  implementation methods, outside the contract;
- error **message** text (the `code` strings are frozen, the messages are
  not), log output, and timing or performance;
- the contents of a built bundle under `dist/build/` (its file name is
  frozen, its code is generated);
- everything outside the `exports` map: `playground/`, `tools/` (except
  what the integrations import), the tests and their fixtures;
- behaviour that contradicts the documented contract: fixing it is a patch,
  even when a caller relied on the defect.

### Surfaces other awa products build on

These are part of the surface above; they are named here because the AWA
Viewer and the embeddable viewer core depend on them, and a change to one is
measured against those consumers' suites before it lands:
`dom/fs/fileIntake`, `dom/sw/installPrompt`, `dom/sw/swUpdate`, `dom/sw/precache`,
`dom/utils/clipboard` (`setRich` included), `dom/utils/keybindings` (the
punctuation key names), and the types build that the package export reads.

### The crypto tier

The crypto modules' API is frozen like every other module's: names,
signatures, argument order (`sign(key, message, …)`,
`verify(key, signature, message, …)` on every scheme and tier) and return
conventions. What stays an early release is the **assurance**, not the API:
the crypto tier carries no constant-time attestation for its pure-JS
implementations and no third-party audit (see the README's
*Crypto tier — early release*). Reworking an implementation against a
validation harness changes the code behind the API, not the API.

## SemVer rules

From 1.0.0:

- **Major** — a change that can break a correct caller: a removed or renamed
  export, module or key; a changed kind or signature; a changed default; a
  new throw (or a new `false`) on input that was accepted; a changed error
  `code`; a moved module path or registry name.
- **Minor** — an additive change: a new module, export, key, option or
  error code on a path that used to fail; a deprecation.
- **Patch** — a fix that brings the code back to its documented behaviour,
  with no change to the surface.

A security fix that cannot be made compatibly may ship in a minor or a patch.
It is listed under **Security** in [`CHANGELOG.md`](../../CHANGELOG.md) with
what changes and the migration.

## Deprecation cycle

A breaking change after 1.0.0 goes through a deprecation first:

1. **Deprecate** in a minor release. The old name keeps working, delegating
   to its replacement. Its JSDoc carries `@deprecated` with the replacement
   (editors then show it struck through), its page under `docs/api/` says
   so, and `CHANGELOG.md` lists it under **Deprecated**. fw prints nothing
   at run time: a deprecation never writes to the console.
2. **Keep** it for at least one further minor release and six months,
   whichever is longer.
3. **Remove** it in the next major release, listed under **Breaking** with
   the replacement.

When no compatible bridge exists (a changed default, a changed argument
order), the change waits for the next major release and is announced under
**Deprecated** in the minor before it.

## The snapshot gate

`tools/api-surface.js` measures the surface from the package itself — it
imports each entry, resolves every registry module in a plain process and
walks the API it returns (keys and kinds, values left out), and hashes each
published declaration file with its comments removed, so a documentation
edit does not move the hash and a changed signature does. The result is
compared with `docs/api/surface.json`:

```bash
bun run api:surface:check   # from packages/front/fw: the classified diff, exit 1 on drift
bun run api:surface         # write the snapshot after a deliberate change
```

The test `tests/api-surface.integration.test.js` runs the same comparison in
the suite, and `prepack` runs the check before a package is built. Each
difference is classed: `breaking` (a removed entry, export, key or
declaration file, a changed kind), `additive`, `internal` (the `_` keys),
`dependencies` (a module's registry dependencies) and `types` (a changed
declaration). A changed declaration is read by hand: it is breaking when a
signature narrows or reorders, additive when it gains an optional part.

The gate sees the shape of the API, not its behaviour: a changed default or
a new throw leaves the shape as it was. Those are caught by the module's own
tests, which pin the documented behaviour, and recorded in `CHANGELOG.md`.
