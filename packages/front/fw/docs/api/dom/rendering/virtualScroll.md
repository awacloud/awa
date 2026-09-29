---
module: virtualScroll
category: dom/rendering
dependencies: [dom, events]
returns: object
worker-safe: false
status: complete
---

# virtualScroll

> Virtualised list — renders only visible items for 10⁴–10⁶ entries.

**Module** `virtualScroll` | **Source** `packages/front/fw/src/dom/rendering/virtualScroll.js` | **Deps** `dom`, `events` | **Worker-safe** no

Virtualises the rendering of a long list: only items within the visible window plus a configurable overscan are materialised in the DOM. The rest is represented by a CSS spacer of calculated height, avoiding any memory cost for off-screen nodes.

Two height-calculation modes:

- **`fixed`** (MVP, default): constant `itemHeight` → range calculated in O(1), no DOM measurements.
- **`variable`**: heights measured after insertion, cached in `Map<idx, height>`; `setTotal` invalidates the cache beyond the new index.

## Resolve

```js
const virtualScroll = runtime.resolve('virtualScroll');
// Returns: { create }
const list = virtualScroll.create({ container, itemHeight, total, renderItem });
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `create` | `(opts) => Instance` | Virtualised list instance |
| `refresh` | `() => void` | Re-renders the visible range |
| `setTotal` | `(n: number) => void` | Updates total + refresh |
| `scrollTo` | `(idx: number, opts?: ScrollOpts) => void` | Programmatic scroll |
| `visibleRange` | `() => {start: number, end: number}` | Current visible indices |
| `measure` | `(idx: number) => number` | Measured height (variable mode) |
| `dispose` | `() => void` | Cleans up listeners + DOM |

### `create` options

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `container` | `Element` | — | Scrollable element (overflow: auto). |
| `itemHeight` | `number` | — | Item height in px. |
| `total` | `number` | — | Total number of items. |
| `renderItem` | `(idx: number) => HTMLElement \| ElmNode[]` | — | Creates a DOM item. |
| `overscan` | `number` | `3` | Extra items above/below. |
| `mode` | `'fixed' \| 'variable'` | `'fixed'` | Height-calculation mode. |

### `scrollTo` options

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `align` | `'start' \| 'center' \| 'end' \| 'auto'` | `'start'` | Target alignment in the viewport. |

## Examples

### Simple list (fixed mode)

```js
const virtualScroll = runtime.resolve('virtualScroll');

const list = virtualScroll.create({
    container: document.getElementById('list'),
    itemHeight: 32,
    total: 50000,
    renderItem(idx) {
        const li = document.createElement('li');
        li.textContent = `Item ${idx}`;
        return li;
    }
});

// Go to item 10000
list.scrollTo(10000);

// Update after loading additional data
list.setTotal(75000);

// Cleanup
list.dispose();
```

### Variable mode (measured heights)

```js
const list = virtualScroll.create({
    container: document.getElementById('feed'),
    itemHeight: 60,   // default height before measurement
    total: 1000,
    renderItem(idx) {
        const card = document.createElement('article');
        card.className = 'card';
        card.textContent = data[idx].body;
        return card;
    },
    mode: 'variable'
});

// Measured height after rendering
console.log(list.measure(5)); // actual px of item 5
```

### Scroll with centred alignment

```js
list.scrollTo(500, { align: 'center' });
```

## Notes

- In `fixed` mode, range calculation is O(1) — optimal for homogeneous long lists (TTY scrollback, task manager).
- In `variable` mode, `getBoundingClientRect()` is called after insertion into the layer; happy-dom does not return real layout, so heights stay at the default in tests.
- `renderItem` may return an `HTMLElement` or an elm-array (array of elm nodes) — the bridge uses `dom.create` if available, with fallback to the first node of the array.
- `dispose` removes the spacer and the layer from the container and removes the scroll listener; a second call is a no-op.
- The scroll listener is registered in `passive` mode to avoid blocking the main thread.

## See also

- [template](./template.md) — materialises elm-arrays into DOM
- [uiSession](./uiSession.md) — high-level facade parse+render+template+dom
- [dom](../query/dom.md) — consistent DOM API
