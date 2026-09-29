---
category: guide
---

# Security — sanity tiers and honest threat model

## Sanity tier spectrum

`@awacloud/fw` ships three sanity tiers that form a strict progression. Pick the one that matches your app's deployment constraints.

| Tier | Module | Kind | Framework-friendly | What it gives you |
|---|---|---|---|---|
| `community` | `sanity/community` | ESM, explicit call | Yes | XSS denylist, reduced API surface — tolerates Next/Astro SSR and dev toolbars |
| `base` | `sanity/base` | ESM, explicit call | Partial | Strict XSS denylist + prototype freeze — breaks frameworks that patch prototypes; Astro disables dev toolbar |
| `lockdown` | `sanity/lockdown` | ESM, explicit call | No | **Integrity**: tame Function constructors, remove evaluators, transitively freeze all intrinsics (SES-grade) |

### Recommended default

New applications call `lockdown()` once at startup. In a browser realm it also
applies the `base` DOM/XSS denylist (step 6, `sanity/lockdown.js:383-397`), so
`lockdown()` is a **superset** of `applyBase()` — there is no reason to call
both. Choose `community` or `base` alone only when a host framework patches
prototypes (Next / Astro dev toolbars), which the frozen intrinsics break.

```js
// main.js — first statements of the app, before any application code.
import { lockdown } from '@awacloud/fw/sanity/lockdown';
lockdown();
```

**Zero-bundler caveat.** `bun run prebuild:sanity` emits `base` and `community`
classic artifacts only (`sanity-base-classic.min.js`,
`sanity-community-classic.min.js`, plus `sanity.min.js` — a byte-identical
alias of the base one); the tier list is `['base', 'community']` in
`tools/fw-bundler/src/bundle/index.js:289`, so **there is no
`sanity-lockdown-classic.min.js` today**. A static page therefore has two
options: keep `sanity.min.js` (= `base`) as the classic `<script>` lock, or get
the default tier from a module script with an import map —

```html
<script type="importmap">
{ "imports": { "@awacloud/fw/": "/packages/front/fw/src/" }}
</script>
<script type="module">
    import { lockdown } from '@awacloud/fw/sanity/lockdown.js';  // .js required in an import map
    lockdown();
</script>
```

For the confinement half — Workers, capability grants and withholding ambient
authority — see [Worker confinement](./worker-confinement.md).

### Using `community` or `base`

Both are **explicit-call ES modules**. Import and call the function:

```js
import { applyBase } from '@awacloud/fw/sanity/base';
applyBase();  // or import { applyCommunity } from '@awacloud/fw/sanity/community'; applyCommunity();
```

With a bundler plugin the invoking snippet is injected automatically:

```js
fw({ sanity: 'base' })             // or 'community'
// emits: import { applyBase } from '@awacloud/fw/sanity/base'; applyBase();
```

### Zero-bundler deployment

For static HTML without a bundler, load the built classic artifact (a pre-built, self-applying form):

```html
<script src="packages/front/fw/dist/build/sanity-base-classic.min.js"></script>
<script type="module" src="src/main.js"></script>
```

### Using `lockdown`

`lockdown.js` is an **explicit-call ES module**. A bare import does nothing — you must call `lockdown()`:

```js
import { lockdown } from '@awacloud/fw/sanity/lockdown';
lockdown();  // call once, before any application code
```

With a bundler plugin the invoking snippet is injected automatically:

```js
fw({ sanity: 'lockdown' })
// emits: import { lockdown } from '@awacloud/fw/sanity/lockdown'; lockdown();
```

## Integrity vs confinement

These are distinct security properties. This table is intentionally blunt.

| Property | What it means | Does `lockdown` give you this? |
|---|---|---|
| **Integrity** | Intrinsics are tamper-proof; `eval`/`Function` cannot be reconstructed; no prototype poisoning | **Yes** — this is what `lockdown()` does |
| **Confinement** | Untrusted code cannot read/write outside its assigned scope | **No** |

### What `lockdown` gives you (integrity)

- **Evaluator-reconstruction escape closed**: `({}).constructor.constructor('code')` and its three async/generator variants all throw.
- **Ambient evaluators removed**: `globalThis.eval`, `globalThis.Function`, and `WebAssembly.compile*`/`instantiate*` are replaced with throwing shims.
  - **WebAssembly capability-guarded**: Only a holder of the fw wasm capability may compile or instantiate WebAssembly after `lockdown()`. The sole holder is `wasmRuntime`, whose only public entry point selects a build-time-vendored binary BY NAME and fetches its bytes from fw's internal URL space. Caller-supplied bytes have no route. The global `compile`/`instantiate` slots stay poisoned; `validate` and `Memory` are untouched.
- **Standard intrinsics transitively frozen**: every standard global (`Object`, `Array`, `Function`, `Promise`, …), its `.prototype`, and the hidden intrinsics (`%TypedArray%`, `%IteratorPrototype%`, `%GeneratorFunction%`, …) are `Object.freeze`-d depth-first. Prototype poisoning attacks (e.g. `Array.prototype.push = ...`) fail in strict mode.
- In a browser realm, `lockdown()` also composes the `base.js` DOM/XSS denylist (`innerHTML`→`innerText` redirect, `document.write`, dangerous element setters, …).

### What `lockdown` does NOT give you

- **No confinement**: untrusted code running in the same realm after `lockdown()` can still read and write any mutable globals and module-scope variables it can reach. This tier prevents *manipulation of the language substrate* — it does not prevent *information flow between principals*.
- **`globalThis` stays extensible**: only the named evaluator slots are poisoned; `globalThis` itself is not sealed or frozen. An attacker who can run code before `lockdown()` (or who has a reference to a live evaluator captured before `lockdown()`) is not stopped.
- **Dynamic `import()` and `<script>` are not closed by property taming**: `import()` is syntax, not a property — it cannot be poisoned by slot replacement. `<script>` injection is a network/DOM vector. Close these with a server-side **Content Security Policy** (`script-src`).
- **Not a SES permits allowlist**: this is a pragmatic transitive freeze over an enumerated root set, not SES's audited per-property permits allowlist (which whitelists exactly the standard properties and removes the rest). It freezes what is reachable; it does not certify the shape of each intrinsic.

## Isolation / confinement: use Workers

**Isolation of untrusted code is done by Web Workers**, not by the sanity tiers.

Workers run in a **separate realm** (their own JavaScript global) and communicate exclusively via `postMessage` / structured-clone — there is no shared mutable state between the worker and the main thread. This is the only robust confinement boundary the browser provides.

`@awacloud/fw`'s serializable-modules-run-in-workers design is the framework's confinement story:

- [Worker confinement](./worker-confinement.md) — **the guide**: capability grant via `dependencies`, withholding ambient authority in `workerFw`, applying `lockdown()` inside the worker realm, runnable examples and honest limits.
- [`docs/notes/worker-confinement-spike.md`](../notes/worker-confinement-spike.md) — the historical spike record (2026-06-15): realm separation, structured-clone boundary, module serialisability constraints, and integration with `workerPool`.

A typical deployment combining integrity and isolation:

```js
// main.js — lock down the main realm first
import { lockdown } from '@awacloud/fw/sanity/lockdown';
lockdown();

// Run untrusted/high-risk computation in a Worker (separate realm)
import { runtime } from '@awacloud/fw';
const pool = runtime.resolve('workerPool');
const result = await pool.run(trustedWorkerModule, untrustedInput);
```

---

# Security — sanity/base.js

> Security lock loaded **before** all application code. Blocks dangerous APIs, redirects unsafe DOM mutations, and freezes native prototypes.

## Loading

`sanity/base.js` is an **ES module** exporting `applyBase()`. Call it once before all application code:

```js
import { applyBase } from '@awacloud/fw/sanity/base';
applyBase();  // must be called before all application code

import { runtime } from '@awacloud/fw';
import modules from '@awacloud/fw/core/modules';
runtime.registerAll(modules);
```

For zero-bundler deployment (standalone HTML with no build step), load the built classic artifact, which self-applies on load:

```html
<script src="packages/front/fw/dist/build/sanity-base-classic.min.js"></script>
<script type="module" src="src/main.js"></script>
```

The framework (`main.js`) assumes the lock is already active.

### Production logs

By default, each attempt to access a blocked API displays a detailed `console.warn` (stack trace included) — useful in development, sometimes noisy in production (third-party libs that probe the environment). To silence the logs, build with the `--no-sanity-log` flag:

```sh
fw-bundler bundle all --no-sanity-log
```

The flag patches the `LOG_ATTEMPTS = false` constant in `src/sanity/base.js` at build time (the emitted `dist/build/sanity.min.js` bundle becomes silent). The protection itself remains active — only the `console.warn` messages disappear. There is no runtime toggle (no HTML attribute, no global flag); the opt-out is a build decision.

## What is blocked

### Blocked `window` APIs

These properties are replaced with no-op functions or neutral values:

| API | Behaviour after locking |
|-----|---------------------------------|
| `eval` | throw `'not allowed'` |
| `alert`, `confirm`, `prompt` | throw |
| `Function` | throw |
| `open`, `opener` | throw |
| `import()` (dynamic) | throw |
| `importScripts` | throw (worker contexts) |
| `Reflect` | throw |

### Blocked `document` APIs

| API | Behaviour |
|-----|--------------|
| `document.write` | throw |
| `document.writeln` | throw |
| `document.execCommand`, `evaluate`, `implementation`, `createContextualFragment` | throw |
| `document.open`, `close` | throw |
| `document.domain` (set) | throw |

### History and navigation

| API | Behaviour |
|-----|--------------|
| `history.pushState` | throw |
| `history.replaceState` | throw |
| `history.go` / `back` / `forward` | throw |

### Entropy and timing

| API | Behaviour |
|-----|--------------|
| `Math.random` | throw `'not allowed: use crypto.getRandomValues instead'` |
| `crypto.randomUUID` | throw |
| `performance.now` | throw |
| `performance.mark` / `measure` / `getEntries` | throw |
| `Date.now` | rounded to 100 ms (reduces timing precision) |

> **Why?** These APIs are classic vectors for client-side entropy extraction for fingerprinting. The framework provides `uuid` (worker-safe, CSPRNG) instead of `Math.random`/`crypto.randomUUID`.

## What is redirected (not blocked)

HTML mutations via string are **redirected to their text equivalent** — they do not throw but do not inject HTML:

| Dangerous API | Redirected to |
|----------------|---------------|
| `element.innerHTML = ...` | `element.innerText = ...` |
| `element.outerHTML = ...` | `element.innerText = ...` |
| `element.insertAdjacentHTML(...)` | Inserted as text |

This protects against accidental XSS injection while allowing existing code to run without errors.

## Frozen prototypes

Native type prototypes are frozen (`Object.freeze`) to prevent prototype chain modifications:

- `Object.prototype`
- `Array.prototype`
- `Function.prototype`
- `String.prototype`
- `Number.prototype`
- `Boolean.prototype`
- `Date.prototype`
- `RegExp.prototype`
- `Error.prototype`

Any attempt to modify these prototypes fails silently (in non-strict mode) or throws a `TypeError` (in strict mode).

## Development impact

### What the framework uses instead

| Blocked API | Framework alternative |
|-------------|----------------------|
| `Math.random` / `crypto.randomUUID` | `runtime.resolve('uuid')` |
| HTML injection (`innerHTML`) | `parser` → `render` → `template` pipeline |
| `eval` / `Function(...)` | No equivalent (not needed) |

### Compatibility with external libraries

Third-party libraries using blocked APIs **will not work** under `sanity/base.js`. The `packages/front/fw/external/` directory is reserved for adapters for external code, but is not enabled by default.

### Test environment

In isolated unit tests (without a full browser), `sanity/base.js` can be omitted. Integration tests should load it first.

## Threat model and **non-guarantees**

`sanity/base.js` closes **HTML/JS injection vectors via dynamic JavaScript API**. It does not replace a complete application security policy. This section explicitly lists what sanity does **not** cover — to avoid over-reliance.

### Shared security policy: `secPolicy` module

All defences above sanity (URL safety, DOM clobbering, dangerous CSS, `on*`, blocked tags) are **centralised** in the [`secPolicy`](../api/dom/rendering/secPolicy.md) module. This is the single source of truth — `template`, `render`, `parser`, `sanitize` and `dom` consume it rather than duplicating regexes and attribute Sets. Typical use case for an app developer:

```js
const sp = runtime.resolve('secPolicy');
if (!sp.isSafeUrl(userInput))  return; // reject javascript:, vbscript:, data:text, …
if (sp.isClobberValue('id', userInput)) return; // reject 'cookie', 'domain', …
if (!sp.isSafeCss(prop, val))  return; // reject expression(), url(javascript:)
```

The sections below list the non-guarantees **of the sanity lock alone**. Framework modules (which inject `secPolicy`) add these protections automatically; direct calls to `dom.attr` / `dom.style` / `setAttribute` bypass them.

### `javascript:` / `vbscript:` URLs in attributes

Sanity blocks **HTML mutations by string** (`innerHTML`, etc.) but cannot inspect a value passed to `setAttribute('href', 'javascript:…')`. A malicious `href` or `src` attribute created via `element.setAttribute` remains active.

**Applied mitigation**: the `template` module filters URL-bearing attributes (`href`, `src`, `action`, `formaction`, `srcset`, `xlink:href`, `data`, `codebase`) via `secPolicy.isSafeUrl` — dangerous schemes and `data:text|application` are removed. `render.toHTML` (SSR path) applies exactly the same rules.

**Limitation**: if you call `dom.attr(node, 'href', userInput)` directly (bypassing the `template` pipeline), **no filter is applied**. You must validate via `secPolicy.isSafeUrl(url)`.

### DOM clobbering

A `name` or `id` attribute that collides with a global property of `document` (`document.cookies`, `document.domain`, …) can overwrite/expose the native property:

```html
<input name="cookies" value="evil">
<!-- Becomes document.cookies = HTMLInputElement -->
```

**Applied mitigation**: `template` and `render.toHTML` consult `secPolicy.CLOBBER_NAMES` and reject ~30 known values on `id`/`name` attributes. `secPolicy.isClobberValue(attr, value)` is exposed for custom pipelines.

### Dangerous CSS

`dom.style(node, prop, value)` now filters via `secPolicy.isSafeCss(prop, val)`:
- `expression(...)` (IE-only, deprecated) → blocked
- `url(javascript:…)` / `url(vbscript:…)` / `url(data:text|application)` → blocked
- `behavior` / `-ms-behavior` properties (IE HTC) → blocked

Obfuscation by spaces / control characters is neutralised (the test is applied after collapse + lowercase). **However**, user-controlled CSS passed to `dom.style` remains risky — prefer `themeTokens` which controls the entire set of allowed values.

### Biometric side-channels

The `gesture` and `dnd` modules collect pointer coordinates and timings (`pointerdown`/`pointermove`). Although not blocked by sanity (`Date.now()` remains available), this data can contribute to a biometric fingerprint (typing rhythm, gesture curves). For sensitive apps, disable these modules unless necessary.

### User HTML content via the `sanitize` module

The standard pipeline (`parser → render → template`) **does not accept** free HTML — only templates compiled by the parser. To ingest user-controlled HTML (comments, rendered Markdown, CMS content), pass through `sanitize.sanitizeHtml(html, allowlist?)` **before** insertion. The pipeline itself has no "render raw HTML" function.

### CSP nonce

`<style>` and `<script>` tags injected by `template.style(...)` / `template.script(...)` **do not carry a `nonce`** by default. Under a strict CSP (`script-src 'self' 'nonce-XXX'`), these injections will fail. Either relax the CSP via `unsafe-inline`, or wait for a `setNonce` API propagation (see fw P2 roadmap).

### External libraries

Sanity freezes prototypes and blocks `eval`/`Function`. Most modern libraries (lodash, dayjs, etc.) work, but frameworks **that patch prototypes** (jQuery `$.fn.X`, old versions of Mootools) **will not work**. Test before integrating.

---

## See also

- [sanity/base — API reference](../api/sanity/base.md)
- [sanity/community — API reference](../api/sanity/community.md)
- [sanity/lockdown — API reference](../api/sanity/lockdown.md)
- [Worker confinement](./worker-confinement.md) — the confinement guide: capability grant, ambient-authority withholding, lockdown inside the worker
- [docs/notes/worker-confinement-spike.md](../notes/worker-confinement-spike.md) — historical spike record on Worker isolation (confinement)
- [secPolicy](../api/dom/rendering/secPolicy.md) — shared security policy (URL/CSS/clobber/`on*`/tags)
- [uuid](../api/crypto/utils/uuid.md) — secure identifier generator
- [parser](../api/dom/rendering/parser.md) — safe alternative to `innerHTML`
- [sanitize](../api/dom/rendering/sanitize.md) — user-controlled HTML allowlist
- [template](../api/dom/rendering/template.md) — URL filter applied automatically
