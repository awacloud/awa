---
module: dnd
category: dom/query
dependencies: []
returns: object
worker-safe: false
status: complete
---

# dnd

> Internal SDE Drag & Drop over Pointer Events — no native HTML5 API.

**Module** `dnd` | **Source** `packages/front/fw/src/dom/query/dnd.js` | **Deps** none | **Worker-safe** no

Implements drag & drop between SDE windows, lists, and tabs entirely via Pointer Events (W3C) with `setPointerCapture`. Does not use the HTML5 DnD API (incompatible with sanity/Pointer Events). The preview is positioned as `fixed` with `pointer-events: none` and disappears with a short configurable animation.

Out of scope: file drag from the OS (use `fsAccess` + `pickFile`).

## Resolve

```js
const dnd = runtime.resolve('dnd');
// Returns: { draggable, dropTarget, active }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `draggable` | `(el: Element, opts: DraggableOpts) => DraggableHandle` | Drag controls |
| `dropTarget` | `(el: Element, opts: DropTargetOpts) => DropHandle` | Drop zone control |
| `active` | `() => ActiveDrag \| null` | Current drag context |

### `dnd.draggable(el, opts)`

Makes `el` draggable via Pointer Events. The drag only starts after the pointer has moved `threshold` px (avoids accidental drags on a click).

#### `DraggableOpts` options

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `data` | `() => any` | — | **Required.** Serialisable drag data, called at start. |
| `preview` | `(data) => HTMLElement` | clone of `el` at opacity 0.6 | Visual element following the pointer. |
| `handle` | `string \| Element` | `el` | Selector or element — drag only starts from this sub-element. |
| `axis` | `'x' \| 'y' \| 'both'` | `'both'` | Axis constraint. |
| `threshold` | `number` (px) | `5` | Distance before the drag is recognised. |
| `cancelMs` | `number` (ms) | `150` | Duration of the preview fade-out animation. |
| `onStart` | `Function` | — | `({ data, x, y }) => void` — at start. |
| `onMove` | `Function` | — | `({ data, x, y }) => void` — on each pointermove. |
| `onEnd` | `Function` | — | `({ data, x, y, cancelled: boolean }) => void` — on pointerup or cancel. |
| `onError` | `Function` | — | `(err) => void` — if `opts.data()` throws (drag silently cancelled). |

Returns `{ disable, enable, dispose }`.

### `dnd.dropTarget(el, opts)`

Registers `el` as a drop zone.

#### `DropTargetOpts` options

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `accept` | `(data) => boolean` | — | **Required.** Filters accepted drags. |
| `onDrop` | `(data, { x, y, target }) => void` | — | **Required.** Called on `pointerup` if the zone accepts. |
| `hoverClass` | `string` | — | CSS class added to `el` while an accepted drag hovers over it. |
| `onEnter` | `Function` | — | `(data) => void` — when the drag enters the zone. |
| `onOver` | `Function` | — | `(data, { x, y }) => void` — while hovering. |
| `onLeave` | `Function` | — | `(data) => void` — when the drag leaves the zone. |

Returns `{ dispose }`.

### `dnd.active()`

Returns `null` if no drag is in progress, otherwise:

```js
{ data: any, preview: HTMLElement, source: Element, x: number, y: number }
```

## Examples

### Moving a list item

```js
const dnd = runtime.resolve('dnd');

const item = document.querySelector('.list-item');
const bin  = document.querySelector('.drop-zone');

dnd.draggable(item, {
    data: () => ({ id: item.dataset.id }),
    onStart: ({ data }) => console.log('drag start', data),
});

dnd.dropTarget(bin, {
    accept:     (d) => typeof d.id === 'string',
    onDrop:     (d, { x, y }) => console.log('dropped', d.id, 'at', x, y),
    hoverClass: 'drop-zone--active',
});
```

### Custom preview

```js
dnd.draggable(card, {
    data: () => ({ title: card.textContent }),
    preview: (data) => {
        const el = document.createElement('div');
        el.className   = 'drag-ghost';
        el.textContent = data.title;
        return el;
    },
});
```

### Drag constrained to the Y axis (reorder a column)

```js
dnd.draggable(row, { data: () => ({ row: row.dataset.index }), axis: 'y' });
```

## Notes

- Only one drag is active at a time (module-scope state). A `pointerdown` during an active drag is ignored.
- **`pointercancel`** is treated as a clean cancellation: `onDrop` does not fire, `onEnd` is called with `cancelled: true`. Required for touch pointer loss (OS gesture, navigation, pointer-lock loss).
- **`dispose()` during a drag**: full state reset + `onEnd({ cancelled: true })`.
- `opts.data()` is wrapped in try/catch — an exception silently cancels the drag and invokes `opts.onError` if provided.
- `dnd:start` and `dnd:end` are emitted via native `dispatchEvent` on `document` to allow observability without a dependency on `eventBus`.
- Hovered zone detection uses `document.elementsFromPoint`; in the absence of this API (test environment without a full DOM), no drop target fires.
- `pointer-events: none` on the preview prevents interference with `elementsFromPoint`.

## See also

- [gesture](./gesture.md) — touch/pointer gestures (tap, swipe, pinch)
- [events](./events.md) — named listeners with lifecycle
- [fsAccess](../fs/fsAccess.md) — file drag from the OS
