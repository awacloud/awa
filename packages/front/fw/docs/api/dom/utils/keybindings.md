---
module: keybindings
category: dom/utils
dependencies: [events, eventBus]
returns: object
worker-safe: false
status: complete
---

# keybindings

> Keyboard shortcut manager: simple bindings, chords, stackable contexts, priority.

**Module** `keybindings` | **Source** `packages/front/fw/src/dom/utils/keybindings.js` | **Deps** `events`, `eventBus` | **Worker-safe** no

The module exposes two elements: `create()` to instantiate a manager, and `parse()` to analyse a combo without creating an instance. Each instance listens on an `EventTarget` (default `document`) and dispatches handlers according to the active contexts.

## Resolve

```js
const keybindings = runtime.resolve('keybindings');
// Returns: { create, parse }

const kb = keybindings.create({ target: document });
kb.attach();
```

## API

### Module

| Method | Signature | Returns |
|---------|-----------|---------|
| `create` | `(opts?) => Instance` | keybindings instance |
| `parse`  | `(combo: string) => Parsed \| Parsed[]` | Combo descriptor(s) |

### Options `create`

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `target` | `EventTarget` | `document` | Keyboard listen target |
| `chordTimeout` | `number` | `1500` | Delay (ms) between chord keystrokes |

### Instance

| Method | Signature | Returns |
|---------|-----------|---------|
| `bind` | `(combo, fn, opts?) => unbind` | Unregister function |
| `unbind` | `(combo, fn?) => void` | — |
| `pushContext` | `(name: string) => void` | — |
| `popContext` | `() => string \| undefined` | Popped context |
| `currentContext` | `() => string[]` | Copy of the stack |
| `list` | `() => Array<{combo, context, priority, fn}>` | Inspection |
| `match` | `(event: KeyboardEvent) => Array<{combo, context, priority, fn}>` | Matching bindings |
| `attach` | `() => void` | Activates listening |
| `detach` | `() => void` | Deactivates listening |
| `dispose` | `() => void` | Cleans up everything |

### Options `bind`

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `context` | `string` | `null` | Context required to trigger |
| `priority` | `number` | `0` | Priority; higher = executed first |
| `preventDefault` | `boolean` | `true` | Calls `event.preventDefault()` |
| `repeat` | `boolean` | `false` | If `false`, ignores `event.repeat === true` |

## parse

### `keybindings.parse(combo)`

Parses a combo and returns a descriptor or an array (chord).

- **Simple**: `parse('Ctrl+Shift+P')` → `{ modifiers: {ctrl, shift, alt, meta}, key: 'p' }`
- **Chord**: `parse('Ctrl+K Ctrl+P')` → `[{...}, {...}]`

**Accepted modifiers** (case-insensitive): `Ctrl`, `Shift`, `Alt`, `Meta`/`Cmd`/`Super`.

**Keys**: `A`–`Z`, `0`–`9`, `F1`–`F12`, `Escape`/`Esc`, `Tab`, `Enter`/`Return`, `Space`, `Backspace`, `Delete`/`Del`, `ArrowUp`/`Up`, `ArrowDown`/`Down`, `ArrowLeft`/`Left`, `ArrowRight`/`Right`, `Home`, `End`, `PageUp`, `PageDown`, `Insert`, `Plus`, `Minus` (or the literal `-`), `Equal` (or the literal `=`).

**Resolution strategy**: `event.code` for alphanumerics (layout-independent, e.g. `KeyA` = physical A key), `event.key` for named keys.

**Punctuation keys** (`Plus`, `Minus`, `Equal`) match on `event.key` — the character the layout produced, numpad included — and ignore the Shift modifier (`+` is Shift+`=` on most layouts); `Shift+Plus` is refused at parse time. `+` itself is the separator: write `Plus`.

Throws `TypeError` if the combo is empty or not a string, `Error` if the syntax is invalid or the key is unknown.

## Examples

### Save shortcut

```js
const keybindings = runtime.resolve('keybindings');
const kb = keybindings.create();
kb.attach();

kb.bind('Ctrl+S', () => document.dispatchEvent(new Event('app:save')));
```

### Command palette (vim-like chord)

```js
kb.bind('Ctrl+K Ctrl+P', () => palette.open(), { priority: 10 });
```

### Modal with contextual Esc

```js
function openModal() {
    kb.pushContext('modal');
    kb.bind('Escape', () => closeModal(), { context: 'modal' });
    modal.showModal();
}

function closeModal() {
    kb.popContext();
    modal.close();
}
```

### Inspection for command palette

```js
// Display all shortcuts available in the current context
const all = kb.list();
console.table(all.map(({ combo, context, priority }) => ({ combo, context, priority })));
```

### Zoom keys

```js
// '+' is Shift+'=' on most layouts and a plain key on the numpad: the bindings
// below fire on all of them. Ctrl+Plus does not match these bindings, so the
// browser's own zoom keeps working.
kb.bind('Plus', zoomIn, { preventDefault: false });
kb.bind('Equal', zoomIn, { preventDefault: false });
kb.bind('Minus', zoomOut, { preventDefault: false });
kb.bind('0', reset, { preventDefault: false });
```

## Notes

- The `event.code` strategy makes alphanumeric shortcuts independent of the keyboard layout (AZERTY/QWERTY). Named keys (`Escape`, `F1`, etc.) use `event.key`.
- Punctuation keys ignore Shift on the event side and refuse it on the binding side: the shifted character is already the key (`+` = Shift+`=`), so `Shift+Plus` and `Shift+=` throw at parse time. Ctrl, Alt and Meta still qualify them (`Ctrl+Plus`).
- Chord: if the first keystroke matches a chord prefix, a `chordTimeout` timer starts. Every chord whose segments so far matched stays a candidate, so chords sharing a prefix (`Ctrl+K Ctrl+A`, `Ctrl+K Ctrl+H`) all complete; each keystroke narrows the set. When chords complete on the same keystroke, the highest `priority` fires (the first registered on a tie), and a completed chord wins over a longer one sharing its prefix. A keystroke that matches no candidate cancels the chord and is processed as a simple binding.
- When a context is active (non-empty stack), only bindings for that context trigger. Bindings without a context are suspended until `popContext()`.
- Each trigger emits `keybindings:matched` on the instance's internal `eventBus` — consumed by the command palette to display active shortcuts.
- `dispose()` detaches listeners and clears bindings, but does not delete references to the instance. Create a fresh instance if needed.

## See also

- [focus](./focus.md) — focus trap, tab order, stash/restore
- [eventBus](../../io/utils/eventBus.md) — application pub/sub (topic `keybindings:matched`)
- [events](../query/events.md) — named DOM event management
