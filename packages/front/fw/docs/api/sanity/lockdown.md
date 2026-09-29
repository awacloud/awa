---
module: sanity/lockdown
category: sanity
dependencies: []
returns: "{ lockdown, harden }"
worker-safe: partial
status: complete
---

# sanity/lockdown

> Strict integrity tier — tame Function constructors, remove evaluators, transitively freeze intrinsics. SES-grade integrity, not confinement.

**Source** `packages/front/fw/src/sanity/lockdown.js` | **Type** ES module (`export { lockdown, harden }`) | **Worker-safe** partial

Unlike [`sanity/base`](./base.md) and [`sanity/community`](./community.md) — explicit-call ES modules — `lockdown.js` is the **strict integrity tier** exporting `lockdown()` and `harden()`. Integrity is **opt-in** and invoked once; it is **never** auto-applied on bare import. Auto-freezing the realm's intrinsics at import time would break SSR (Next/Astro prerender re-evaluates client modules server-side) and is untestable, so the tier follows the SES discipline: import the module freely, call `lockdown()` exactly once at startup, before any application code.

## Resolve

`lockdown` is **not** a DI module (no `runtime.resolve`, not in `core/modules.js`). Import the subpath and call it once, as early as possible:

```js
import { lockdown, harden } from '@awacloud/fw/sanity/lockdown';

lockdown();                 // freeze this realm's intrinsics, sever evaluators

// Application's own object graphs can be hardened on demand:
const config = harden({ apiBase: '/v1', limits: { rps: 10 } });
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `lockdown` | `(options?: object) => void` | Apply the integrity lockdown to the current realm. Idempotent. |
| `harden` | `<T>(target: T) => T` | Transitively `Object.freeze` an object graph; returns `target`. |

### `lockdown(options?)`

Idempotent (a module-level guard short-circuits repeat calls). Performs, in order:

1. **`tameFunctionConstructors()`** — replaces `constructor` on `Function.prototype` and on the three hidden function-constructor prototypes (`%GeneratorFunction%`, `%AsyncFunction%`, `%AsyncGeneratorFunction%`) with a throwing shim. This closes the `({}).constructor.constructor('code')` escape — **the single most important measure**: without it any object can reach `Function.prototype.constructor` (= `Function`) and rebuild an evaluator, bypassing everything else.
2. **Capture real WebAssembly evaluators** — the gate seam in `wasm-gate.js` captures the genuine `compile`, `compileStreaming`, `instantiate`, and `instantiateStreaming` functions before they are poisoned.
3. **Remove ambient evaluators** — `globalThis.eval` and `globalThis.Function` are replaced with a throwing shim, as are the WebAssembly evaluators (steps 2 captured the real ones for gated holders).
4. **Poison sync WebAssembly constructors** — `new WebAssembly.Module` and `new WebAssembly.Instance` are wrapped with throwing shims to close the synchronous-constructor escape (caller-supplied bytes cannot execute). This runs **before** the intrinsic freeze (`lockdown.js:371-375`) so a future hardening of the `WebAssembly` namespace cannot silently defeat the poison.
5. **`harden(intrinsics)`** — transitive `Object.freeze` over the standard intrinsic graph (own props + accessor functions + `[[Prototype]]`, WeakSet-guarded against cycles), starting from an exhaustive enumerated root set (see Notes).
6. **DOM/XSS hardening (browser realm only)** — when `window` and `document` are present, `lockdown()` calls `applyBase()` to compose its DOM denylist (`innerHTML`→`innerText` redirect, dangerous `iframe`/`object`/`embed` setters, `document.write`/`execCommand`, …). Steps 1–5 target pure-JS intrinsics and run in **any** realm (main thread, Worker, SSR); step 6 is gated so non-browser realms never apply the DOM layer.
7. **Arm the WebAssembly capability gate** — finalize the seam so `wasmRuntime` can obtain the capability and load fw's vendored binaries under the locked realm.

`options` is currently reserved (unused).

### `harden(target)`

Depth-first transitive freeze: visits `target`'s own property *values* (data values plus getter/setter functions, by descriptor — getters are **not** invoked) and its `[[Prototype]]`, calling `Object.freeze` on each object/function exactly once (a `WeakSet` guards cycles and re-visits). Primitives are skipped; host objects that refuse freezing are tolerated best-effort. Returns the same `target`. Mirrors SES `harden` for application use.

## Examples

### Startup lockdown

```js
// main.js — first line of the app, before any module registration.
import { lockdown } from '@awacloud/fw/sanity/lockdown';
lockdown();

import { runtime } from '@awacloud/fw';
import modules from '@awacloud/fw/core/modules';
runtime.registerAll(modules);
```

### The escape is closed

```js
lockdown();

// All four constructor kinds resolve to the throwing shim:
({}).constructor.constructor('return globalThis');  // throws TypeError
(function () {}).constructor('return 1');            // throws
(async () => {}).constructor('return 1');            // throws
(function* () {}).constructor('return 1');           // throws

globalThis.eval('1 + 1');                            // throws
globalThis.Function('return 1');                     // throws

Object.isFrozen(Object.prototype);                   // true
Object.prototype.polluted = 1;                       // throws in strict mode
```

### Hardening an application object graph

```js
const policy = harden({
    roles: { admin: ['read', 'write'], guest: ['read'] },
});
policy.roles.admin.push('delete'); // throws — frozen transitively
```

## Notes

- **Intrinsic root set** (exhaustive by design — a missing intrinsic is a hole): every standard global constructor/namespace (`Object, Function, Array, String, Number, Boolean, BigInt, Symbol, Date, RegExp, JSON, Math, Promise, Map, Set, WeakMap, WeakSet, WeakRef, FinalizationRegistry, Reflect, Proxy, Atomics, ArrayBuffer, SharedArrayBuffer, DataView`, every concrete TypedArray), the full `Error` hierarchy (`Error, TypeError, RangeError, ReferenceError, SyntaxError, EvalError, URIError, AggregateError`), each root's `.prototype`, and the **hidden intrinsics** reached structurally: `%TypedArray%`, `%IteratorPrototype%`, `%AsyncIteratorPrototype%`, `%GeneratorFunction%`/`%AsyncFunction%`/`%AsyncGeneratorFunction%` (+ prototypes), and the `%ThrowTypeError%` poison pill. Every access is `typeof`/`try`-guarded so frozen-but-missing hosts never throw.
- **What the WebAssembly surface deliberately leaves open.** `WebAssembly.validate` is **not** poisoned — the simd128 feature probe must keep working under a locked realm — and neither are `WebAssembly.Memory`, `Table` and `Global`. `WebAssembly` is also absent from the intrinsic root set above, so the namespace itself is never frozen. That is deliberate, not an oversight: none of them can compile or instantiate a module, so closing them would buy no confinement while breaking capability detection. Treat this as the surface's contract — do not "open" what was never closed, and do not add these to a hardening sweep. The corollary for the sync-constructor poison of step 4: it is installed with `defineProperty` and only works while `WebAssembly` stays unhardened, which is why the step **asserts its own effect and throws** rather than silently tolerating a failed write.
- **Idempotent**: a second `lockdown()` call is a no-op (guard flag), and every individual step tolerates already-frozen / already-poisoned slots.
- **Default tier.** New applications call `lockdown()` once at startup. In a browser realm it also applies the `base` DOM/XSS denylist (step 6), so `lockdown()` is a superset of `applyBase()`. Choose `community`/`base` alone only when a host framework patches prototypes (Next/Astro dev toolbars). See [Security guide § Recommended default](../../guide/security.md#recommended-default) — including the zero-bundler caveat: no `sanity-lockdown-classic.min.js` artifact is built today.
- **Worker-safe: partial** — the integrity routine (steps 1–5) runs in any realm including Workers and SSR; the composed DOM hardening (step 6) is browser-only and gated (`lockdown.js:383`). fw does **not** apply `lockdown()` inside the workers it spawns — see [Worker confinement](../../guide/worker-confinement.md) § Applying lockdown inside the worker.
- **Two import forms — choose by whether you control the call site.**
  - `@awacloud/fw/sanity/lockdown` (source `src/sanity/lockdown.js`) is the tier itself: an **explicit-call** ES module. A bare import of it hardens **nothing** — you call `lockdown()` yourself. This is the correct form everywhere you can write a statement: application entry points, and the bundler integrations that have a snippet-injection seam (Vite, esbuild, Rollup, Bun — driven by `core.sanityImportLine`, which emits `import {lockdown} …; lockdown();`). It is also the only form exporting `harden()`.
  - `@awacloud/fw/sanity/lockdown.apply` (source `src/sanity/lockdown-apply.js`) is a thin **self-applying** wrapper: importing it calls `lockdown()`. Side effect at import **by design** — the same sanctioned exception as the built `.classic` artifacts of the other two tiers, which self-apply on import for the same reason. It exports nothing; importing it *is* the API. Use it **only** where a host can prepend a module specifier but cannot inject a call — the Webpack plugin's entry-import prepend is exactly that case, and `sanity: 'lockdown'` there was a silent no-op until this wrapper landed, because the specifier it prepended was the inert explicit-call source.
  - Both spellings resolve to one module instance, so `lockdown()`'s guard makes them idempotent in either order (whichever runs first applies; the other is a no-op). The wrapper's worker-safety is `partial`, inherited verbatim: it applies wherever `lockdown()` applies and adds no realm requirement of its own. Being side-effect-only, it is listed in the package's `sideEffects` array — without that entry a production bundler flags it pure and deletes the prepended import, silently re-opening that silent no-op.

### Comparison to SES (honest)

**What this tier matches:**

- **Integrity** — tamper-proof primordials (frozen intrinsics, no prototype poisoning) and **escape-closure**: `eval`/`Function` cannot be reconstructed via `f.constructor`. This is the core of what SES `lockdown()` provides.
- A standalone **`harden`** with the same transitive-freeze semantics for application object graphs.

**What this tier does NOT do (deviations — by design):**

- **No confinement / no `Compartment`.** This tier provides **integrity only**. It does not give you isolated evaluation of untrusted code. Untrusted code is isolated via **Workers** (a separate realm behind a structured-clone boundary) — see the [Worker confinement guide](../../guide/worker-confinement.md). Do not run untrusted code in the main realm and rely on this tier to contain it; it cannot.
- **`globalThis` is left extensible by design.** The app realm must stay open to add globals, so only the named evaluators are removed — `globalThis` itself is not sealed/frozen. This is weaker than SES's sealed Compartment global.
- **Not a SES *permits* allowlist.** This is a pragmatic transitive freeze over an enumerated root set, **not** SES's audited, per-property *permits* allowlist (which whitelists exactly the standard properties and removes the rest). It freezes what is reachable; it does not certify the shape of each intrinsic.
- **Residual code-loading vectors are NOT closed by property taming.** Dynamic `import()` is *syntax*, not a property — it cannot be poisoned by replacing a slot — and `<script>` injection is a DOM/network vector. Close these with a server **CSP** (`script-src`) or by running in a Worker without those powers. The DOM step (browser realm) blocks `innerHTML`/dangerous-element vectors but does not replace a CSP.

## See also

- [sanity/base](./base.md) — composed DOM/XSS denylist (browser realm) and the prototype freeze it shares
- [sanity/community](./community.md) — framework-friendly degraded denylist
- [Security Guide](../../guide/security.md) — threat model and non-guarantees of the sanity layer
- [Worker confinement](../../guide/worker-confinement.md) — isolated evaluation of untrusted code, the confinement complement to this integrity tier (the 2026-06-15 spike record it supersedes is [`docs/notes/worker-confinement-spike.md`](../../notes/worker-confinement-spike.md))
