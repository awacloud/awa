---
module: semver
category: io/text
dependencies: []
returns: object
worker-safe: true
status: complete
---

# semver

> Semver validation, parsing and range matching (semver.org v2.0.0 strict).

**Module** `semver` | **Source** `packages/front/fw/src/io/text/semver.js` | **Deps** none | **Worker-safe** yes

Covers SDE manifest validation needs (`fw_version: '>=1.0.0 <2.0.0'`, `sde_version: '^1.0.0'`). The fw runtime only handles latest/exact resolution; this module provides the full range layer (caret, tilde, intersection, union).

The `v` prefix is **not** tolerated (`'v1.2.3'` is invalid). Pre-releases are compared according to strict semver 2.0.0 rules: numeric < alphanumeric, numeric order on numeric identifiers.

## Resolve

```js
const semver = runtime.resolve('semver');
// Returns: { valid, parse, compare, satisfies, maxSatisfying, range: { parse } }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `valid` | `(s: string) => boolean` | `true` if `s` is a valid strict semver 2.0.0 |
| `parse` | `(s: string) => ParsedVersion \| null` | Decomposed components, numeric identifiers as `number` |
| `compare` | `(a: string, b: string) => -1 \| 0 \| 1` | Semantic order; pre-release < release |
| `satisfies` | `(version: string, range: string) => boolean` | Checks whether `version` satisfies the `range` |
| `maxSatisfying` | `(versions: string[], range: string) => string \| null` | Highest version satisfying the range |
| `range.parse` | `(s: string) => Array<Array<{op, version}>>` | Normalized form: OR groups of AND arrays |

### `semver.valid(s)`

Returns `true` if `s` is a string strictly conforming to semver 2.0.0:
`MAJOR.MINOR.PATCH[-pre-release][+build]`. No leading zeros (except `0` itself), no `v` prefix.

### `semver.parse(s)`

Returns an object `{ major, minor, patch, prerelease, build }` or `null` if invalid.

```ts
interface ParsedVersion {
    major:      number;
    minor:      number;
    patch:      number;
    prerelease: (string | number)[];  // numeric ids → number
    build:      string[];
}
```

### `semver.compare(a, b)`

Implements the order defined by semver 2.0.0:
- Numeric comparison on `major`, `minor`, `patch`.
- Pre-release < release (`1.0.0-alpha < 1.0.0`).
- Between two pre-releases: identifier by identifier; numeric identifiers compared as integers (`alpha.10 > alpha.9`).

### `semver.satisfies(version, range)`

Supported range syntaxes:

| Syntax | Example | Semantics |
|--------|---------|-----------|
| Exact (`=`) | `=1.2.3` | Strict equality |
| Comparators | `>1.0.0`, `>=1.0.0`, `<2.0.0`, `<=2.0.0` | Open/closed bounds |
| Caret (`^`) | `^1.2.3` | Compatible: `>=1.2.3 <2.0.0` |
| Tilde (`~`) | `~1.2.3` | Patch-compatible: `>=1.2.3 <1.3.0` |
| Wildcard | `*` | All versions |
| Intersection (space) | `>=1.0.0 <2.0.0` | Logical AND |
| Union (`\|\|`) | `^1.0.0 \|\| ^3.0.0` | Logical OR |

**Pre-release rule**: a version with a pre-release (e.g. `1.2.3-beta`) does not satisfy a range whose corresponding bound has no pre-release on a different triplet.

### `semver.maxSatisfying(versions, range)`

Filters valid versions satisfying `range`, returns the highest. Returns `null` if none match or the array is empty.

### `semver.range.parse(s)`

Normalized internal form of the range:

```js
semver.range.parse('^1.2.3 || >=3.0.0 <4.0.0');
// [
//   [ { op: '>=', version: '1.2.3' }, { op: '<', version: '2.0.0' } ],
//   [ { op: '>=', version: '3.0.0' }, { op: '<', version: '4.0.0' } ]
// ]
```

## Examples

### Manifest validation

```js
const semver = runtime.resolve('semver');

// Compatibility check for fw_version
const fwVersion = '1.3.0';
const constraint = '>=1.0.0 <2.0.0';

if (!semver.satisfies(fwVersion, constraint)) {
    throw new Error(`fw version ${fwVersion} incompatible (required: ${constraint})`);
}
```

### Comparison and sorting

```js
const semver = runtime.resolve('semver');

const versions = ['1.0.0', '2.0.0-beta', '1.5.0', '2.0.0'];
const sorted = [...versions].sort(semver.compare);
// ['1.0.0', '1.5.0', '2.0.0-beta', '2.0.0']
```

### Range matching for sde_version

```js
const semver = runtime.resolve('semver');

const available = ['1.0.0', '1.2.0', '1.5.0', '2.0.0'];
const required = '^1.2.0';

const best = semver.maxSatisfying(available, required);
// '1.5.0'
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const { version, range } = args;
        const result = libs.semver.satisfies(version, range);
        self.postMessage(result);
    },
    { dependencies: ['semver'], args: { version: '1.2.3', range: '^1.0.0' } }
);
```

## Notes

- The `v` prefix is rejected (`'v1.2.3'` → `valid()` returns `false`) — use `s.replace(/^v/, '')` upstream if needed.
- `^0.x.y` behaves like `~0.x.y` (patch-compatible): `^0.1.3` → `>=0.1.3 <0.2.0`. This is the npm/semver convention for pre-1.0 modules.
- Build metadata (`+build.42`) are ignored during comparison and matching (two versions identical except for build are considered equal on the semver side).
- Self-contained module: the SEMVER_RE regex is duplicated from `runtime.js` rather than imported, to allow isolated loading in a worker without circular dependency.

## See also

- [str](./str.md) — string manipulation (case, slug, truncate)
- [unicode](./unicode.md) — Unicode normalization + collation
- [Pattern module](../../../guide/module-pattern.md) — `version` and `type` fields
