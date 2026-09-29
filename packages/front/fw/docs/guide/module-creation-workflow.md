# Workflow — Creating a module

> Operational plan for adding a module to the framework. Aimed primarily at an LLM (Claude Sonnet 4.6+) or a developer running the procedure for the first time.

This page is an **execution plan**, not a course. For each phase, it points to the reference guides to load.

---

## Prerequisites: guides to read before starting

| Guide | Purpose |
|-------|-----------|
| [`module-pattern.md`](./module-pattern.md) | `{ name, dependencies, deps, factory }` structure, purity rules, worker serialisation |
| [`security.md`](./security.md) | APIs blocked by `sanity/base.js` — **never** use in a factory |
| [`test-format.md`](./test-format.md) | `*.test.js` file convention (bun) |
| [`doc-format.md`](./doc-format.md) | `docs/api/*.md` page convention + README cascade |

Load these 4 files into context before phase 1.

---

## Phase 0 — Discovery / scoping

**Goal**: avoid duplicates, identify reusable dependencies.

### 0.1 — Verify no existing module already covers the need

Read the exhaustive table in [`docs/README.md`](../README.md). Also read the `README.md` of the target category (e.g. [`docs/api/io/codec/README.md`](../api/io/codec/README.md)) for its precise context.

For modules with fuzzy scope, `grep` the code and docs:

```bash
grep -ri "<keyword>" docs/api/
grep -ri "<keyword>" src/core/
```

### 0.2 — Identify reusable dependencies

Before writing `crypto.getRandomValues`, custom `JSON.parse`, etc., **check**:

| Need | Existing module |
|--------|--------------------------------------------------------------------------------|
| String ↔ bytes | [`utf8`](../api/io/codec/utf8.md) |
| Hex / Base64 / Base32 / Base58 | [`hex`](../api/io/codec/hex.md), [`b64`](../api/io/codec/b64.md), [`base32`](../api/io/codec/base32.md), [`base58`](../api/io/codec/base58.md) |
| CSPRNG / DRBG | `random` (source: `src/crypto/utils/random.js`) |
| UUID v1 / v4 | [`uuid`](../api/crypto/utils/uuid.md) |
| CRC32 / Adler32 | [`crc32`](../api/io/calc/crc32.md), [`adler32`](../api/io/calc/adler32.md) |
| Async queue | [`queue`](../api/io/utils/queue.md) |
| Type / schema validation | [`valid`](../api/io/utils/valid.md) |
| Binary serialisation | [`buffer`](../api/io/codec/buffer.md), [`cbor`](../api/io/codec/cbor.md), [`msgpack`](../api/io/codec/msgpack.md) |

Any functionality available in the framework **must** be declared as a dependency rather than re-implemented.

### 0.3 — Choose the location

Follow the existing tree:

```
src/core/
├── io/
│   ├── codec/    ← parsing/serialisation
│   ├── compress/ ← compression
│   ├── calc/     ← checksums, math
│   └── utils/    ← neutral utilities
├── dom/
│   ├── rendering/  ← parser, render, template, uiSession
│   ├── query/      ← dom, events, media
│   ├── display/    ← animate, fullscreen
│   ├── fs/         ← indexedDB, storage, download
│   ├── net/        ← ajax, ws
│   └── utils/      ← entropyCollector, ua, clipboard
├── crypto/         ← cryptographic primitives
└── io/process/     ← message, rpc
```

If the module doesn't fit anywhere: ask the question before creating a new folder.

---

## Phase 1 — Source implementation

**Target**: `packages/front/fw/<path>/<name>.js`

### 1.1 — Mandatory skeleton

```js
import { dep1 } from '../<category>/<dep1>.js';
import { dep2 } from '../<category>/<dep2>.js';

/**
 * @description
 * <Long description: scope, implemented RFC, alternatives, out of scope.>
 *
 * @example
 * const <name> = registry.resolve('<name>');
 * <name>.method1(...);
 */
// NB: do NOT write `@module` / `@category` by hand. The generated API reference
// (TypeDoc) derives them automatically from the `type` field / path
// via `integrations/typedoc/categorize.js` — any value written here would
// be ignored/overwritten. Similarly, type the `factory()` return with a named
// `@typedef` (e.g. `@typedef {object} <Name>API`) rather than an inline object.
export const <name> = {
    name: '<name>',
    version: '1.0.0',
    type: 'fw.<category>',         // taxonomy (optional but recommended)
    dependencies: ['dep1', 'dep2'], // names (string) — runtime contract
    deps: [dep1, dep2],             // direct JS refs — bundler mirror

    /**
     * @param {Object} dep1 ...
     * @returns {Object}
     */
    factory(dep1, dep2) {
        // private state, private helpers (prefixed _xxx or in closure)

        function publicMethod(...) { ... }

        return { publicMethod, ... };
    }
};
```

**`deps` ↔ `dependencies` invariant**: both arrays must list the
same modules in the **same order**. Validation is performed at build
time by `tools/fw-bundler` (`bundle`) — a mismatch is a fatal error.

### 1.2 — Absolute rules (security.md reminder)

Inside the `factory`:

- ❌ `Math.random` → use `random.bytes()` (dependency)
- ❌ `crypto.randomUUID` → use `uuid.v4()` (dependency)
- ❌ `eval`, `new Function(...)`, dynamic `import()`
- ❌ `document.*`, `window.*`, `history.*`
- ❌ `performance.now`, `performance.mark` (timing-channel)
- ❌ `innerHTML` (redirected to `innerText` by sanity)
- ❌ Closures over main-thread values (not serialisable)
- ❌ Side-effects at instantiation (no `fetch`, listeners, console at factory top-level)

If the module is a **DOM module** (not worker-safe), `document`/`window` are OK but must be declared explicitly (`worker-safe: false`).

### 1.3 — Registration in the catalogue

`src/core/modules.js` is the self-contained catalogue — `import` at the top, `default
export [...]` at the bottom. **No named exports.** Add:

1. An `import` in the appropriate section (grouped by subtree):
   ```js
   // <section>
   import { <name> } from '../<path>/<name>.js';
   ```
2. A reference in the `export default [...]` array, near modules of the same family (order is free as long as the array remains topologically consistent — `registerAll` iterates without sorting).

---

## Phase 2 — Tests

**Target**: `packages/front/fw/<path>/<name>.test.js`

### 2.1 — Follow [`test-format.md`](./test-format.md)

Mandatory sections:

1. Metadata test (`name`, `dependencies`, `factory`)
2. Factory API test (all public members present and typed)
3. `describe` per public method
4. Error tests / edge cases
5. Round-trip if applicable
6. Official RFC vectors if a standard is implemented

### 2.2 — Manual dependency wiring

```js
import { myModule } from './myModule.js';
import { utf8 } from './utf8.js';

// Minimal stub for deps outside the test's scope if needed
const inst = myModule.factory(utf8.factory(), /* other deps */);
```

### 2.3 — Run

```bash
bun test packages/front/fw/<path>/<name>.test.js
```

**No test must fail.** Iterate until 100% pass.

Then run the full directory to verify no regression:

```bash
bun test packages/front/fw/<path>/
```

---

## Phase 3 — Documentation

**Target**: `docs/api/<path>/<name>.md`

### 3.1 — Follow [`doc-format.md`](./doc-format.md)

Canonical skeleton with:
- Frontmatter (`module`, `category`, `dependencies`, `returns`, `worker-safe`, `status: complete`)
- H1 + tagline ≤ 15 words
- Bold metadata line
- Resolve section
- API table
- Sub-sections per complex method
- End-to-end runnable examples
- Worker Usage (if worker-safe)
- Notes (≥ 2 bullets)
- See also (≥ 1 link)

### 3.2 — Verify internal links

All links must be **relative** and functional. No absolute URLs to the repo.

---

## Phase 4 — README cascade

**Every** module creation impacts a README chain. Update **in order**:

### 4.1 — Leaf category README

E.g. `docs/api/io/codec/README.md`. Add a row to the module table:

```markdown
| [<name>](./<name>.md) | `{method1, ...}` | `dep1` | Short description |
```

If the category has multiple families (like codec: bytes↔string / value↔bytes / text / HTTP), place the module in the correct family of the introduction paragraph.

### 4.2 — Section README

E.g. `docs/api/io/README.md`. Verify the module list for the category includes the new name.

### 4.3 — Root API README

E.g. `docs/api/README.md`. Verify the row for the target category includes the new module.

### 4.4 — Root docs README

`docs/README.md`. Add a row to the **exhaustive table** of all modules:

```markdown
| `<name>` | <category> | <quick description> |
```

Maintain consistent ordering (grouped by category as in the existing file).

---

## Phase 5 — Final verification

```bash
# 1. All tests in the directory pass
bun test packages/front/fw/<path>/

# 2. No regression beyond
bun test src/core/

# 3. Visual inspection
#    - Module page reads coherently
#    - Internal links functional
#    - All READMEs updated
```

### Delivery checklist

- [ ] `packages/front/fw/<path>/<name>.js` — module created, conventions respected
- [ ] `dependencies` AND `deps` fields consistent (same order, same names)
- [ ] `src/core/modules.js` — `import` added + entry in the `default export` array
- [ ] `packages/front/fw/<path>/<name>.test.js` — tests created and 100% pass
- [ ] `bun test packages/front/fw/<path>/` — no regression
- [ ] `docs/api/<path>/<name>.md` — page created following doc-format
- [ ] `docs/api/<path>/README.md` — entry added
- [ ] `docs/api/<section>/README.md` — section up to date
- [ ] `docs/api/README.md` — API index up to date
- [ ] `docs/README.md` — root table up to date
- [ ] No broken internal links

---

## Pattern for extending an existing module

When the goal is to **extend** an existing module (add methods, not create a new one):

1. **Fully preserve the existing API** — search for consumers with:
   ```bash
   grep -r "<name>\.<methodLegacy>" source/
   ```
   No existing signature or name must change.
2. Add new methods after the existing ones in the source file.
3. Run existing tests first — they must all pass without modification.
4. Add a `describe('<new surface>')` section in the test.
5. Extend the docs: new `## API` or new sub-section, without breaking the organisation.
6. README cascade unchanged (same module, same name).

Example: extending `valid` with schema validation — the legacy API (`is`, `isNumber`, …) is fully preserved, and `validate` / `test` / `compile` are added.

---

## Pattern for adding a dependency to an existing module

When a module gains a dependency (e.g. `mime` adding `random` for CSPRNG):

1. Add the corresponding `import` at the top of the source file.
2. Update `dependencies: [...]` **and** `deps: [...]` in the source — same order.
3. Update the `factory(dep1, dep2, ...)` signature in order.
4. **All test sites** manually instantiating the factory must be updated.
5. Doc frontmatter: `dependencies: [dep1, dep2, ...]`.
6. Bold metadata line in the doc: `**Deps** \`dep1\`, \`dep2\``.
7. Table in the category README: `Deps` column.
8. Verify the new dependency introduces no cycle (`runtime._buildGraph`).

---

## Frequent anti-patterns

| Anti-pattern | Good practice |
|--------------|----------------|
| Re-implement UTF-8/hex/base64 inline | Declare `utf8`/`hex`/`b64` as deps |
| `console.log` at factory top-level | Side-effect forbidden — `logger` if needed |
| Stub `crypto` in a production test | Stub only the strict minimum, keep `crypto.getRandomValues` |
| Put docs in `source/` or a README in `docs/` | Strict separation: code in `source/`, docs in `docs/` |
| Skip the README cascade | Discoverability broken — the root table must always reflect the state |
| `test.skip` or `test.only` committed | Tests either green or deleted |
| Frontmatter `status: complete` on a page without Resolve / API / Example | `status: stub` until actually complete |
| Dependency on a DOM module from a worker-safe module | Breaks serialisation — refactor or mark `worker-safe: false` |

---

## See also

- [Module pattern](./module-pattern.md)
- [Security (sanity)](./security.md)
- [Test format](./test-format.md)
- [Documentation format](./doc-format.md)
- [Workers](./workers.md)
