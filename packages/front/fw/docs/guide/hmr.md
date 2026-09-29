# Hot module replacement

fw ships **one** hot-reload primitive: `runtime.invalidate()`, which drops
cached instances so the next `resolve()` re-runs a factory. That is the whole of
what the framework provides. Everything else a full HMR experience needs — a
file watcher, a push channel, a client that re-imports changed bytes — is **not
shipped**; this page says exactly where the line is, because the useful part of
a hot-reload story is knowing what it will *not* do at 2am.

## The problem it solves

`runtime.register()` is **descriptor-only**. Re-registering a module (or
`unregister()` then `register()`) swaps the stored definition but never touches
the instance cache, so `resolve()` keeps handing back the object built from the
*old* factory:

```js
runtime.register({ name: 'view', dependencies: [], factory: () => 'old' });
runtime.resolve('view');                                   // 'old'

runtime.register({ name: 'view', dependencies: [], factory: () => 'new' });
runtime.resolve('view');                                   // still 'old'  ← here
```

`invalidate()` is the missing step:

```js
runtime.invalidate('view');
runtime.resolve('view');                                   // 'new'
```

This is not a redesign of the runtime. It evicts entries from the public
`runtime.instances` map; the registry, `resolve()`, `list()` and `snapshot()`
are unchanged.

## Scope: leaf modules

The supported operation is:

> edit a **leaf module** — a view, a template, a presentational component —
> and swap it without a page reload, with signals held in an **unswapped store
> module** surviving.

Nothing wider. General state-preserving replacement of arbitrary modules is not
supported, and preserving DOM-local uncontrolled state (a caret position, a
scroll offset, an unsubmitted `<input>` the swap re-renders) is out of scope.

## `runtime.invalidate(spec, options?)`

```js
const { invalidated, state } = runtime.invalidate('todoView', { cascade: true });
```

| | |
|---|---|
| `spec` | `'name'` (every registered version) or `'name@version'` (exact) |
| `options.cascade` | also invalidate every module declaring the target among its `dependencies`, transitively |
| returns | frozen `{ invalidated, state }` — see [the API page](../api/core/runtime.md#runtimeinvalidatespec-options) |

**Cascade goes to dependents, not dependencies.** A dependent's factory already
ran with the *old* dependency instance captured in its closure, and nothing
would ever hand it the new one — so it has to be rebuilt too. What the target
itself depends on is untouched, which is precisely what lets a store module
survive a view swap.

Version precision follows the same rule `resolve()` uses: a version-less
dependency spec (`'foo'`) cascades only when the invalidated version is the one
`resolve('foo')` would pick; a pinned spec (`'foo@1.0.0'`) cascades only for
that exact version.

**It is atomic.** The never-swap check and every `dehydrate()` call run before
the first cache write, so a refused module or a throwing `dehydrate()` leaves
the cache exactly as it was — a half-applied swap is worse than a rejected one.

## The never-swap set

`ModuleRuntime.NEVER_SWAP` is a frozen, pinned array of module names
`invalidate()` refuses to touch, directly or through a cascade. It contains
**`signal`**.

```js
runtime.invalidate('signal');
// Error: Module "signal" is in the never-swap set and cannot be invalidated
```

`signal`'s effect tracking is **per-factory-instance**. Dropping its cached
instance would leave every already-created signal, derived and effect bound to
the previous factory instance while new reads register against the new one:
effects stop firing, with no error to point at. That is a whole-application
breakage of exactly the class a hot-reload seam must not be able to cause.

The set is pinned rather than configurable: a per-runtime opt-out would make
the guarantee negotiable at the call site, which is where the mistake happens.
Adding a name is a source change, reviewed like any other.

## The `dehydrate()` / `hydrate()` convention

Opt-in, and **a convention rather than a mechanism**: `resolve()` is unchanged
and knows nothing about it. `invalidate()` calls `dehydrate()` on each outgoing
instance that exposes one, and hands the results back keyed by canonical
`name@version`. The caller closes the loop:

```js
const editor = {
    name: 'editor', dependencies: [],
    factory: function () {
        let draft = '';
        return {
            read:      () => draft,
            type:      (s) => { draft = s; },
            dehydrate: () => ({ draft }),          // opt in
            hydrate:   (s) => { draft = s.draft; },
        };
    },
};

// …after the new descriptor has been registered:
const { invalidated, state } = runtime.invalidate('editor', { cascade: true });
for (const key of invalidated) {
    const instance = runtime.resolve(key);
    if (key in state && typeof instance.hydrate === 'function') {
        instance.hydrate(state[key]);
    }
}
```

Keeping the transfer in the caller's hands is deliberate: the state that
crosses a swap is visible, inspectable and skippable, instead of being silently
re-injected by the runtime.

## Limits — read these before relying on any of it

These are structural properties of the design, not gaps waiting for a later
wave.

1. **Factory-closure state is lost.** Invalidating a module is *exactly* what
   re-runs its factory, and re-running the factory is *exactly* what clears its
   closure. A counter, a cache, a subscription list held in factory scope is
   gone. The `dehydrate()`/`hydrate()` convention above is the answer, and it is
   opt-in — a module that does not implement it loses that state, silently and
   by construction. State that must survive belongs in a module that is **not**
   part of the swap.

2. **Handles already handed out are never upgraded.** A caller holding the old
   instance keeps it forever; only *subsequent* `resolve()` calls see the new
   one. Hot swap works for modules that are resolved through the runtime at use
   time, not for ones captured once at startup.

3. **Only the default instance cache is affected.** `{ isolation: true }`
   instances are never cached, so they can never be invalidated (each resolve is
   already fresh). A caller-supplied `{ instances: map }` cache is the caller's
   to clear.

4. **DOM bindings do not all self-heal.** `reactiveBind`'s `text` / `attr` /
   `show` re-resolve their target node on every effect run and survive a
   re-render; `cls` / `style` / `model` capture the element once at bind time
   and keep writing into the detached old node after a swap. See
   [`reactiveBind`](../api/dom/rendering/reactiveBind.md).

## What fw does **not** ship

**There is no watcher and no push channel.** Nothing in fw or in the repo's dev
server detects a file change or tells the browser about it. Driving
`invalidate()` is the host's job today: a dev tool, a devtools action, a console
call.

The transport primitives all exist and none is wired: `fs.watch` and
`Bun.serve`'s websocket support on the host side, fw's own
[`ws`](../api/dom/net/ws.md) / [`sse`](../api/dom/net/sse.md) client modules in
the page, and cache-busted dynamic `import()` to re-fetch changed bytes — the
last of which was measured in a real browser realm (both Chromium and Firefox,
plain and `sanity/base`-hardened, with a control proving the module map really
did cache) and works. Assembling them into a dev-only, flag-gated push channel
is **not delivered here** and belongs to the `tools` side of the toolchain.

Until then, for a full file-watch → reload loop, use a bundler's own HMR — see
[Bundler integration](./integration-bundlers.md).

## See also

- [`ModuleRuntime` API](../api/core/runtime.md) — `invalidate`, `register`,
  `resolve`, `snapshot`
- [`signal`](../api/io/utils/signal.md) — why it is in the never-swap set
- [Bundler integration](./integration-bundlers.md) — the supported
  file-watching path today
- [Module pattern](./module-pattern.md) — where to put state so it survives a
  swap
