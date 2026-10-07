---
module: fontErrors
category: errors
dependencies: []
returns: object
worker-safe: true
status: complete
---

# fontErrors

> Typed error hierarchy for `@awacloud/fonts` — parse, render, contract.

**Module** `fontErrors` | **Source** `packages/front/office/fonts/src/errors.js` | **Deps** none | **Worker-safe** yes

Every public failure in the package throws one of these classes. A bare `throw new Error(...)` is forbidden in `src/`. Model inspired by `@awacloud/ooxml/errors`.

## Class identity

The classes are **not exported top-level** from `errors.js` — they are declared **inside the factory body**, and the factory is strictly pure: every call to `fontErrors.factory()` declares **fresh class identities**. Identity stability across modules is delegated to the `@awacloud/fw` `ModuleRuntime`, which resolves `fontErrors` once per runtime and injects that single instance into every consumer.

This is required for `instanceof` to work **cross-module**: an error thrown on the parser side only satisfies `e instanceof ParseError` on the consumer side when both sides use the classes of the **same runtime's** `fontErrors` instance. A class obtained from a separate, direct `fontErrors.factory()` call is a different class and `instanceof` is `false`.

## Resolve

Resolve it from the same runtime that resolves `fonts`:

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { FontError, ParseError, RenderError, ContractError, isFontError } = fw.runtime.resolve('fontErrors');
```

`fontErrors` has no dependency, so `fontErrors.factory()` also works when called directly — but each call returns a distinct set of classes, so use it only when nothing else is compared against them.

## API

| Symbol | Type | Description |
|---------|------|-------------|
| `FontError` | class extends `Error` | Base class. Every other class extends it. |
| `ParseError` | class | The byte stream cannot be parsed. |
| `RenderError` | class | A font model cannot be serialized / resolved. |
| `ContractError` | class | The consumer violates the API contract. |
| `isFontError` | `(e) => boolean` | `true` if `e instanceof FontError`. |

### `FontError` constructor

`new FontError(code, message, opts?)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `code` | `string` | kebab-case identifier, e.g. `'fonts/bad-magic'`. |
| `message` | `string` | Human-readable message. |
| `opts.context` | `object` | Extra context attached to `err.context`. |
| `opts.cause` | `Error` | Cause attached to `err.cause`. |

The instance exposes `name` (subclass name), `code`, `message`, `context?`, `cause?`.

## Examples

### Throw and inspect

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const fonts = fw.runtime.resolve('fonts');
const { ParseError } = fw.runtime.resolve('fontErrors');

try {
    fonts.read(bytes);
} catch (e) {
    if (e instanceof ParseError) {
        console.error(e.code, e.context);
    }
}
```

### Identification by code

```js
const { isFontError } = runtime.resolve('fontErrors');
if (isFontError(err) && err.code === 'fonts/sfnt-unknown-version') {
    // specific handling
}
```

## Notes

- `code` is the stable key, `message` may evolve — application-level branching should use `code`.
- `context` is deliberately free-form: field by field per call-site, not meant to be rigidly typed.

## Code vocabulary

The `fonts/` prefix is common to every code; it is omitted in the nomenclature below. Always branch on `err.code`, never on `err.message`. This page lists the security codes, the validation caps and the code families; it is not an exhaustive table of every code the source can throw.

### Critical security codes

| Code | Source | Description |
|------|--------|-------------|
| `cmap-range-bomb` | `table/cmap/formats.js` | cmap fmt 12/13 range outside Unicode or exceeding the cumulative cap (2 × 0x110000). Thrown to block a range bomb. |
| `glyf-too-many-components` | `table/glyf.js` | Composite glyph declaring > 256 components. Anti-OOM cap. |
| `inconsistent-tables` | `fonts.js` | Out-of-bound cross-references (cmap → numGlyphs, composite glyphIndex → numGlyphs). |

### Validation caps

| Code | Limit |
|------|--------|
| `maxp-numglyphs-cap` | numGlyphs ≤ 65535 |
| `sfnt-empty` | numTables ≥ 1 |
| `sfnt-too-many-tables` | numTables ≤ 64 |
| `cmap-too-many-subtables` | cmap.numTables ≤ 64 |
| `name-too-many` | name.count ≤ 32768 |
| `gsub-script-count-cap` | scripts ≤ 1024 |
| `gsub-feature-count-cap` | features ≤ 4096 |
| `gsub-lookup-count-cap` | lookups ≤ 4096 |
| `loca-non-monotonic` | offsets[N+1] ≥ offsets[N] |

### Common families

- `*-short` — buffer too short for this table's header.
- `*-version` — unsupported major version.
- `missing-*` — required table absent from the SFNT.
- `reader-*` — `ContractError` delegations from the fw reader.
- `writer-*` — writer errors (out-of-bound patch, etc.).
- `cff-cs-*` — CFF CharString interpreter.
- `tt-hinting-*` — TrueType hinting VM.
- `gsub-*` / `gpos-*` — GSUB/GPOS layout table (per lookup type).
- `woff1-*` / `woff2-*` — WOFF decoding.
- `morx-*` / `kerx-*` / `ankr-*` / `lcar-*` / `prop-*` — Apple AAT (the `morx` / `kerx` state-machine bodies are kept as raw bytes).

### `cause:` convention

A re-throw of a native JS error inside a table parser attaches the original as `cause`: `script-feature-list.js` (`parseLookupList` downgrades a non-`ParseError` to `{ parsed: false, error, cause }`) and `cff/charstring.js` (`fonts/cff-cs-decode`) do. The fw-to-fonts error translation inside `primitives/reader.js` is the exception: it rebuilds the fw `ContractError` as a `ParseError` copying `message` and `context`, but does not attach the original error as `cause`.

## See also

- [fonts](./fonts.md) — top-level module that throws these
- [sfnt](./sfnt/sfnt.md)
