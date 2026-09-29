---
category: guide
---

# Worker confinement under lockdown

Running untrusted or high-risk computation safely needs **two** properties, and
`@awacloud/fw` gets them from two different places. **Integrity** comes from
`lockdown()` in the main realm: the intrinsics are frozen and the evaluators are
severed, so nothing can rewrite the language substrate underneath your code.
**Confinement** comes from a Web Worker: a separate realm behind a
structured-clone boundary, entered with an explicit capability grant. Neither
alone is enough — `lockdown()` does not stop code in the same realm from reading
your module scope, and a Worker on its own hands untrusted code a fresh,
fully-mutable realm complete with ambient network authority. See
[`security.md` § Integrity vs confinement](./security.md#integrity-vs-confinement)
for the blunt version of that table.

## The two properties

| Property | What it means | Where fw gets it |
|---|---|---|
| **Integrity** | Intrinsics are tamper-proof; `eval`/`Function` cannot be reconstructed via `f.constructor`; no prototype poisoning | `lockdown()` — [`sanity/lockdown`](../api/sanity/lockdown.md), called once per realm |
| **Confinement** | Untrusted code cannot read or write outside its assigned scope; it reaches only what it was granted | `createWorker(fn, { dependencies })` — separate realm + structured-clone boundary + capability grant |

Applied together the guarantees compose: code runs in a realm where (a) it can
reach only the modules you granted, (b) the built-ins are frozen, (c) the
ambient authorities you revoked are gone, and (d) data crosses only as
structured-clone values.

## Grant = the dependencies list

`createWorker(workerFn, { dependencies })` is the capability grant, and it is
**structural rather than advisory**. `runtime.serialize(dependencies)`
(`core/worker-helper.js:184`) builds the source of exactly the listed modules
plus their transitive graph; that string — and nothing else from the parent
registry — is embedded in the worker program. A module you did not list has no
factory source inside the worker at all: it is not hidden, it is absent, and
even `runtime.resolve('secret')` inside the worker throws `Module not found`.

Transitive dependencies are a second, finer distinction. They are **registered**
in the worker's runtime (the graph must resolve) but they are **not exposed** in
`libs`: `DEFAULT_WORKER_FRAMEWORK` calls `runtime.resolveAll()` with your
original `dependencies` array, not with the serialized graph
(`core/worker-helper.js:196`). Granting `['sha256']` therefore yields
`libs === { sha256 }`, even though `bitArray` and `utf8` were serialized
alongside it.

Measured, in a browser page served from the fw package root: granting
`['sha256', 'hex']` produced `Object.keys(ctx.libs) === ['sha256', 'hex']`, and
a module registered on the parent runtime but absent from the grant
(`signal`) was `undefined` inside the worker. The same claims are asserted
under `bun test` by the regression suite
(`src/core/worker-confinement.poc.test.js`).

## Withholding ambient authority

The `workerFw` option is the hook that runs **before** user code. fw assigns its
return value to `runtime.context` and immediately calls `workerFn` with it
(`core/worker-helper.js:207-209`), so the ordering is deterministic:
confinement setup → resolve the grant → run user code. Three constraints follow
from how it is embedded:

- It is **stringified** (`workerFw.toString()`), so it must be self-contained —
  no closure over any main-thread binding.
- It is **synchronous**: its return value is assigned directly, never awaited.
  A `workerFw` that returns a Promise assigns a Promise to `runtime.context`.
- Its only channel from the parent is `args`, which is JSON-serialised into the
  worker program.

### Revoking an authority is not always `delete globalThis.X`

This is the part that is easy to get wrong, and both halves below are measured.

In a **browser** worker the global's own properties are only part of the story.
Chrome's `DedicatedWorkerGlobalScope` inherits from `WorkerGlobalScope`, and
`fetch` is an own property of `WorkerGlobalScope.prototype`, not of the global
object. `delete globalThis.fetch` therefore deletes nothing and `fetch` stays
fully usable. `WebSocket` *is* an own property of the global and is deleted as
expected — so the naive pattern half-works, which is worse than failing.

Measured in Chrome, inside a `blob:` worker spawned by `createWorker`:

| Probe | Result |
|---|---|
| `Object.hasOwn(self, 'fetch')` | `false` — it lives on `WorkerGlobalScope.prototype` |
| `Object.hasOwn(self, 'WebSocket')` | `true` |
| `delete globalThis.fetch` then `typeof fetch` | still `'function'` — **no-op** |
| delete `fetch` from its owning prototype, then `typeof fetch` | `'undefined'` — revoked |

Under **Bun** (`bun test`, Bun 1.3.13) `fetch` *is* an own property of the
worker global, so `delete globalThis.fetch` works there. The portable form walks
the prototype chain and deletes the property from whichever object actually owns
it:

```js
const confinedWorkerFw = function (runtime, moduleNames, args) {
    // Self-contained by contract: no closure over main-thread bindings.
    const revoke = (name) => {
        let o = globalThis;
        while (o) {
            if (Object.prototype.hasOwnProperty.call(o, name)) { delete o[name]; return; }
            o = Object.getPrototypeOf(o);
        }
    };
    ['fetch', 'WebSocket', 'Worker', 'BroadcastChannel', 'XMLHttpRequest'].forEach(revoke);

    const libs = runtime.resolveAll(moduleNames);
    return { libs, args };
};
```

### Residuals

Two authorities survive any property-level revocation, because they are
**syntax**, not properties:

- **Dynamic `import()`** cannot be deleted. It is available inside the `blob:`
  classic worker fw spawns (measured in Chrome and under Bun) and will resolve
  absolute URLs. Close it with a server-side CSP (`script-src`,
  `worker-src`) — property taming cannot.
- **`eval` / `Function`** are live inside a fresh worker realm. `lockdown()`
  severs them, which is exactly why the next section exists.

## Applying lockdown inside the worker — status

**fw does not wire `lockdown()` into the worker realm.** That is a measured
statement about the current code, not a policy: `lockdown` is not a DI module
(it is absent from `src/core/modules.js`), it is not part of `runtimeSource`, and
`workerFw` — the only pre-user-code hook — is synchronous
(`core/worker-helper.js:207`), so it cannot `await` the dynamic `import()` that
would be needed to obtain the module inside a `blob:` worker.

A worker that needs its own intrinsics frozen must therefore do it itself:
`import()` `sanity/lockdown` at the top of `workerFn` and call `lockdown()`
before touching `libs`. The module URL has to travel through `args`, because a
`blob:` worker has no notion of the package root and cannot resolve a bare or
relative specifier.

This leg is measured green in both realms — see [Example 2](#example-2--freezing-the-workers-own-intrinsics)
below. Productising it (a first-class `lockdown: true` worker option) is **not**
part of this guide's contract; it is tracked separately.

## Runnable example

Both examples below were executed before being written down. Example 1 was run
in Chrome against a page served from the fw package root; Example 2 was run in
Chrome the same way **and** is asserted under `bun test` as the ninth test of
`src/core/worker-confinement.poc.test.js`.

### Example 1 — integrity in the main realm, confinement in the worker

```html
<!doctype html>
<script type="importmap">
{ "imports": {
    "@awacloud/fw":  "/packages/front/fw/src/main.js",
    "@awacloud/fw/": "/packages/front/fw/src/"
}}
</script>
<script type="module">
import { lockdown } from '@awacloud/fw/sanity/lockdown.js';
lockdown();                                   // integrity — this realm

import fw from '@awacloud/fw';
import modules from '@awacloud/fw/core/modules.js';
fw.runtime.registerAll(modules);

// Confinement setup: runs inside the worker, before user code.
const confinedWorkerFw = function (runtime, moduleNames, args) {
    const revoke = (name) => {
        let o = globalThis;
        while (o) {
            if (Object.prototype.hasOwnProperty.call(o, name)) { delete o[name]; return; }
            o = Object.getPrototypeOf(o);
        }
    };
    ['fetch', 'WebSocket', 'Worker', 'BroadcastChannel', 'XMLHttpRequest'].forEach(revoke);
    const libs = runtime.resolveAll(moduleNames);
    return { libs, args };
};

const worker = fw.createWorker(function (ctx) {
    // Self-contained: stringified into the worker program.
    const words = ctx.libs.sha256.hash(ctx.args[0]);      // bitArray (32-bit words)
    const bytes = new Uint8Array(words.length * 4);
    for (let i = 0; i < words.length; i++) {
        bytes[i * 4]     = (words[i] >>> 24) & 0xff;
        bytes[i * 4 + 1] = (words[i] >>> 16) & 0xff;
        bytes[i * 4 + 2] = (words[i] >>> 8)  & 0xff;
        bytes[i * 4 + 3] =  words[i]         & 0xff;
    }
    self.postMessage({
        hasFetch:      typeof fetch !== 'undefined',
        hasWebSocket:  typeof WebSocket !== 'undefined',
        hasNonGranted: typeof ctx.libs.signal !== 'undefined',
        libs:          Object.keys(ctx.libs),
        digest:        ctx.libs.hex.fromBytes(bytes),
    });
}, { dependencies: ['sha256', 'hex'], workerFw: confinedWorkerFw, args: ['abc'] });

worker.onmessage = (e) => { console.log(e.data); worker.terminate(); };
</script>
```

Observed console output (Chrome, page served from the fw package root):

```
{ hasFetch: false,
  hasWebSocket: false,
  hasNonGranted: false,
  libs: ['sha256', 'hex'],
  digest: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' }
```

Read that line by line: the network authorities are gone; `signal` — registered
on the parent runtime, absent from the grant — is unreachable; `libs` holds
exactly the grant, not the serialized transitive graph; and the granted
computation is correct (`sha256('abc')`).

> **Import-map spelling.** In a raw import map the subpath needs its `.js`
> extension — `@awacloud/fw/sanity/lockdown.js`. The extensionless
> `@awacloud/fw/sanity/lockdown` spelling used elsewhere in these docs is the
> package **exports-map** form: bundlers and Node resolve it, a browser import
> map does not, and it 404s. Measured.

### Example 2 — freezing the worker's own intrinsics

Same setup; only `workerFn` changes. The lockdown module URL is computed on the
main thread and handed over through `args`.

```js
const worker = fw.createWorker(function (ctx) {
    import(ctx.args[0]).then(function (mod) {
        mod.lockdown();                              // integrity — the WORKER realm

        let escapeOpen = true;
        try { ({}).constructor.constructor('return 1'); } catch (e) { escapeOpen = false; }

        self.postMessage({
            hasFetch:          typeof fetch !== 'undefined',
            escapeClosed:      escapeOpen === false,
            objectProtoFrozen: Object.isFrozen(Object.prototype),
            digest:            ctx.libs.hex.fromBytes(new Uint8Array([0xba, 0x77])),
        });
    }).catch(function (e) {
        self.postMessage({ importError: String((e && e.message) || e) });
    });
}, {
    dependencies: ['hex'],
    workerFw: confinedWorkerFw,
    args: [new URL('/packages/front/fw/src/sanity/lockdown.js', location.href).href],
});
```

Observed output (Chrome):

```
{ hasFetch: false, escapeClosed: true, objectProtoFrozen: true, digest: 'ba77' }
```

The `bun test` equivalent — same shape, the module resolved by absolute
`file://` URL through `args` — is the ninth test of
`src/core/worker-confinement.poc.test.js` and asserts the same four facts.

Note the shape this forces on you: `lockdown()` lands on a later microtask, so
**all** worker logic has to live inside the `.then()` callback. Anything you run
before it runs unhardened.

## Limits (honest)

- **Async only.** Every call in or out goes through `postMessage` and
  structured-clone. There is no synchronous route to a worker result — a
  fundamental property of the Web Worker API, not an fw limitation.
- **Per-worker cost.** Each `createWorker` allocates a thread (~1–10 ms).
  For recurring tasks use the `workerPool` module rather than spawning per call.
- **Dynamic `import()` residual.** It cannot be revoked and is available in the
  `blob:` worker. In a browser it is network-capable; close it with a CSP.
- **No SES `Compartment`.** This is a true engine boundary, not a virtualised
  one — stronger isolation, but async-only and costly. See
  [`sanity/lockdown` § Comparison to SES](../api/sanity/lockdown.md#comparison-to-ses-honest).
- **`lockdown()` before `new Worker()` breaks under Bun.** Measured on Bun
  1.3.13: freezing the parent realm's intrinsics and *then* calling
  `createWorker` throws
  `TypeError: undefined is not an object (evaluating 'FunctionPrototypeCall')`
  from `internal:primordials`, because Bun initialises those internals lazily,
  after the freeze. Chrome is unaffected (its `Worker` constructor is native).
  Under Bun, spawn the workers you need before locking down the parent realm, or
  keep the parent lockdown to browser deployments.
- **The DOM step never runs in a worker.** `lockdown()`'s step 6 is gated on
  `window` + `document` (`sanity/lockdown.js:383`), so a worker realm gets the
  intrinsic tier only — which is all a worker realm has to harden anyway.

## See also

- [`sanity/lockdown` — API reference](../api/sanity/lockdown.md) — the integrity tier, step by step, and the SES comparison
- [Security guide](./security.md) — the tier spectrum, the recommended default, integrity vs confinement
- [Web Workers guide](./workers.md) — `createWorker`, serialisation, the RPC pattern
- [`core/worker-helper` — API reference](../api/core/worker-helper.md) — `WorkerOptions`, `workerFw`, the patched `terminate`
- [Worker confinement spike (2026-06-15)](../notes/worker-confinement-spike.md) — the historical investigation this guide supersedes for guidance
- `src/core/worker-confinement.poc.test.js` — the regression suite backing every claim above
