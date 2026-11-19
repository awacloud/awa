---
module: pageflip/create
category: pageflip
name: createPageflip
type: helper
dependencies: [helpers/shared-runtime, pageflip/pageflip]
returns: "PageflipHandle { instance, dispose }"
worker-safe: false
status: complete
---

# pageflip/create — `createPageflip`

> Build a page-turn book and mount it into an element without wiring the descriptor by hand.

**Module** `graphic.pageflip/create` | **Type** constructible helper (not a module descriptor, not a `graphicModules` member) | **Source** `packages/front/graphic/anim/src/pageflip/create.js` | **Deps** the shared helper runtime, `graphic.pageflip` | **Worker-safe** no

## Descriptor

There is no descriptor. `createPageflip(el, opts)` acquires the shared runtime
(`registerDeep` of the `graphic.pageflip` descriptor and its whole `deps`
closure), resolves `graphic.pageflip`, constructs a `Pageflip` from `opts` and
mounts it into `el`. It composes the module; it re-implements nothing and
touches no descriptor.

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `createPageflip` | `(el: Element, opts: PageflipOptions) => PageflipHandle` | Build the book, mount it, return the handle. |

`PageflipHandle`:

| Member | Meaning |
|--------|---------|
| `instance` | The live `Pageflip` with its full public API (`next`, `previous`, `goTo`, `currentId`, `index`, `pageCount`, `el`, …). |
| `dispose()` | Idempotent teardown: disposes the instance (stops in-flight turns, detaches the subtree), then releases this handle's share of the shared runtime. |

`opts` is forwarded **verbatim** to the `Pageflip` constructor: every option keeps
its meaning and default (see [pageflip/pageflip](./pageflip.md#options-pageflipoptions)),
including `scheduler`. The helper adds no option.

## Examples

```js
const book = createPageflip(document.querySelector('#stage'), {
    pages: [{ id: 'p1' }, { id: 'p2' }],
    width: 400, height: 560, duration: 500,
});
book.instance.next();
book.dispose();
```

## Notes

- **Throws**: `createPageflip: el must be an element` when `el` is absent or has
  no `replaceChildren`; plus every `Pageflip` constructor error (empty `pages`,
  non-positive `width` or `height`), propagated unchanged. On a constructor
  failure the helper releases its runtime share first, so a failed call leaks
  nothing.
- Mounting uses `Pageflip#mountInto(el)`: the book's `<svg>` becomes the **sole**
  child of `el` (`replaceChildren`).
- The runtime is shared across calls and with `createHypertree`, so one
  `graphic.scheduler` serves all of them; the default id prefix comes from a
  counter inside the resolved factory, so books from the same runtime get
  distinct ids. An explicit `opts.prefix` wins.
- The runtime is reference-counted: the last `dispose()` releases it.
- Not Worker-safe (element-anchored); the pure kernels it composes stay
  Worker-safe.
- `opts` is the full `PageflipOptions` of the pageflip page (the typedef is
  imported from `src/pageflip/pageflip.js`).

## See also

- [pageflip/pageflip](./pageflip.md) — the module and its options
- [helpers/shared-runtime](../helpers/shared-runtime.md) — the shared runtime
- [main](../main.md) — the public entry that exports the helper
- [pageflip guide](../../pageflip.md) — the long form
