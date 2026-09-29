---
module: clipboard
category: dom/utils
dependencies: []
returns: object
worker-safe: false
status: complete
---

# clipboard

> System clipboard access and Web Share API — read, write, and native sharing.

**Module** `clipboard` | **Source** `packages/front/fw/src/dom/utils/clipboard.js` | **Deps** none | **Worker-safe** no

## Resolve

```js
const clipboard = runtime.resolve('clipboard');
// Returns: { isSupported, set, get, share }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `isSupported` | `() => { read: boolean, write: boolean, share: boolean }` | Available capabilities (computed at init) |
| `set` | `(text: string) => Promise<void>` | Copies text to the clipboard |
| `get` | `() => Promise<string>` | Reads the text content of the clipboard |
| `share` | `(opts?: { title?, text?, url?, files? }) => Promise<void>` | Invokes the native share sheet |

### `clipboard.isSupported() → { read, write, share }`

```js
const caps = clipboard.isSupported();
// → { read: boolean, write: boolean, share: boolean }
```

Checked once at factory initialisation — no per-call overhead.

---

### `clipboard.set(text) → Promise<void>`

Copies text to the clipboard.

```js
await clipboard.set('Text to copy');
```

Requires a secure context (HTTPS or `localhost`). May require a user gesture.

---

### `clipboard.get() → Promise<string>`

Reads the text content of the clipboard.

```js
const text = await clipboard.get();
```

Requires the `clipboard-read` permission (granted by the browser via a user prompt).

---

### `clipboard.share(opts?) → Promise<void>`

Invokes the native share sheet of the operating system.

```js
await clipboard.share({
    title: 'My title',
    text:  'Description of what I am sharing',
    url:   'https://example.com',
    files: [file]  // File[] — variable support depending on platform
});
```

At least one of `url`, `text`, or `title` must be present.

Returns a native Promise — rejected if the user cancels or the share fails.

## Examples

### "Copy link" button

```js
const clipboard = runtime.resolve('clipboard');
const events    = runtime.resolve('events');

const caps = clipboard.isSupported();

if (caps.write) {
    events.on('copyBtn', copyBtn, 'click', async () => {
        await clipboard.set(window.location.href);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy link'; }, 2000);
    });
} else {
    copyBtn.style.display = 'none';
}
```

### Native share button with copy fallback

```js
const clipboard = runtime.resolve('clipboard');

async function share(title, url) {
    const caps = clipboard.isSupported();

    if (caps.share) {
        await clipboard.share({ title, url });
    } else if (caps.write) {
        await clipboard.set(url);
        alert('Link copied to clipboard');
    } else {
        prompt('Copy this link:', url);
    }
}
```

### Paste from clipboard

```js
events.on('pasteBtn', pasteBtn, 'click', async () => {
    try {
        const text = await clipboard.get();
        inputField.value = text;
    } catch (err) {
        console.error('Read permission denied');
    }
});
```

## Notes

- All APIs require a secure context (HTTPS or `localhost`).
- The Clipboard API returns native Promises — no wrapper.
- `share()` is primarily useful on mobile (iOS, Android); on desktop, behaviour varies.

## See also

- [download](../fs/download.md) — export data as a file
- [events](../query/events.md)
