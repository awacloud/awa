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
// Returns: { isSupported, set, setRich, get, share }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `isSupported` | `() => { read: boolean, write: boolean, richWrite: boolean, share: boolean }` | Available capabilities (computed at init) |
| `set` | `(text: string) => Promise<void>` | Copies text to the clipboard |
| `setRich` | `({ html: string \| Promise<string>, text: string \| Promise<string> }) => Promise<void>` | Copies one item with a `text/html` and a `text/plain` flavour |
| `get` | `() => Promise<string>` | Reads the text content of the clipboard |
| `share` | `(opts?: { title?, text?, url?, files? }) => Promise<void>` | Invokes the native share sheet |

### `clipboard.isSupported() → { read, write, richWrite, share }`

```js
const caps = clipboard.isSupported();
// → { read: boolean, write: boolean, richWrite: boolean, share: boolean }
```

Checked once at factory initialisation — no per-call overhead. `richWrite` is
true when `navigator.clipboard.write` is a function and `ClipboardItem` is a
constructor.

---

### `clipboard.set(text) → Promise<void>`

Copies text to the clipboard.

```js
await clipboard.set('Text to copy');
```

Requires a secure context (HTTPS or `localhost`). May require a user gesture.

---

### `clipboard.setRich({ html, text }) → Promise<void>`

Copies ONE clipboard item carrying a `text/html` and a `text/plain` flavour:
a paste into a word processor keeps the formatting, a plain-text target gets
the text. `html` and `text` are each a string or a `Promise<string>`.

```js
await clipboard.setRich({ html: '<p><b>Total</b>: 42</p>', text: 'Total: 42' });
```

- **Gesture rule.** The item is built and `navigator.clipboard.write` is
  called synchronously, inside the caller's user gesture, with the values
  still pending. WebKit refuses a write whose item is created after an
  `await`, so pass a slow conversion as a promise — never `await` it before
  calling `setRich`. Chromium accepts promised values too.
- **No implicit fallback.** When `isSupported().richWrite` is false, the call
  rejects with an `Error` whose message starts `clipboard: rich write
  unsupported`. Check the flag first and fall back to `set(text)` yourself.
- **Not sanitized.** The HTML is written as given. It is the caller's, and
  must be sanitized before it reaches the clipboard.
- The returned promise rejects when either value rejects or when the browser
  refuses the write.

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

### "Copy with formatting" from a conversion started on click

```js
const clipboard = runtime.resolve('clipboard');
const events    = runtime.resolve('events');

events.on('copyRich', copyRichBtn, 'click', () => {
    // Start the slow work, but do NOT await it before the write:
    // setRich must run inside the click's user gesture.
    const md   = convertToMarkdown(doc);           // Promise<string>
    const html = md.then(renderSanitizedHtml);     // Promise<string>, sanitized by the caller

    const done = clipboard.isSupported().richWrite
        ? clipboard.setRich({ html, text: md })
        : md.then((text) => clipboard.set(text));  // plain-text fallback, the caller's choice

    done.then(
        () => { copyRichBtn.textContent = 'Copied!'; },
        () => { copyRichBtn.textContent = 'Copy failed'; },
    );
});
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
