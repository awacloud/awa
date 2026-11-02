---
module: fileIntake
category: dom/fs
dependencies: []
returns: object
worker-safe: false
status: complete
---

# fileIntake

> File intake: picker, OS file drop and a keyboard-operable dropzone, one callback.

**Module** `fileIntake` | **Source** `packages/front/fw/src/dom/fs/fileIntake.js` | **Deps** none | **Worker-safe** no

## Resolve

```js
const fileIntake = runtime.resolve('fileIntake');
// Returns: { create }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `(opts: FileIntakeOptions) => FileIntakeInstance` | Wire a picker, a drop target and a dropzone to one `onFiles` callback |

### `create(opts)` options

| Option | Type | Required | Meaning |
|--------|------|----------|---------|
| `input` | `HTMLInputElement` | yes | The `type="file"` picker; its `change` event is read |
| `onFiles` | `(files: File[], source: 'picker' \| 'drop') => void` | yes | Every file chosen or dropped at once, in order; never called with an empty array |
| `dropTarget` | `EventTarget` | no | Where OS drops are accepted (typically the whole component region); without it there is no drop wiring |
| `zone` | `HTMLElement` | no | The keyboard-operable dropzone; without it there is no keyboard wiring |
| `dragoverAttribute` | `string` | no | Attribute set to `'true'` / `'false'` on `zone` and on `dropTarget` (when it has `setAttribute`) while a file drag is over the target. Default `'data-dragover'` |

`create` throws `TypeError('fileIntake.create: input is required')` when `input` is missing or has no `addEventListener`, and `TypeError('fileIntake.create: onFiles must be a function')` when `onFiles` is not a function.

### Instance

| Method | Signature | Returns |
|--------|-----------|---------|
| `pick` | `() => void` | Opens the file picker (`input.click()`) |
| `focus` | `() => void` | Focuses the zone (no-op without a zone) |
| `dispose` | `() => void` | Removes every listener the instance added and resets a marked drag attribute to `'false'`; `pick` and `focus` are no-ops afterwards |

### Behaviour

- **Picker**: on `change`, the chosen files are collected, the input is reset (`input.value = ''`, so choosing the same file again fires), and `onFiles(files, 'picker')` runs when the list is not empty.
- **Drop** (with `dropTarget`): `dragenter` and `dragover` call `preventDefault` (`dragover` also sets `dropEffect` to `'copy'`), `dragleave` unmarks once the drag has left every nested element, and `drop` calls `onFiles(files, 'drop')` when files were dropped.
- **Keyboard** (with `zone`): Enter and Space call `preventDefault` then open the picker; other keys are untouched. A zone without a `tabindex` attribute gets `tabIndex = 0`; an existing `tabindex` is respected.
- The module sets no `role` and no text: the markup is the caller's.

## Examples

### A dropzone that opens the first file and announces the rest

```js
const { create } = runtime.resolve('fileIntake');

// Markup owned by the page:
// <section id="viewer">
//   <label id="zone" for="file">Drop a document here, or choose one</label>
//   <input id="file" type="file" accept=".pdf,.docx,.md" multiple hidden>
//   <p id="status" role="status"></p>
// </section>
const input = document.getElementById('file');
const zone = document.getElementById('zone');
const region = document.getElementById('viewer');
const status = document.getElementById('status');

const intake = create({
    input,
    zone,
    dropTarget: region,
    onFiles(files, source) {
        openDocument(files[0]);
        if (files.length > 1) {
            status.textContent = `${files.length - 1} more file(s) ignored (${source}).`;
        }
    }
});

// A button elsewhere can open the picker; focus returns to the zone on close.
document.getElementById('open').addEventListener('click', () => intake.pick());

// Style the drag-over state from the attribute:
//   [data-dragover="true"] { outline: 2px dashed currentColor; }

intake.dispose(); // when the component is torn down
```

### Refuse by type in the consumer

```js
create({
    input,
    onFiles(files) {
        const accepted = files.filter((f) => f.type === 'application/pdf');
        if (accepted.length < files.length) reportRefused(files.length - accepted.length);
        accepted.forEach(open);
    }
});
```

## Notes

- Drags that do not carry `Files` (selected text, a link) are ignored entirely: no `preventDefault`, no attribute, so the browser keeps its native behaviour.
- A depth counter pairs `dragenter` with `dragleave`, so entering and leaving nested children does not flicker the drag attribute; it returns to `'false'` only when the drag has left the target.
- The module never reads a file, never filters by type or size and never creates an element: `accept` and `multiple` stay attributes of the caller's input, and refusal is the consumer's decision.
- The picker is the alternative to dragging (WCAG 2.2, 2.5.7 Dragging Movements); the keyboard wiring makes the zone operable without a pointer.
- Element drag-and-drop is [dnd](../query/dnd.md) and the File System Access API is [fsAccess](./fsAccess.md); this module covers the legacy File API (`<input type="file">` and `dataTransfer.files`), which works in every browser.

## See also

- [fsAccess](./fsAccess.md) — File System Access API and OPFS (handles, pickers)
- [dnd](../query/dnd.md) — pointer-based element drag-and-drop
- [download](./download.md) — file export without a picker
