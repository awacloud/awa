---
module: sanitize
category: dom/rendering
dependencies: [secPolicy]
returns: object
worker-safe: true
status: complete
---

# sanitize

> Allowlist-based HTML sanitiser — XSS protection for all user-controlled HTML content.

**Module** `sanitize` | **Source** `packages/front/fw/src/dom/rendering/sanitize.js` | **Deps** `secPolicy` | **Worker-safe** yes

> **Policy delegation**: `sanitize.isSafeUrl` is a wrapper over [`secPolicy.isSafeUrl`](./secPolicy.md) — single source of truth for URL security in the framework. `sanitize` adds on top a tags/attrs/schemes allowlist for the specific « user-supplied HTML » use case.

## Resolve

```js
const sanitizer = runtime.resolve('sanitize');
// Returns: { sanitizeHtml, isSafeUrl, defaultAllowlist }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `sanitizeHtml` | `(html: string, opts?: SanitizeOpts) => string` | Cleaned HTML |
| `isSafeUrl` | `(url: string, schemes?: string[], allowDataImage?: boolean) => boolean` | `true` if URL is safe |
| `defaultAllowlist` | `{ tags: Set, attributes: object, urlSchemes: string[] }` | Default allowlist object |

### `SanitizeOpts` options

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `allowedTags` | `Set<string>\|string[]` | default list | Allowed HTML tags |
| `allowedAttributes` | `object` | default list | Map `tag → Set<attr>`, key `'*'` for all tags |
| `urlSchemes` | `string[]` | `['http','https','mailto','tel','ftp']` | Allowed URL schemes |
| `dropDangerousContent` | `boolean` | `true` | Strips the inner content of `<script>`, `<style>`, `<iframe>`, etc. |

## Examples

```js
const s = runtime.resolve('sanitize');

// Default allowlist
s.sanitizeHtml('<p>hello <script>alert(1)</script></p>');
// → '<p>hello </p>'

s.sanitizeHtml('<a href="javascript:alert(1)">link</a>');
// → '<a>link</a>'

s.sanitizeHtml('<a href="https://safe.com">link</a>');
// → '<a href="https://safe.com" rel="noopener noreferrer">link</a>'

// Custom allowlist
s.sanitizeHtml('<custom-tag>x</custom-tag>', {
    allowedTags: ['custom-tag'],
    allowedAttributes: {}
});
// → '<custom-tag>x</custom-tag>'

// URL check
s.isSafeUrl('https://example.com');     // true
s.isSafeUrl('javascript:alert(1)');     // false
s.isSafeUrl('data:image/png;base64,iVBOR==', undefined, true); // true
```

## Worker Usage

```js
// The module has no DOM API dependency — usable directly in a worker.
const worker = fw.createWorker(
    function ({ libs, args }) {
        const s = libs.sanitize;
        const cleaned = s.sanitizeHtml(args[0]);
        self.postMessage(cleaned);
    },
    { dependencies: ['sanitize'], args: ['<p>hi <script>x</script></p>'] }
);
```

## Notes

- Operates on strings only — no DOM API (`document`, `window`) is used. Worker-safe compliant.
- Dangerous tags (`<script>`, `<iframe>`, `<style>`, `<svg>`, `<math>`, etc.) have their entire content stripped (not just the wrapper tag), preventing bypasses via incomplete tags.
- Event handlers (`on*`) and risky attributes (`style`, `srcdoc`, `formaction`) are stripped unconditionally, even if the parent tag is in the allowlist.
- External links (`https://`, `http://`) with `target="_blank"` (or any other named target) automatically receive `rel="noopener noreferrer"`. In-place links (without `target` or `target="_self"`) do **not** receive this `rel` — the `window.opener` relationship only exists for new navigation contexts.
- `javascript:`, `vbscript:`, and `data:text/html` URLs are blocked in `href` and `src`; image data-URIs are only allowed if `allowDataImage: true` is passed to `isSafeUrl`.
- This sanitiser is a defence-in-depth layer suited to Markdown → HTML, docx → HTML pipelines, etc. For stricter requirements (arbitrary HTML from untrusted users), combine with server-side validation.

## See also

- [parser](./parser.md) — HTML → elm-array (structured parsing)
- [render](./render.md) — elm-array transformer (zero DOM)
- [template](./template.md) — DOM engine, safe injection via `innerText`
