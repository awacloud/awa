---
category: note
status: complete
scope: core/worker-helper
date: 2026-06-15
---

# Worker Confinement Spike — Decision Note

> **status: historical (2026-06-15) — superseded for guidance by
> [`docs/guide/worker-confinement.md`](../guide/worker-confinement.md).**
> This page is a dated investigation record and is kept verbatim. For what to
> actually write in an application, read the guide; for what `lockdown()`
> integrates in a Worker *today*, read the final section of this page.

> Investigation: does fw's Worker boundary provide confinement (isolation)
> to complement the integrity tier (`sanity/lockdown.js`)? Answer: yes, with
> specific residuals to account for.

**File evidence base**: `src/core/worker-helper.js`, `src/core/runtime.js`,
`src/core/worker-confinement.poc.test.js`.

---

## Q1 — Boundary reality: is a Worker a true separate realm?

**Verdict: Yes. A Worker is a genuine separate realm — distinct intrinsics,
no shared prototype chain, no shared variable scope with the spawning thread.**

A Web Worker (Bun or browser) spawns with its own JavaScript engine context:
separate `globalThis`, separate prototype chain for `Object`, `Array`, `Function`,
etc. The only crossing mechanism is `postMessage` / structured-clone
(spec: WHATWG Workers §2.6). No shared memory exists between parent and worker
unless an `ArrayBuffer` is explicitly transferred or a `SharedArrayBuffer` is
passed.

Evidence in fw: `worker-helper.js:198–210` builds the entire worker program as
a string (`code`), creates a `Blob` URL, and passes it to `new Worker(blobUrl)`.
The worker evaluates the string in its own fresh realm. `workerFn.toString()` is
called to embed the function source — any closure variable the function captured
is NOT transferred (the string contains only the syntactic body). A closure that
references a parent-scope binding would cause a `ReferenceError` inside the
worker (this is enforced at ESLint level by the `no-factory-capture` rule,
`fw-coding.md` §2).

PoC confirmation (`worker-confinement.poc.test.js`): a `globalThis[propName]`
set in the parent thread is NOT visible inside the spawned Worker (realm test,
live Worker), confirming the separate-`globalThis` boundary.

Structured-clone only: `postMessage` calls `structuredClone` semantics —
functions, prototypes, WeakMaps, Proxy objects, DOM nodes cannot cross the
boundary. Only plain JSON-like data, typed arrays, and transferable objects
(ArrayBuffer, MessagePort, etc.) can transit. fw serializes modules as
source-code strings (`runtime.js:520–556`, `serialize()`), not as live objects.

---

## Q2 — Ambient authority audit

**Verdict: fetch and WebSocket are present by default in Bun Workers; `XMLHttpRequest`,
`importScripts`, `indexedDB`, and `caches` are absent. Dynamic `import()` is present
but restricted to local paths (no network). fetch and WebSocket are deletable
before running untrusted code; dynamic import is an irremovable language feature.**

Measured in the current Bun 1.3.13 Worker environment:

| Authority | Present by default | Withholdable? | Method |
|---|---|---|---|
| `fetch` | Yes | Yes | `delete globalThis.fetch` before user code runs |
| `WebSocket` | Yes | Yes | `delete globalThis.WebSocket` before user code |
| `XMLHttpRequest` | No | N/A (absent) | — |
| `importScripts` | No | N/A (absent) | — |
| `indexedDB` | No | N/A (absent) | — |
| `caches` | No | N/A (absent) | — |
| dynamic `import()` | Yes | No — syntax keyword | Residual (see below) |
| `Worker` (nested) | Yes | Yes | `delete globalThis.Worker` |
| `BroadcastChannel` | Yes | Yes | deletable |

**Residuals that cannot be fully removed:**

1. **Dynamic `import()`** is a language keyword, not a property, so it cannot be
   `delete`d. However, in Bun's Worker with blob: URL origin, `import()` only
   resolves local file-system paths (not `https://` URLs) — network import fails
   with an ENOENT error. This means the network attack surface via `import()` is
   already constrained, but a file-system read via `import()` to an absolute path
   remains possible unless the OS has no world-readable sensitive JS files.

2. **`eval`** and **`new Function`** are language primitives. They can be overwritten
   (`globalThis.eval = () => { throw ... }`) but not deleted (they'd re-resolve to
   the language built-ins through the prototype chain). The sanity layer
   (`sanity/base.js`) already blocks these with throwing wrappers; running
   `lockdown()` inside the worker addresses them — see Q4.

**Mechanism for withholdable authorities** (demonstrated in PoC):
A custom `workerFw` function runs before `workerFn` (worker-helper.js:207).
Deleting properties from `globalThis` inside `workerFw` hides them from all
subsequently executing code (including `workerFn`). Since `workerFw` is
serialized and embedded before `workerFn`, the sequence is deterministic:
confinement setup → resolve modules → run user code.

---

## Q3 — Capability model: fw DI modules as granted capabilities

**Verdict: The `dependencies` allowlist in `createWorker` options is the
capability grant mechanism. Only explicitly listed modules are serialized into
the worker; a module not in the list is absent from `libs` and from the
worker-side `ModuleRuntime` — it is unreachable, not just hidden.**

Mechanism (worker-helper.js:184–210):

1. `runtime.serialize(normalizedOptions.dependencies)` (runtime.js:520) builds
   a topologically ordered graph of ONLY the listed modules and their transitive
   dependencies. Modules not in the list are not serialized.
2. The serialized source string is embedded in the worker code as a literal
   (`${serialized.content}`). The worker-side `ModuleRuntime` can only register
   and resolve modules present in that string.
3. `DEFAULT_WORKER_FRAMEWORK` calls `runtime.resolveAll(exposedSpecs)` where
   `exposedSpecs` is exactly the user's `dependencies` list (worker-helper.js:196).
   Transitive dependencies are registered but NOT exposed in `libs` by default —
   they can only be reached if listed explicitly.

PoC confirmation (`worker-confinement.poc.test.js`, sandbox + live tests):
- `mathModule` registered on main-thread runtime + granted → `libs.math` present,
  computes `add(20, 22) = 42`.
- `secretModule` registered on main-thread runtime but NOT in `dependencies` →
  absent from worker `libs` (both sandbox and live Worker confirm `libs.secret ===
  undefined`). The worker's `ModuleRuntime` has no entry for `secret` at all; even
  `runtime.resolve('secret')` inside the worker would throw `Module not found`.

The capability model is thus: the grant is the `dependencies` array passed to
`createWorker`. Anything not in the grant is unreachable from inside the worker.
The parent's full `runtime` registry is never transferred — only the serialized
subgraph.

**Non-granted module unreachability is structural, not policy**: a non-granted
module's `factory` source is absent from the worker code string entirely. There
is no way for worker code to conjure it unless the attacker can load an external
resource (see residuals in Q2).

---

## Q4 — Composition with Task 01 (lockdown)

**Verdict: Yes, `lockdown()` should run inside each Worker realm (in the
`workerFw` bootstrap, before user code). The pair provides layered defence:
confinement (worker boundary) plus integrity (prototype freeze + API blocks).
Neither is sufficient alone. The honest gap vs SES Compartments is: async-only
channel, per-worker startup cost, and Bun's dynamic-import residual.**

**What the Worker boundary provides alone (without lockdown):**
- Separate realm → no shared prototype chain with parent.
- Module capability grant → non-granted modules structurally absent.
- Parent-scope variables → unreachable (separate `globalThis`).
- postMessage only → the only sanctioned data channel.

**What lockdown adds inside the worker realm:**
- Freezes the worker's own built-in prototypes (`Object.prototype`, etc.),
  preventing prototype-pollution attacks within the worker realm itself.
- Blocks `eval`/`new Function` (which are otherwise live inside the worker).
- Blocks timing channels (`performance.now`, `Date.now` rounding).
- Blocks dangerous DOM APIs (where they exist) and `Math.random`.

**What the pair guarantees that neither does alone:**
- Without lockdown, untrusted code in the worker could mutate `Array.prototype`
  inside the worker realm and corrupt the fw module instances that run there.
- Without the Worker boundary, lockdown only provides integrity (no prototype
  mutation) but not confinement — code still runs in the parent realm and has
  access to all parent-scope bindings.
- Together: code runs in a realm where (a) it can only reach granted modules,
  (b) built-ins are frozen, (c) dangerous APIs throw, (d) data crosses only via
  structured-clone.

**Honest gap vs SES Compartments:**

| Aspect | Worker + lockdown | SES Compartment |
|---|---|---|
| Realm isolation | True engine boundary (separate V8/JSC context) | Lexical illusion (same realm, virtualized `globalThis`) |
| Call protocol | Async only (`postMessage`, structured-clone) | Synchronous calls possible |
| Data crossing | Structured-clone — no live object sharing | Can pass live objects if caller allows |
| Startup cost | New thread/process per Worker (~1–10 ms overhead) | ~0 ms (same realm) |
| Code inspection | Attacker cannot observe parent intrinsics | Requires careful hardening of intrinsics |
| dynamic import residual | Present; file-system read possible | Fully virtualized by SES |
| Browser/Bun native | Yes — standard Web Worker API | Requires SES polyfill |

The Worker + lockdown pair gives **stronger** isolation where it applies (true
engine boundary vs lexical illusion) but is **async-only and per-worker costly**.
SES Compartments allow synchronous composition at near-zero cost but require
trusting the SES polyfill's hardening and do not protect against
prototype-graph sharing bugs in the polyfill itself.

---

## Recommendation

**Adopt Workers as the confinement tier for fw.**

Rationale:
1. **Real engine isolation**: the Worker boundary is enforced by the JavaScript
   engine, not userland code. An attacker inside the worker cannot escape to the
   parent realm regardless of what they do to the worker's own prototype chain.
2. **fw-native**: the architecture was designed for this — factory serialization
   (`runtime.serialize`), the `createWorkerRuntime` helper, and the `dependencies`
   capability grant are already in production. The confinement model is not an
   add-on; it is the natural expression of the DI architecture.
3. **Honest capability grant**: the grant mechanism (`dependencies` allowlist) is
   structural, not advisory — a non-granted module's code is absent from the
   worker binary.

**Recommended deployment pattern:**

```js
// Confinement-setup workerFw (embed alongside createWorker call-site)
const confinedWorkerFw = function(runtime, modules, args) {
    // 1. Withhold ambient network authority
    delete globalThis.fetch;
    delete globalThis.WebSocket;
    delete globalThis.Worker;          // prevent nested worker spawn
    delete globalThis.BroadcastChannel;
    // 2. Run lockdown (integrity — freeze prototypes, block eval/Function/etc.)
    //    lockdown() would be injected via the dependencies list:
    //    e.g. dependencies: ['lockdown', 'math'] where lockdown is a side-effect module.
    //    Or: call it inline if the source is embedded via runtimeSource extension.
    // 3. Resolve only the granted modules
    const libs = runtime.resolveAll(modules);
    return { libs, args };
};
```

**Trade-offs to document:**
- Async-only channel: any call from parent to worker (and vice versa) goes through
  `postMessage` and structured-clone. Synchronous access to worker results is not
  possible. This is a fundamental property of the Web Worker API.
- Per-worker cost: each Worker allocates a new thread (~1–10 ms on modern hardware).
  Use a worker pool (existing `workerPool` module) for recurring tasks.
- Dynamic `import()` residual: in production browser environments this is network-
  capable. For full coverage, the confinement-setup `workerFw` should also install
  a throwing `import` override (not possible at the keyword level, but an `import`
  meta-object shim can be installed). In Bun 1.3.13 the network attack vector is
  absent but file-system import is possible — acceptable for server-side trust
  boundaries where the filesystem is under operator control.

**Do NOT pursue an in-realm Compartment shim as an alternative** unless
synchronous composition is specifically required (e.g., plugins that must return
values synchronously). The Worker model provides stronger isolation at the cost of
asynchrony, which aligns with fw's event-driven architecture.

---

## What lockdown integrates today (2026-09-04)

> Appended after the fact. Everything above is the 2026-06-15 record, left
> verbatim; this section states what is measured true of the current tree and
> corrects the one place where the record above proposes an API shape that does
> not exist.

- **`lockdown()` is explicit-call.** The whole sanity layer is now
  explicit-call ESM: `sanity/lockdown.js` exports `lockdown()` and `harden()`,
  and a bare import hardens nothing.
- **Its intrinsic steps run in any realm, Workers included.** Steps 1–5 (tame
  the function constructors, capture then remove the evaluators, poison the sync
  WebAssembly constructors, harden the intrinsics) target pure-JS intrinsics —
  `lockdown.js:339-347` states this as contract.
- **The DOM step is browser-gated.** Step 6 composes `applyBase()` only when
  both `window` and `document` exist (`lockdown.js:383-397`), so a Worker or SSR
  realm never loads the DOM layer at all.
- **fw does not wire it into the worker realm.** `lockdown` is not a DI module
  (absent from `src/core/modules.js`) and is not part of `runtimeSource`, so it
  is not reachable through the `dependencies` grant. The only pre-user-code hook,
  `workerFw`, is called **synchronously** — its return value is assigned straight
  to `runtime.context` (`worker-helper.js:207`) — so it cannot `await` the
  dynamic `import()` that obtaining the module inside a `blob:` worker requires.
- **Correction to the pseudo-plan above.** The commented step 2 of the
  "Recommended deployment pattern" (l215–218) suggests
  `dependencies: ['lockdown', …]`, "where lockdown is a side-effect module".
  **That shape does not exist**, and never did: the `dependencies` grant only
  accepts registered DI modules, and lockdown is not one. The working route is
  the opposite one — user code inside `workerFn` does
  `import(<absolute module URL passed through args>)` and calls `mod.lockdown()`
  itself. That leg is measured green in Chrome and under `bun test`
  (ninth test of `src/core/worker-confinement.poc.test.js`); see
  [`docs/guide/worker-confinement.md`](../guide/worker-confinement.md)
  § Applying lockdown inside the worker.
- **Correction to the Q2 authority table.** `delete globalThis.fetch` is a
  Bun-only truth. In Chrome, `fetch` is an own property of
  `WorkerGlobalScope.prototype`, not of the worker global, so that statement is
  a no-op there and `fetch` survives; `WebSocket` *is* an own property and is
  removed as the table says. The portable revocation walks the prototype chain —
  see the guide, § Withholding ambient authority.
- **Productising this** (a first-class worker option that hardens the realm for
  you) remains out of scope and stays tracked separately.

---

## See also

- `src/core/worker-helper.js` — `createWorkerRuntime`, the grant mechanism
- `src/core/runtime.js:520` — `ModuleRuntime.serialize`, transitive graph builder
- `src/core/worker-confinement.poc.test.js` — runnable PoC (8 tests, all green)
- Task 01 deliverable: `src/sanity/lockdown.js` — integrity layer (composition partner)
- Task 03 deliverable: `docs/guide/security.md` — cross-links this note
- `docs/api/core/worker-helper.md` — API reference
