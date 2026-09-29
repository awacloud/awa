---
category: guide
---

# Index by use case

> You know what you want to do — here is where to go. This index complements
> the per-module table of contents (`api/`) and the chronological guides (rendering
> pipeline, security).

## Bootstrap

| You want to… | Read… |
|---|---|
| Start an empty fw app | [`getting-started.md`](./getting-started.md) |
| Build a complete app in 70 LOC | [`tutorial-todo.md`](./tutorial-todo.md) |
| Understand basic security | [`security.md`](./security.md) |
| Understand the factory pattern | [`module-pattern.md`](./module-pattern.md) |
| Create your own module | [`module-creation-workflow.md`](./module-creation-workflow.md) |

## Rendering and templates

| You want to… | API to use |
|---|---|
| Display structured HTML | [`parser` + `template` + `uiSession`](./rendering-pipeline.md) |
| Keyed list with incremental diff | [`ui.list`](../api/dom/rendering/uiSession.md#uilistparentblockid-slotname-options--uilist) |
| Adopt an SSR row without rebuild | [`list.adopt`](../api/dom/rendering/uiSession.md#ssr-adopting-server-side-rendered-rows) |
| Hydrate an SSR page | [`ui.hydrate`](../api/dom/rendering/uiSession.md#uihydrateitems-opts--this) |
| Hydration with recovery on mismatch | `ui.hydrate(items, { onMismatch: 'rebuild' })` |
| Reusable component | [`component`](../api/dom/rendering/component.md) |
| CSS scoped to a component | `component.define({ css: '& { ... }' })` |
| Validate a component's props | `component.define({ props: { x: { type, required, validator } } })` |
| Custom HTML tags | [`template.registerTags`](../api/dom/rendering/template.md#tplregistertagstags-ctxname) |
| Hot-reload tags (dev) | `template.reloadTags`, `template.unregisterTag` |
| Theme tokens (light/dark) | [`themeTokens`](../api/dom/rendering/themeTokens.md) |
| Material/Tailwind preset | `themeTokens.factory().presets.material` |

## Reactivity

| You want to… | API |
|---|---|
| Observable value | `signal.create(v)` |
| Explicit derived value | `signal.derived([a, b], (a, b) => …)` |
| Auto-tracked side effect | `signal.effect(() => …)` |
| Async resource (loading/value/error) | `signal.resource(fetcher)` |
| Async resource derived from signals | `signal.derivedAsync([deps], fetcher)` |
| Multiple `set` in one notify | `signal.batch(() => { a.set(...); b.set(...); })` |
| Read without subscribing | `signal.untrack(() => sig.get())` |
| Bind a signal to the DOM | `ui.bind(sig, blockId, 'text' \| 'class:NAME' \| 'style:PROP' \| 'prop:NAME' \| 'attr-name')` |

## Lists and collections

| You want to… | API |
|---|---|
| Keyed list with delta sync | `list.sync(items)` returns `{added, kept, updated, removed, reordered}` |
| Preset shallow / deep eqFn | `ui.list(..., { eqFn: 'shallow' })` |
| Item enter/leave transitions | `ui.list(..., { onEnter, onLeave })` (Promise-aware) |
| Virtualised list 10⁴+ items | [`virtualScroll`](../api/dom/rendering/virtualScroll.md) + `ui.mount` |

## Routes / navigation

| You want to… | API |
|---|---|
| Hash-based router | [`route`](../api/dom/utils/route.md) |
| Guard before entry | `route.on('x', '/p', fn, { beforeEnter: () => check() })` |
| Nested routes (layouts) | `route.on('child', '/sub', fn, { parent: 'parent-name' })` |
| Cancel navigation | `beforeLeave: () => false` |

## Forms

| You want to… | API |
|---|---|
| Two-way bind input ↔ state | [`form.create`](../api/dom/utils/form.md) + `attach` |
| Sync validators | `fields: { x: { validate: v => v ? null : 'Required' } }` |
| Async validators | `validate: async v => await checkRemote(v)` |
| Repeatable fields | `fields: { emails: { type: 'array', itemValidate } }` + `form.array('emails')` |
| dirty/touched/submitting state | `form.snapshot()` |

## Events and interactions

| You want to… | API |
|---|---|
| Named managed listener | [`events.on(name, el, type, fn)`](../api/dom/query/events.md) |
| Delegation by selector | `events.delegate(root, type, selector, fn)` |
| Bulk cleanup | `events.scope('namespace')` then `.clear()` |
| Auto-cleanup when element leaves DOM | `events.enableAutoCleanup()` |
| Gestures (pan/pinch/tap/longpress) | [`gesture.attach(el)`](../api/dom/query/gesture.md) |
| Native drag & drop | [`dnd.draggable` / `dnd.dropTarget`](../api/dom/query/dnd.md) |
| Keyboard shortcuts | [`keybindings.create`](../api/dom/utils/keybindings.md) |
| Cleanup a shortcut group | `keybindings.scope()` |

## Accessibility

| You want to… | API |
|---|---|
| Announce a message to screen readers | [`a11y.announce(text, 'polite' \| 'assertive')`](../api/dom/utils/a11y.md) |
| Set ARIA attributes in batch | `a11y.aria(el, { label, pressed, expanded })` |
| `aria-labelledby` / `aria-describedby` | `a11y.labelledBy(el, idsOrEls)` |
| Trap focus in a modal | [`focus.trap(el, opts)`](../api/dom/utils/focus.md) |
| Restore focus on close | `focus.pushFocus()` / `focus.popFocus()` |
| Reduced motion? | `a11y.prefersReducedMotion()` |

## Lifecycle and integrations

| You want to… | API |
|---|---|
| Code after a block mounts | `ui.onMount(blockId, fn)` |
| Code before unmount | `ui.onUnmount(blockId, fn)` |
| Adopt an external resource (auto-dispose) | `ui.adopt(blockId, abortController)` |
| Plug in a standalone widget | `ui.mount(blockId, slotName, factory)` |
| Application event bus | [`eventBus.create()`](../api/io/utils/eventBus.md) + `bus.scope()` via `ui.mount` |
| Modal / portal | `ui.portal(name, { to: document.body })` |

## SSR & hydration

| You want to… | API |
|---|---|
| Render server-side (Node/Bun) | `@awacloud/back-shared/ssr` |
| Produce hydratable HTML | `render.toHTML(parsed, data, { hydrate: true, idPrefix })` |
| Adopt the DOM client-side | `ui.hydrate(items, { idPrefix })` |
| Adopt iterate rows | `list.adopt(initialRows, { idPrefix })` |
| Recovery when SSR diverges | `ui.hydrate(..., { onMismatch: 'rebuild' })` |

## Security

| You want to… | API |
|---|---|
| Verify a user URL | [`secPolicy.isSafeUrl(url)`](../api/dom/rendering/secPolicy.md) |
| Verify an id/name value (clobber) | `secPolicy.isClobberValue(attr, value)` |
| Verify a CSS value | `secPolicy.isSafeCss(prop, val)` |
| Sanitise user-supplied HTML | [`sanitize.sanitizeHtml(html)`](../api/dom/rendering/sanitize.md) |
| CSP nonce for injected `<style>` | `template.setNonce(value)` or `csp-nonce` meta |

## Debug & instrumentation

| You want to… | API |
|---|---|
| Snapshot a session's state | [`devtools.inspect(ui)`](../api/dom/rendering/devtools.md) |
| Human-readable ParseResult display | `devtools.dumpTemplate(parsed)` |
| Profile a function | `devtools.profile(fn) → { result, durationMs }` |
| Profile async | `devtools.profileAsync(async fn)` |
| Profile segments | `const t = devtools.timer(); t.mark('a'); t.mark('b'); t.end()` |
| Structured logger | [`errors.factory().logger({ level, prefix, sink })`](../api/io/utils/errors.md) |
| Boundary around a render | `errors.factory().boundary(ui, 'panel', { fallback })` |

## Useful web standards

| You want to… | API |
|---|---|
| UUID v4 / v7 | [`uuid.v4()`](../api/crypto/utils/uuid.md) |
| Secure random | `random.bytes(n)` |
| Monotonic timing | [`clock.monotonic()`](../api/io/timing/clock.md) (`performance.now` is blocked) |
| WebAuthn (passkeys) | [`webauthn`](../api/dom/utils/webauthn.md) |
| WebRTC peer-to-peer | [`webrtc`](../api/dom/net/webrtc.md) |
| Service worker / cache | [`serviceWorker`](../api/dom/sw/serviceWorker.md) |

## See also

- [API index](../api/README.md) — alphabetical per-module table of contents
- [Quick reference](./_QUICK_REF.md) — fw conventions cheatsheet
