# DOM / Query — Selection and events

Modules for querying and manipulating the DOM, managing events, and responding to media queries.

## Modules

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [dnd](./dnd.md) | `object` | none | SDE-internal Drag & Drop via Pointer Events |
| [dom](./dom.md) | `object` | `secPolicy` | Selection, attributes, styles, scroll, focus (CSS filtering via `secPolicy`) |
| [events](./events.md) | `object` | none | Named events with lifecycle management |
| [gesture](./gesture.md) | `object` | `events` | Touch/pointer gestures: tap, swipe, pan, pinch |
| [media](./media.md) | `object` | none | Camera, microphone and screen streams (`getUserMedia`, `getDisplayMedia`), device registry |
| [sound](./sound.md) | `object` | none | Short sound clips in memory: record from a microphone stream, trim / normalize, WAV bytes, play at any rate |

## Common pattern

```js
const dom = runtime.resolve('dom');
const events = runtime.resolve('events');

// Selection + style
const btn = dom.query(container, 'button.submit');
dom.style(btn, 'color', 'red');

// Named event
events.on('btnClick', btn, 'click', (e) => console.log('clicked'));

// Cleanup
events.off('btnClick');
```
