---
module: dom
category: dom/query
dependencies: [secPolicy]
returns: object
worker-safe: false
status: complete
---

# dom

> Low-level DOM manipulation: selection, attributes, styles, scroll, text, form values, focus.

**Module** `dom` | **Source** `packages/front/fw/src/dom/query/dom.js` | **Deps** `secPolicy` | **Worker-safe** no

> **CSS security**: `dom.style` rejects dangerous CSS values (`expression(...)`, `url(javascript:...)`) and blocklisted properties (`behavior`, `-ms-behavior`). The shared policy lives in [`secPolicy`](../rendering/secPolicy.md).

## Resolve

```js
const dom = runtime.resolve('dom');
// Returns: object with all the methods below
```

## API

### Selection

| Method | Signature | Description |
|---------|-----------|-------------|
| `query` | `(elm, selector) → Element\|null` | First descendant matching the CSS selector |
| `queryAll` | `(elm, selector) → NodeList` | All matching descendants |

```js
const btn = dom.query(document.body, 'button.submit');
const inputs = dom.queryAll(form, 'input[type="text"]');
```

---

### Attributes

| Method | Signature | Description |
|---------|-----------|-------------|
| `attr` | `(elm, name, value)` | Sets an attribute |
| `attrGet` | `(elm, name) → string\|null` | Reads an attribute |
| `attrRemove` | `(elm, name)` | Removes an attribute |
| `attrHas` | `(elm, name) → boolean` | Checks whether an attribute exists |

```js
dom.attr(link, 'href', 'https://example.com');
dom.attr(input, 'disabled', '');
dom.attrGet(img, 'src');       // → 'https://...'
dom.attrHas(btn, 'disabled');  // → true/false
dom.attrRemove(btn, 'disabled');
```

> **`attr` does not sanitize.** `dom.attr` writes through a raw `setAttribute`:
> no URL filter, no DOM-clobbering check, no event-attribute rejection. Within
> this module only `dom.style` routes through `secPolicy` (`isSafeCss`). For a
> caller-supplied `href` / `src` / `srcdoc` value, either validate it first with
> `secPolicy.isSafeUrl(value)` or go through the `template` / `render` pipeline,
> which applies the shared policy for you.

---

### Data attributes

Keys are in **camelCase** (`'myKey'` ↔ `data-my-key`).

| Method | Signature | Description |
|---------|-----------|-------------|
| `data` | `(target, key, value)` | Sets `data-{key}` |
| `dataGet` | `(elm, key) → string\|null` | Reads `data-{key}` |
| `dataRemove` | `(target, key)` | Removes a data attr |
| `dataHas` | `(elm, key) → boolean` | Checks whether it exists |

```js
dom.data(card, 'id', '42');
dom.dataGet(card, 'id');     // → '42'
dom.dataHas(card, 'flag');   // → false
dom.dataRemove(card, 'id');
```

---

### Classes

| Method | Signature | Description |
|---------|-----------|-------------|
| `classAdd` | `(target, name)` | Adds a class |
| `classRemove` | `(target, name)` | Removes a class |
| `classHas` | `(elm, name) → boolean` | Checks presence |
| `classToggle` | `(target, name) → boolean` | Toggles and returns state |
| `classReplace` | `(target, oldName, newName)` | Replaces `oldName` with `newName` |

```js
dom.classAdd(card, 'active');
dom.classHas(card, 'active');           // → true
dom.classToggle(card, 'highlight');
dom.classReplace(card, 'old', 'new');
dom.classRemove(card, 'active');
```

---

### Styles

| Method | Signature | Description |
|---------|-----------|-------------|
| `style` | `(target, prop, value)` | Sets an inline CSS property (supports `--custom-prop`) |
| `styleGet` | `(elm, prop) → string` | Reads a CSS property (inline or computed) |
| `styleGetAll` | `(elm) → CSSStyleDeclaration` | All computed styles |
| `styleRemove` | `(target, prop)` | Removes an inline property |
| `hide` | `(target)` | `display: none` |
| `show` | `(target, display?)` | Removes `display: none`; `display` optional (default: `''`) |
| `toggleVisibility` | `(target)` | Toggles `display: none` ↔ `''` |

```js
dom.style(el, 'color', 'red');
dom.style(el, '--my-token', '#f33');
dom.styleGet(el, 'color');    // → 'red'
dom.styleRemove(el, 'opacity');
dom.hide(modal);
dom.show(modal, 'flex');
dom.toggleVisibility(modal);
```

---

### Text

| Method | Signature | Description |
|---------|-----------|-------------|
| `text` | `(target, value)` | Sets `textContent` on an element or a list (consistent with `val`/`checked`). `null`/`undefined` → empty string; other values coerced to string. |
| `textGet` | `(elm) → string\|null` | Reads the text content (`textContent`); `null` if the argument is not a `Node`. |

```js
dom.text(h1, 'New title');
dom.text([h1, h2], 'Multi');        // setter on multiple nodes
dom.textGet(p);                      // → 'Paragraph content'
```

---

### Scroll

| Method | Signature | Description |
|---------|-----------|-------------|
| `scrollPos` | `(elm) → {top, left}` | Current scroll position |
| `scrollTo` | `(elm, top, left, behavior?)` | Scrolls to a position |

```js
const pos = dom.scrollPos(container);  // → { top: 120, left: 0 }
dom.scrollTo(container, 0, 0, 'smooth');
```

---

### Dimensions

| Method | Signature | Description |
|---------|-----------|-------------|
| `rect` | `(elm) → DOMRect` | Element bounding rect (`getBoundingClientRect()`) |

```js
const r = dom.rect(el);
// r.top, r.left, r.width, r.height, r.bottom, r.right
```

---

### Forms

| Method | Signature | Description |
|---------|-----------|-------------|
| `val` | `(target, value)` | Sets the value of an input/select/textarea |
| `valGet` | `(elm) → string\|null` | Reads the value |
| `checked` | `(target, bool)` | Checks/unchecks a checkbox or radio |
| `checkedGet` | `(elm) → boolean\|null` | Reads the checked state |
| `disabled` | `(target, bool)` | Enables/disables a field |
| `disabledGet` | `(elm) → boolean\|null` | Reads the disabled state |

```js
dom.val(input, 'Hello');
dom.valGet(input);            // → 'Hello'
dom.checked(checkbox, true);
dom.checkedGet(checkbox);     // → true
dom.disabled(submitBtn, true);
```

---

### Focus

| Method | Signature | Description |
|---------|-----------|-------------|
| `focus` | `(elm)` | Gives focus to the element |
| `blur` | `(elm)` | Removes focus |

```js
dom.focus(inputField);
dom.blur(inputField);
```

---

### Reorder

| Method | Signature | Description |
|---------|-----------|-------------|
| `reorder` | `(parent, orderedChildren)` | Reorders the direct children of `parent` to match the given sequence, with **minimal DOM moves**. Only moves nodes that are already children (no insertion). |

```js
// Alphabetical sort of an existing list
const items = [...list.children];
items.sort((a, b) => a.textContent.localeCompare(b.textContent));
dom.reorder(list, items);
```

Used internally by `uiSession.list` for the reorder phase of the `sync` diff.

> **Minimal-move guarantee**: `reorder` walks the target sequence with a
> cursor over the current children and only calls `insertBefore` (or
> `Element.moveBefore` when the browser supports it) for a child that is
> **not already** in its correct position. A node already at the right spot
> is never touched — an already-ordered list costs zero DOM operations, and
> a node holding keyboard focus (or a text selection, scroll position,
> running CSS transition, `<iframe>`/`<video>` playback state…) is not
> detached unless it is actually moving. `Element.moveBefore` — where
> available — additionally avoids the disconnect/reconnect step for the
> node that *does* move.

## Examples

### Complete form

```js
const dom = runtime.resolve('dom');

const form = dom.query(document.body, '#login-form');
const emailInput = dom.query(form, 'input[name="email"]');
const submitBtn  = dom.query(form, 'button[type="submit"]');

// Read and write
const email = dom.valGet(emailInput);
dom.val(emailInput, email.trim());

// Disable the button
dom.attr(submitBtn, 'disabled', '');
dom.style(submitBtn, 'opacity', '0.5');

// Re-enable
dom.attrRemove(submitBtn, 'disabled');
dom.style(submitBtn, 'opacity', '1');
```

### Usage with uiSession

```js
const ui  = uiSession('app');
const dom = runtime.resolve('dom');

ui.add([{ id: 'card', block: cardBlock, data: { title: 'Test' } }]);

// Access the DOM node via ui.get, manipulate via dom
dom.style(ui.get('card', 'title'), 'fontWeight', 'bold');
dom.attr(ui.get('card', 'link'), 'href', '/detail/1');
```

## See also

- [events](./events.md) — event management
- [uiSession](../rendering/uiSession.md) — `query()` / `queryAll()` use `dom` internally
- [dom (rendering guide)](../../../guide/rendering-pipeline.md)
