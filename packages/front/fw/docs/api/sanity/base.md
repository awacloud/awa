---
module: sanity/base
category: sanity
dependencies: []
returns: "{ applied, reason, steps }"
worker-safe: false
status: complete
---

# sanity/base

> Security lockdown — explicit-call ES module. Blocks dangerous APIs on `window` and `document`, redirects `innerHTML` to `innerText`, freezes native prototypes.

**Source** `packages/front/fw/src/sanity/base.js` | **Type** ES module, explicit call | **Worker-safe** no

ES module exporting `applyBase()`, an explicit-call function. It is not imported via `runtime.resolve()` and does not auto-apply on import. Call `applyBase()` once before any application code to lock down the realm.

## Resolve

```js
import { applyBase } from '@awacloud/fw/sanity/base';
applyBase();  // must be called before all application code
```

For zero-bundler deployment (static HTML), load the built classic artifact instead, which self-applies on load:

```html
<script src="packages/front/fw/dist/build/sanity-base-classic.min.js"></script>
<script type="module" src="src/main.js"></script>
```

## API

`applyBase()` applies 15 sequential steps that lock down the realm. Returns `{ applied: boolean, reason?: string, steps: string[], failures: { step, target, message }[] }` — the step list records the order; `failures` lists every slot a step could not harden (a non-configurable property, a frozen namespace), `[]` on a clean apply.

| Section | Method / Property | Effect |
|---------|-------------------|--------|
| **window** | `eval`, `Function`, `Reflect` | Throws `'not allowed'` — the global slots only: `({}).constructor.constructor('code')` still builds an evaluator under this tier alone (`lockdown()` closes it) |
| **window** | `alert`, `confirm`, `prompt`, `open` | Throws `'not allowed'` |
| **window** | `importScripts` | Throws `'not allowed'` |
| **window** | `import()` (dynamic) | **Not intercepted** — the `window.import` property throws on access, but the syntactic `import()` form is language syntax, not a property, so it cannot be poisoned by slot replacement. Closed by a server CSP (`script-src`) or a Worker, not this tier. |
| **window** | `Math.random` | Throws `'not allowed: use crypto.getRandomValues instead'` |
| **window** | `crypto.randomUUID` | Throws `'not allowed'` |
| **window** | `performance.now`, `performance.mark`, `performance.measure`, `performance.getEntries` | Throws `'not allowed'` |
| **document** | `write`, `writeln`, `open`, `close`, `execCommand`, `execScript`, `evaluate`, `implementation`, `createContextualFragment` | Throws `'not allowed'` |
| **Range.prototype** | `createContextualFragment` | Throws `'not allowed'` — the markup parser `document.createRange()` reaches (blocked in the `Element.prototype` step; measured in Chromium) |
| **document** | `domain` (set) | Throws `'not allowed'` |
| **history** | `pushState`, `replaceState`, `go`, `back`, `forward` | Throws `'not allowed'` |
| **Element.prototype** | `innerHTML` (set), `outerHTML` (set), `insertAdjacentHTML(position, html)` (call) | Redirected to `innerText` / `outerText` / `insertAdjacentText` — no exception raised; the getters keep working |
| **Date** | `Date.now` | Rounded to 100 ms (`Math.floor(ts / 100) * 100`) |
| **Timing** | `setTimeout`, `setInterval`, `requestAnimationFrame` with a string | Throws `'not allowed'` |
| **JSON** | `JSON.parse(text, reviver)` | Throws `'not allowed'` if reviver is present |
| **JSON** | `JSON.stringify(val, replacer)` when replacer is a function | Throws `'not allowed'` |
| **iframe / object / embed** | `src`, `srcdoc`, `data`, `href`, `innerHTML`, `codebase`, `archive` (set) | Throws `'not allowed'` |

## Frozen prototypes

`Object.freeze()` applied to:

```
Object.prototype    Array.prototype     Function.prototype
String.prototype    Number.prototype    Boolean.prototype
Date.prototype      RegExp.prototype    Error.prototype
```

Only these nine. The other built-in prototypes (`Map`, `Set`, `Promise`, the typed arrays) and the DOM prototypes (`Element`, `Node`, `EventTarget`) stay unfrozen under this tier; `lockdown()` freezes every intrinsic.

On each prototype, `constructor` → non-writable / non-configurable. Setting `__proto__` throws: the guarded setter is installed on `Object.prototype`, the one prototype that owns the accessor, so every object inherits it and `[].__proto__` still reads `Array.prototype`.

## Examples

### Correct loading

```js
// app.js — first import
import { applyBase } from '@awacloud/fw/sanity/base';
const result = applyBase();  // → { applied: true, steps: ['freezePrototypes', 'window', ...], failures: [] }
// Now safe to import and use the framework
import { runtime } from '@awacloud/fw';
```

Or for zero-bundler deployment:

```html
<!doctype html>
<html>
<head>
  <script src="packages/front/fw/dist/build/sanity-base-classic.min.js"></script>
  <script type="module" src="app.js"></script>
</head>
</html>
```

### Verify that a block is active

```js
try {
    eval('1+1');
} catch (e) {
    console.warn('eval blocked:', e.message); // "not allowed"
}

try {
    Math.random();
} catch (e) {
    console.warn('Math.random blocked:', e.message); // "not allowed: use crypto.getRandomValues instead"
}
```

### Math.random replacement

```js
// Math.random() throws — use the framework's random module instead:
const random = runtime.resolve('random');
const buf = new Uint8Array(4);
random.bytes(buf); // CTR_DRBG-AES-256
```

## Notes

- The ES module source `src/sanity/base.js` must be imported and `applyBase()` must be called. Bare import (without calling) has no effect.
- For zero-bundler deployment, use the built classic artifact `dist/build/sanity-base-classic.min.js`, which self-applies on load via `<script src>`.
- `innerHTML` → `innerText` redirections are silent — no exception is raised on assignment.
- `LOG_ATTEMPTS = true` (current source value): each blocked attempt produces a `console.warn` with stack trace.
- `Date.now` is rounded to 100 ms to reduce timing precision (fingerprinting / timing attacks). `community.js` adopts a more lenient rounding (framework-friendly degraded layer).
- Prototype freezing is irreversible for the duration of the session — call `applyBase()` before any library that attempts to modify prototypes.
- Dangerous elements covered: `iframe`, `object`, `embed`. `community.js` covers the same set with relaxed restrictions to remain compatible with popular frameworks.
- **Playwright drivability consequence**: Observe a hardened realm over the network, never through the evaluation channel. `applyBase()` makes a page undrivable by Playwright — its blocked-property getter (at `base.js:100`) throws inside the injected UtilityScript in both Chromium and Firefox engines (measured). End-to-end test legs must use network observation with a barrier request afterwards to confirm confinement, never via `page.evaluate()` on an applyBase'd page; absent requests and unobserved requests are indistinguishable without the barrier.
- **What this tier does not do (measured in Chromium).** It does not close the `({}).constructor.constructor` evaluator escape and does not affect the `debugger` statement (the `disableDebugger` step only caps `Error.stackTraceLimit`; a `debugger` statement is language syntax and never consults `window.debugger`). For the integrity guarantees use `lockdown()`, which composes this tier.
- **Dynamic `import()` survives `applyBase()` (measured)**: `src/crypto/wasm/runtime.js` performs a live in-factory dynamic import after `applyBase()` has already run, in the same realm — direct proof that the syntactic form is not intercepted by this tier's property poisoning (see the `import()` row above).

## See also

- [sanity/community](./community.md) — framework-friendly variant (degraded layer for framework-hosted apps)
- [Security Guide](../../guide/security.md) — rationale and threat model
- [uuid](../crypto/utils/uuid.md) — safe replacement for `crypto.randomUUID`
