# Quick reference — conventions framework `fw`

> Compact summary of the 5 mandatory guides for the `EXECUTION` routine. Load this file first; consult the full guides only when residual ambiguity remains.

| Topic | Full guide |
|-------|---------------|
| Module pattern (pure factory, deps) | [`module-pattern.md`](./module-pattern.md) |
| Sanity tiers — default `lockdown()`; APIs banned by `sanity/base.js` | [`security.md`](./security.md) |
| `bun:test` test format | [`test-format.md`](./test-format.md) |
| Doc page format + README cascade | [`doc-format.md`](./doc-format.md) |
| Phase-by-phase workflow | [`module-creation-workflow.md`](./module-creation-workflow.md) |

---

## 1. Module pattern (TL;DR)

```js
export const myModule = {
    name: 'myModule',
    dependencies: ['dep1', 'dep2'],
    factory(dep1, dep2) {
        // private state / helpers (closures)
        function publicMethod() { /* ... */ }
        return { publicMethod };
    }
};
```

**Absolute rules** inside `factory(...)` :
- ❌ `window`, `document`, `globalThis.<DOM>`
- ❌ `Math.random`, `crypto.randomUUID`
- ❌ `eval`, `new Function(...)`, dynamic `import()`
- ❌ `performance.now`/`performance.mark` (timing-channel)
- ❌ Side-effects at instantiation (no `fetch`, listeners, console at top-level)
- ❌ Closures over main-thread values (non-serialisable for workers)
- ✅ Dependencies declared explicitly in `dependencies: [...]`

**DOM modules** (not worker-safe): `document`/`window` allowed, but frontmatter must indicate `worker-safe: false`.

---

## 2. Banned APIs (sanity/base.js)

| API | Runtime behaviour |
|-----|---------------------|
| `eval`, `Function` | throw `'not allowed'` |
| `alert`, `confirm`, `prompt`, `open` | throw |
| `importScripts`, `Reflect` | throw |
| `import()` (dynamic) | **not intercepted** — `window.import` (the property) throws on access, but `import()` is syntax, not a property, so it cannot be poisoned by slot replacement; closed by a server CSP (`script-src`) or a Worker, not this tier |
| `document.write`, `document.writeln`, `document.execCommand`, `document.evaluate`, `document.implementation`, `document.createContextualFragment` | throw |
| `document.domain` (set) | throw |
| `history.pushState`, `replaceState`, `go`, `back`, `forward` | throw |
| `Math.random` | throw `'not allowed: use crypto.getRandomValues instead'` |
| `crypto.randomUUID` | throw |
| `performance.now`, `mark`, `measure`, `getEntries` | throw |
| `Date.now` | rounded to 100 ms (anti-fingerprinting) |
| `setTimeout`/`setInterval`/`rAF` with string | throw |
| `JSON.parse(text, reviver)`, `JSON.stringify(val, fnReplacer)` | throw |
| `element.innerHTML = ...`, `outerHTML`, `insertAdjacentHTML` | **redirected** to `innerText` (silent) |
| `iframe/object/embed` setters `src`, `srcdoc`, `data`, `href`, `codebase`, `archive`, `innerHTML` | throw |

**Frozen native prototypes**: `Object`, `Array`, `Function`, `String`, `Number`, `Boolean`, `Date`, `RegExp`, `Error`.

**Alternatives** :
- `Math.random` / `crypto.randomUUID` → `random.bytes()` / `uuid.v4()`
- HTML injection → `parser` → `render` → `template` pipeline
- URL / CSS / DOM-clobber validation → `secPolicy.isSafeUrl` / `isSafeCss` / `isClobberValue`
  (single source of truth; injected automatically by `template`, `render`, `dom`, `sanitize`)

---

## 3. Test format `<name>.test.js` (bun)

Co-located with the module. Skeleton:

```js
import { describe, test, expect, beforeEach } from 'bun:test';
import { myModule } from './myModule.js';

describe('myModule module', () => {
    test('should have correct module metadata', () => {
        expect(myModule.name).toBe('myModule');
        expect(myModule.dependencies).toEqual([]);
        expect(typeof myModule.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = myModule.factory();
            expect(typeof inst.publicMethod).toBe('function');
        });
    });

    describe('publicMethod', () => {
        let inst;
        beforeEach(() => { inst = myModule.factory(); });

        test('happy path', () => { /* ... */ });
        test('throws on invalid input', () => {
            expect(() => inst.publicMethod(null)).toThrow();
        });
    });
});
```

**Mandatory sections** :
- `describe('<name> module', ...)` root
- Metadata test (`name`, `dependencies`, `factory`)
- Factory API test (members present and typed)
- `describe(<method>)` per public method
- Error tests / edge cases
- `describe('round-trip')` if codec / serialisation
- Official RFC vectors if a standard is implemented

**Wiring deps**: instantiate manually (`myModule.factory(utf8.factory(), randomStub)`), not `runtime.resolve`.

### Bootstrap runtime (consumer apps)

Since the refactor, `main.js` no longer registers modules automatically. The app must do it:

```js
import { runtime } from '@awacloud/fw';
import modules from '@awacloud/fw/core/modules';   // default export = array [...]
runtime.registerAll(modules);                  // or .registerAllDeep(modules) to resolve via `deps`
```

- `registerAll(modules)`: registers in the supplied order; honours `dependencies: ['name']`.
- `registerDeep(module)` / `registerAllDeep([m])`: follows the `deps: [moduleRef]` field (direct references) and recursively registers missing modules. Useful for partial bundles.

Useful subpath imports (`pure` ESM variant by default, `classic` = global `globalThis.fw`):

```js
import { hex } from '@awacloud/fw/io/codec/hex.js';
import { sanitize } from '@awacloud/fw/dom/rendering/sanitize.js';

import { lockdown } from '@awacloud/fw/sanity/lockdown';
lockdown();  // default tier (composes base in the browser)

import { applyBase } from '@awacloud/fw/sanity/base';
applyBase();  // base alone (framework-friendly hosts)
```

⚠️ `import { hex } from '@awacloud/fw/core/modules'` is **broken** — only the default export (the array) is exposed.

`beforeEach` for fresh state; `beforeAll` reserved for immutable setups.

---

## 4. Doc format `<name>.md`

### Frontmatter (required)

```yaml
---
module: <name>
category: <path>
dependencies: [dep1]
returns: object|constructor|function|class
worker-safe: true|false|partial
status: complete|stub
---
```

### Canonical skeleton

```markdown
# <name>

> One-line description — ≤ 15 words.

**Module** `<name>` | **Source** `packages/front/fw/.../<name>.js` | **Deps** `dep1` | **Worker-safe** yes

## Resolve

```js
const <name> = runtime.resolve('<name>');
// Returns: { method1, method2 }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `method1` | `(arg: type) => RetType` | description |

## Examples

```js
const <name> = runtime.resolve('<name>');
// runnable snippet
```

## Worker Usage  (required if worker-safe: true)

```js
const worker = fw.createWorker(...);
```

## Notes

- ≥ 2 concise bullets ≤ 2 lines each.
- Reference implemented RFC / specs.

## See also

Relative links, one per line — `[<module>](./<module>.md) — relationship`.


**Mandatory sections**: Frontmatter, H1 + tagline, metadata line, `## Resolve`, `## API`, `## Examples`, `## Notes` (≥2 bullets), `## See also` (≥1 link). `## Worker Usage` if worker-safe.

**`\|`** escaped required in table union signatures.

---

## 5. 4-level README cascade

For `docs/api/io/codec/csv.md`:

```
docs/api/io/codec/csv.md
        ↓ line in
docs/api/io/codec/README.md
        ↓ updated list in
docs/api/io/README.md
        ↓ updated cell in
docs/api/README.md
        ↓ line added in
docs/README.md (exhaustive table)
```

**Targeted append** at each level, **no full rewrite** of the file.

---

## 6. Task workflow — 7 phases

1. Implement `packages/front/fw/<path>/<name>.js` following the plan's prescriptive API.
2. Write `<name>.test.js` following § 3.
3. `bun test <test-file>` → **100% pass** (max 3 correction iterations, otherwise `failed`).
4. Write `docs/api/<path>/<name>.md` following § 4.
5. README cascade at 4 levels (§ 5).
6. Register in `src/core/modules.js`: `import { X } from '../<path>/<name>.js';` at the top + reference `X` in the `default export [...]`.
7. `bun test src/core/<path>/` for non-regression.

---

## 7. Existing source categories

```
src/
├── core/                runtime, modules, logger, readyState, worker-helper
├── process/             processMessage, processRPC, workerPool
├── io/
│   ├── codec/           hex, b64, base32, base58, utf8, buffer, cbor, msgpack, csv, url, mime, xml
│   ├── compress/        lz4, deflate, gzip, zlib, zip, brotli*, lz77, lzw, huffman, bitstream
│   ├── calc/            crc32, adler32, easing, bigint, linalg, stats, geom, interp, fixedPoint
│   ├── timing/          clock, rateLimit, scheduler, date
│   ├── text/            i18n, ansi, htmlEntities, semver, str, unicode
│   ├── struct/          lruCache, heap, ringBuffer, trie, btree, treeWalker
│   ├── concur/          abort, mutex, semaphore, channel, atomics, cancellable, tokenBucket
│   ├── binary/          binaryReader, binaryWriter
│   └── utils/            uuid, queue, bitmap, ui8, valid, errors, eventBus, signal
├── dom/
│   ├── rendering/        parser, render, template, sanitize, secPolicy, themeTokens,
│   │                     devtools, uiSession (+ Core/Direct/List), virtualScroll, chart, component
│   ├── query/            dom, events, media, gesture, dnd
│   ├── display/          animate, fullscreen
│   ├── fs/               indexedDB, storage, download, fsAccess, remoteStore
│   ├── net/              ajax, ws, sse, webrtc, broadcastChannel, network
│   ├── lifecycle/        visibility, idle, wakeLock
│   ├── platform/         geolocation, battery, networkInfo, sensors
│   ├── sw/               serviceWorker, sharedWorker, push, backgroundSync, cache
│   └── utils/            a11y, focus, form, keybindings, route, webauthn,
│                         leaderElection, notifications, permissions,
│                         clipboard, entropyCollector, ua
└── crypto/               (excluded from doc audit — random, sha*, aes*, rsa, ed25519, etc.)
```

**New categories**: create the source folder + doc folder + category `README.md`.

---

## 8. Report statuses

| Status | Meaning |
|--------|------|
| `done` | Complete, tests green, doc + cascade |
| `partial` | Implementation OK, something missing |
| `blocked` | Needs human input (ambiguity, conflict, decision) |
| `failed` | Tests fail after 3 iterations without a pattern |
| `skipped` | Deps not yet `done` |

Mapping for `BATCH_N.md`: `done` → `Delivered`, `partial` → `Partial`, `blocked` → `Blocked`, `failed` → `Failed`, `skipped` → `Skipped`.

---

## 9. Frequent anti-patterns

| Anti-pattern | Good practice |
|--------------|----------------|
| Re-implement utf8/hex/b64 inline | Declare as deps |
| `console.log` at factory top-level | Side-effect forbidden (`logger` if needed) |
| Modify `sanity/base.js` | Immutable lock |
| `test.skip` / `test.only` committed | Tests green or deleted |
| Skip the README cascade | Discoverability broken |
| Speculative API (methods beyond the plan) | Plan = prescriptive |
| Generous out-of-scope | `## Out` = as prescriptive as `## In` |

---

## 10. Report frontmatter (reference)

```yaml
---
task: NN-slug
batch: BATCH_N
status: done | failed | blocked | partial | skipped
started: ISO_TIMESTAMP
ended: ISO_TIMESTAMP
attempts: 1
deps_met: true
deps: []
files_created: [...]
files_modified: [...]
tests_run: bun test src/core/<path>/
tests_pass: true
tests_count: N
blockers_count: 0
---
```

Mandatory sections (cf. `_REPORT_TEMPLATE.md`): `Summary`, `Work done`, `Tests`, `Files`, `Blockers` (if not `done`), `Next steps` (if not `done`), `Notes`.

---

## 11. Naming summary EXECUTION

`_BATCH_SUMMARY_<min_NN>_<max_NN>.md` where NN = numbers attempted in the run (skipped excluded).
- 1 task: `_BATCH_SUMMARY_07_07.md`
- Empty run: `_BATCH_SUMMARY_NOOP_<timestamp>.md`
- **Never overwrite** an existing summary.
