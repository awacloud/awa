---
module: sanity/community
category: sanity
dependencies: []
returns: "{ applied, reason, steps }"
worker-safe: false
status: complete
---

# sanity/community

> Community-friendly degraded lockdown — explicit-call ES module. Drop-in for mainstream tooling (Next.js, Astro, Vite, webpack) with no special configuration. A subset of `base.js` that omits the lockdowns incompatible with framework runtimes.

**Source** `packages/front/fw/src/sanity/community.js` | **Type** ES module, explicit call | **Worker-safe** no

ES module exporting `applyCommunity()`, an explicit-call function. It does not resolve via `runtime.resolve()`. Call it before application code to apply framework-tolerant restrictions. Unlike `base.js` it leaves framework-critical globals (`Math.random`, `history`, `performance`, `JSON`, `innerHTML`, prototypes) untouched so that Next.js, Astro, and other mainstream tools run unmodified.

For untrusted-code or hostile-environment hardening, use `base.js` instead.

## Usage

```js
import { applyCommunity } from '@awacloud/fw/sanity/community';
applyCommunity();  // must be called before all application code

import { runtime } from '@awacloud/fw';
import modules from '@awacloud/fw/core/modules';
runtime.registerAll(modules);
```

For zero-bundler deployment:

```html
<script src="packages/front/fw/dist/build/sanity-community-classic.min.js"></script>
<script type="module" src="src/main.js"></script>
```

## API

`applyCommunity()` applies a subset of the `base.js` measures, omitting those incompatible with framework runtimes. Returns `{ applied: boolean, reason?: string, steps: string[] }` — the step list records which measures ran.

## KEEP vs DROP table

| `base.js` measure | community | Why |
|---|---|---|
| Block window `eval`, `alert`, `confirm`, `prompt`, `open` | **KEEP** | XSS / unwanted-dialog hardening; frameworks don't use these at runtime |
| Block window `Function`, `import`, `importScripts`, `Reflect` | **DROP** | Bundler runtimes / libs rely on dynamic `import`, `Function`, `Reflect` |
| Block document `write`, `writeln`, `open`, `close`, `execCommand`, `execScript`, `evaluate`, `createContextualFragment` | **KEEP** | `document.write`-style injection; not used by Next/Astro hydration |
| Block document `implementation` | **DROP** | Some libs read `document.implementation`; low XSS value |
| Block `Element.prototype` `setHTML`, `evaluate` | **KEEP** | Harmless to frameworks |
| Block `document.domain` (set) | **KEEP** | Harmless, good hardening |
| `wrapTimingFunctions` (reject string `setTimeout`/`setInterval`/`rAF`) | **KEEP** | Pure string-eval XSS; frameworks always pass functions |
| `blockDangerousElements` (iframe/object/embed `src`/`srcdoc`/… set → throw) | **KEEP** | Retained XSS hardening |
| `disableDebugger` (`window.debugger` shim, `stackTraceLimit`) | **KEEP** | Harmless |
| `freezePrototypes()` | **DROP** | Frozen `Object/Array/Function/…prototype` + non-writable `constructor` breaks framework hydration/instanceof/subclassing |
| Block `history.pushState`/`replaceState`/`go`/`back`/`forward` | **DROP** | Breaks Next.js `<Link>` / Astro SPA navigation |
| Block `performance.now`/`mark`/`measure`/`getEntries` | **DROP** | React scheduler and framework perf marks depend on these |
| Block `crypto.randomUUID` | **DROP** | Used by some libs/frameworks |
| `redirectPropertySetter` (`innerHTML` → `innerText`, …) | **DROP** | Corrupts hydration / `dangerouslySetInnerHTML` / templating |
| `blockJSONParsing` (reviver/replacer-fn + freeze `JSON`) | **DROP** | Framework data serialization uses JSON heavily |
| `blockPerformanceAPIs` (`Date.now` rounding) | **DROP** | Coarse `Date.now` breaks timing/animation/scheduler |
| `blockMathRandom` (`Math.random` → throw) | **DROP** | Countless libs call `Math.random`; throwing breaks them |

Result: `community.js` keeps a meaningful injection-hardening posture (no `eval`, no string-timer eval, no `document.write`/`execCommand`, no dangerous element `src` injection) while leaving intact every runtime semantic Next/Astro rely on (prototypes, history, performance, `Math.random`, `JSON`, `Date.now`, `innerHTML`).

## SSR / Server-side rendering

`community.js` is browser-only. When evaluated in a non-browser environment (Node.js, Bun, edge workers, Next.js / Astro prerender) the SSR guard fires immediately and the entire body is skipped:

```js
if (typeof window === 'undefined' || typeof document === 'undefined') return;
```

This makes it safe to bundle and import in universal (isomorphic) code without wrapping in a `typeof window !== 'undefined'` check at the call site.

## When to use base.js instead

Use `base.js` when:
- Running in a controlled environment (SDE/SDC runtime) where framework compatibility is not required.
- Evaluating untrusted user code and you need the full lockdown (frozen prototypes, blocked `Math.random`, blocked `history`, restricted JSON).
- You need the `paranoia.js` superset for complete hostile-environment hardening.

`community.js` is intentionally weaker than `base.js`. The tradeoff is explicit: you gain framework compatibility at the cost of a reduced attack surface.

## Notes

- The ES module source `src/sanity/community.js` must be imported and `applyCommunity()` must be called. Bare import (without calling) has no effect.
- For zero-bundler deployment, use the built classic artifact `dist/build/sanity-community-classic.min.js`, which self-applies on load via `<script src>`.
- `LOG_ATTEMPTS = true` (current source value): each blocked attempt produces a `console.warn` with stack trace.
- `STACK_TRACE_LIMIT = 10`: `Error.stackTraceLimit` is reduced to 10 frames (V8/Chrome only).
- SSR / Server-side rendering: `applyCommunity()` includes the SSR guard internally — calling it in a non-browser environment (Node.js, Bun, edge workers) returns `{applied: false, reason: 'non-browser-realm'}` and makes no changes.

## See also

- [sanity/base](./base.md) — full strict lockdown (use for untrusted-code / hostile environments)
- [Security guide](../../guide/security.md) — threat model and lockdown rationale
