---
module: secPolicy
category: dom/rendering
dependencies: []
returns: object
worker-safe: true
status: complete
---

# secPolicy

> Low-level security primitives shared by the entire rendering pipeline — URL safety, DOM-clobbering, `on*` attributes, blocked tags, dangerous CSS. **Single source of truth**: the policy lives here, other modules consume it.

**Module** `secPolicy` | **Source** `packages/front/fw/src/dom/rendering/secPolicy.js` | **Deps** none | **Worker-safe** yes

Before `secPolicy`, the safe-URL check (`_isSafeUrl`), the URL-bearing attribute list, the DOM-clobber name list, and the `on*` regex were duplicated in `template.js` (DOM path), `render.js` (SSR path), and partially re-implemented in `sanitize.js`. `secPolicy` centralises them. All framework consumers inject the module and read the constants / call the functions instead of inlining.

## Resolve

```js
const sp = runtime.resolve('secPolicy');
```

The returned object exposes **constants** (Sets, RegExp) and **pure functions** (testers / classifiers). No state, no mutating methods.

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `isSafeUrl` | `(url, schemes?, allowDataImage?) => boolean` | URL acceptable on a URL-bearing attribute |
| `isClobberValue` | `(attrName, value) => boolean` | Pair `(id\|name, value)` is a DOM clobbering vector |
| `isEventAttr` | `(name) => boolean` | Name is an `on*` event handler |
| `isSafeAttrName` | `(name) => boolean` | Name is shape-conformant AND not `on*` |
| `isBlockedTag` | `(name) => boolean` | Tag rejected at parse-time |
| `isSafeCss` | `(prop, val) => boolean` | `style.setProperty` call is acceptable |
| `URL_ATTRS` | `Set<string>` | URL-bearing attributes |
| `SCHEME_DANGEROUS_RE` | `RegExp` | Refused schemes |
| `SAFE_SCHEMES` | `Set<string>` | Default allowed schemes |
| `DATA_IMAGE_RE` | `RegExp` | Accepted `data:image/*` MIMEs |
| `CLOBBER_ATTRS` | `Set<string>` | Clobberable attributes (`id`, `name`) |
| `CLOBBER_NAMES` | `Set<string>` | Values that shadow `document.*` props |
| `EVENT_ATTR_RE` | `RegExp` | Matches `on*` (case-insensitive) |
| `SAFE_ATTR_NAME_RE` | `RegExp` | Accepts a name that starts with a letter |
| `BLOCKED_TAGS_RE` | `RegExp` | Blocked tags (`script`, `object`, `embed`, `iframe`) |
| `CSS_DANGEROUS_RE` | `RegExp` | Detects `expression(...)` and `url(javascript:)` etc. |
| `CSS_BLOCKED_PROPS` | `Set<string>` | Properties blocked by name |

### URL safety

| Symbol | Type | Description |
|---|---|---|
| `URL_ATTRS` | `Set<string>` | URL-bearing attributes: `href`, `src`, `action`, `formaction`, `srcset`, `xlink:href`, `data`, `codebase` |
| `SCHEME_DANGEROUS_RE` | `RegExp` | Categorically refused schemes: `javascript:`, `vbscript:`, `file:`, `jar:`, `data:text`, `data:application` |
| `SAFE_SCHEMES` | `Set<string>` | Default allowed schemes: `http`, `https`, `mailto`, `tel`, `ftp` |
| `DATA_IMAGE_RE` | `RegExp` | Accepted `data:image/*` MIMEs when `allowDataImage=true` |
| `isSafeUrl(url, schemes?, allowDataImage?)` | function | Decides whether `url` can be set on a URL-bearing attribute |

`isSafeUrl` applies in order:
1. Non-string → unsafe
2. Empty (after stripping control chars) → safe
3. Starts with `#`, `/`, `?`, `.` → safe (anchor / relative)
4. Matches `SCHEME_DANGEROUS_RE` → unsafe
5. `data:` → safe **only** if `allowDataImage` AND matches `DATA_IMAGE_RE`
6. No `:` → safe (relative)
7. `:` after a `/` → safe (path containing `:`)
8. Scheme in `schemes` (or `SAFE_SCHEMES` by default)

Spaces and ASCII control characters are stripped before any comparison — neutralises obfuscation such as `JAVA\tSCRIPT:`.

### DOM clobbering

| Symbol | Type | Description |
|---|---|---|
| `CLOBBER_ATTRS` | `Set<string>` | Attributes whose value can clobber: `id`, `name` |
| `CLOBBER_NAMES` | `Set<string>` | ~30 values that shadow native `document.*` props (`cookie`, `domain`, `body`, `forms`, …) |
| `isClobberValue(attrName, value)` | function | `true` if the pair is a known DOM clobbering vector |

### Attribute shape

| Symbol | Type | Description |
|---|---|---|
| `EVENT_ATTR_RE` | `RegExp` | Matches `on*` (case-insensitive) |
| `SAFE_ATTR_NAME_RE` | `RegExp` | Accepts a name that starts with a letter |
| `isEventAttr(name)` | function | `true` if `name` is an `on*` event handler |
| `isSafeAttrName(name)` | function | `true` if `name` is shape-conformant AND not an `on*` |

### Blocked tags

| Symbol | Type | Description |
|---|---|---|
| `BLOCKED_TAGS_RE` | `RegExp` | `^(script\|object\|embed\|iframe)$` |
| `isBlockedTag(name)` | function | `true` if tag is rejected at parse-time |

### CSS safety

| Symbol | Type | Description |
|---|---|---|
| `CSS_DANGEROUS_RE` | `RegExp` | Detects `expression(...)` and `url(javascript:)` / `url(vbscript:)` / `url(data:text)` / `url(data:application)` |
| `CSS_BLOCKED_PROPS` | `Set<string>` | Properties whose **name** is dangerous: `behavior`, `-ms-behavior` |
| `isSafeCss(prop, val)` | function | `true` if the `style.setProperty(prop, val)` call is acceptable |

## Examples

```js
const sp = runtime.resolve('secPolicy');

// URL
sp.isSafeUrl('https://example.com');        // → true
sp.isSafeUrl('javascript:alert(1)');         // → false
sp.isSafeUrl('JAVA\tSCRIPT:alert(1)');       // → false (obfuscation neutralised)
sp.isSafeUrl('/foo/bar');                    // → true (relative)
sp.isSafeUrl('data:image/png;base64,…');     // → true (image, allowed by default)
sp.isSafeUrl('data:text/html,…');            // → false
sp.isSafeUrl('intent:#Intent;');             // → false (unknown scheme)

// Custom restrictions
sp.isSafeUrl('mailto:a@b.com', ['http', 'https']); // → false
sp.isSafeUrl('data:image/png;…', undefined, false); // → false

// Clobbering
sp.isClobberValue('id', 'cookie');           // → true
sp.isClobberValue('class', 'cookie');        // → false (class is not clobberable)

// Attributes
sp.isEventAttr('onclick');                   // → true
sp.isEventAttr('Onclick');                   // → true
sp.isSafeAttrName('data-foo');               // → true
sp.isSafeAttrName('1-bad');                  // → false (does not start with a letter)

// Tags
sp.isBlockedTag('script');                   // → true
sp.isBlockedTag('div');                      // → false

// CSS
sp.isSafeCss('color', 'red');                // → true
sp.isSafeCss('background', 'url(javascript:alert(1))'); // → false
sp.isSafeCss('behavior', 'whatever');        // → false
```

## Worker Usage

Pure module with no DOM or timers — usable as-is in a Worker via `dependencies: ['secPolicy']`.

## Notes

- **Internal consumers**: [`template`](./template.md) (DOM render), [`render`](./render.md) (SSR), [`parser`](./parser.md) (parse-time), [`sanitize`](./sanitize.md), [`dom`](../query/dom.md) (`isSafeCss` in `styleApply`).
- **Policy evolution**: update the constant or test in `secPolicy.js`, add a test — all internal consumers inherit the change automatically.
- **SSR back-end mirror**: `packages/back/shared/src/ssr/{parser,render}.ts` carry inline copies (self-contained, no fw runtime dependency) — update them explicitly.
- The module is stateless and has no mutating methods: all functions are pure.

## See also

- [Framework security](../../../guide/security.md) — threat model overview and defences
- [Rendering pipeline](../../../guide/rendering-pipeline.md) — where the security policy is applied
- SSR back-end port: `packages/back/shared/src/ssr/{parser,render}.ts` (self-contained, secPolicy mirror)
