---
module: provenance
category: (root)
dependencies: []
returns: object
worker-safe: true
status: complete
---

# provenance — validate vendor/PROVENANCE.json

> Validate the manifest recording every vendored source tree under `vendor/<id>/`.

**Module** `provenance` | **Source** `packages/front/fw-wasm-crypto/src/provenance.js` | **Deps** none | **Worker-safe** yes — pure functions over a parsed JSON value; no `document`/`window`, no I/O, no import-time side effects.

## Resolve

```js
import { validateProvenance, provenanceErrors } from '@awacloud/fw-wasm-crypto/provenance';
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `validateProvenance` | `(json: unknown) => Provenance` | the same value, narrowed; throws on the first violation |
| `provenanceErrors` | `(json: unknown) => string[]` | sorted list of every validation error found; empty array = valid |

Both share one internal check pass (`collectErrors`) over the frozen wave-1 schema: top-level `{ version: 1, trees: ProvenanceTree[] }`, each tree exactly `{ id, url, ref, sha256, license, notice }` (all strings). The checks performed, in discovery order:

- Top-level value must be a non-null object (not an array).
- No unknown top-level keys beyond `version`/`trees`.
- `version` key must be present and equal to `1`.
- `trees` key must be present and an array.
- Each `trees[i]` must be a non-null object (not an array).
- No unknown per-tree keys beyond `id`/`url`/`ref`/`sha256`/`license`/`notice`.
- All six per-tree fields must be present and be strings.
- `id` must be non-empty and unique across the array (duplicate ids reported by index).
- `sha256` must be `""` (unpinned/seed) or exactly 64 lowercase hex characters.
- `license` must be non-empty.

### `validateProvenance(json)`

Calls `collectErrors(json)`; if any errors were found, throws `new Error(\`PROVENANCE: ${errors[0]}\`)` — only the FIRST error in discovery order is reported. Otherwise returns `json`, narrowed to the `Provenance` type.

### `provenanceErrors(json)`

Non-throwing companion. Always returns `collectErrors(json).sort()` — the full list, alphabetically sorted, empty when the value is valid.

## Examples

### Valid manifest

```js
import { provenanceErrors } from '@awacloud/fw-wasm-crypto/provenance';

const json = { version: 1, trees: [
    { id: 'bearssl', url: 'https://bearssl.org/bearssl-0.6.tar.gz', ref: '0.6',
      sha256: 'a'.repeat(64), license: 'MIT', notice: '' },
] };
provenanceErrors(json);
// []
```

### Invalid manifest

```js
import { validateProvenance } from '@awacloud/fw-wasm-crypto/provenance';

validateProvenance({ version: 2, trees: [] });
// throws Error: "PROVENANCE: version must be 1, got: 2"
```

## Notes

- `validateProvenance` stops at the first error (fail-fast); `provenanceErrors` collects every violation in one pass — prefer it for a lint-style report over a whole `vendor/PROVENANCE.json`.
- The schema is FROZEN: no additional top-level or per-tree keys are permitted, and any schema change requires a deliberate, reviewed change rather than an in-place edit here.

## See also

- [sourceKind taxonomy](../guide/source-kinds.md) — `own`, `vendored`, `vendored-fork` defined
- [vendor/PROVENANCE.json](../../vendor/PROVENANCE.json) — the manifest this module validates
- `vendor/mlkem-native-presence.test.ts`, `vendor/notice.test.ts`, `vendor/provenance-trees.test.ts` — the guard tests exercising this manifest
