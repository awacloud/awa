---
module: styleSheet
category: dom/rendering
dependencies: []
returns: object
worker-safe: false
status: complete
---

# styleSheet

> Attach CSS text to a document as a style element or a constructable stylesheet.

**Module** `styleSheet` | **Source** `packages/front/fw/src/dom/rendering/styleSheet.js` | **Deps** none | **Worker-safe** no

Owns one job: put this CSS text into that document. Two channels exist: a `<style>` element (mode `'element'`, the default) and a constructable stylesheet appended to `document.adoptedStyleSheets` (mode `'adopted'`), which a CSP `style-src` without `'unsafe-inline'` and without a nonce does not refuse. The consumer chooses the mode; the module never detects a CSP and never retries another channel.

## Resolve

```js
const styleSheet = runtime.resolve('styleSheet');
// Returns: { support, mode, attach }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `support` | `() => { constructable: boolean }` | Whether constructable stylesheets are available right now (evaluated at each call) |
| `mode` | `() => 'element' \| 'adopted'` | Current default mode of this instance |
| `mode` | `(value: 'element' \| 'adopted') => void` | Sets the default mode (later `attach()` calls only); other values throw `TypeError("styleSheet: unknown mode '<value>'")` |
| `attach` | `(css: string, opts?: StyleAttachOptions) => StyleHandle` | Attaches the CSS; non-string `css` throws `TypeError('styleSheet: css must be a string')` |

`StyleAttachOptions`:

| Option | Type | Meaning |
|--------|------|---------|
| `mode` | `'element' \| 'adopted'` | Per-call override of the instance mode |
| `head` | `Element` | Element receiving the `<style>` (default `document.head`); its `ownerDocument` is the target document |
| `id` | `string` | Element mode sets `el.id`; kept on the handle in both modes |
| `attrs` | `Record<string, string>` | Own keys set with `setAttribute` (element mode only) |
| `nonce` | `string` | CSP nonce, `''` means none; `undefined` uses the default read from `<meta name="csp-nonce">` at factory time (element mode only) |

`StyleHandle`:

| Member | Type | Meaning |
|--------|------|---------|
| `mode` | `'element' \| 'adopted' \| 'none'` | Channel that actually ran (`'none'` = inert, no document) |
| `id` | `string \| null` | The `opts.id`, if any |
| `element` | `HTMLStyleElement \| null` | The `<style>` (element mode) |
| `sheet` | `CSSStyleSheet \| null` | The constructed sheet (adopted mode) |
| `set(css)` | `(css: string) => void` | Replaces the text; element mode re-appends a removed element; no-op after `detach()` |
| `detach()` | `() => void` | Removes the style; idempotent |

## Examples

```js
const styleSheet = runtime.resolve('styleSheet');

// Default: a <style> element in document.head.
const h = styleSheet.attach('.card { color: red }', { id: 'card-css' });
h.set('.card { color: blue }');
h.detach();

// Under a CSP `style-src 'self'`: use a constructable stylesheet.
styleSheet.mode('adopted');
const a = styleSheet.attach('.badge { padding: 4px }');
console.log(a.mode); // 'adopted' (or 'element' on a platform without the API)
a.detach();
```

## Notes

- The default mode is `'element'`, so resolving the module changes nothing for an existing page; `'adopted'` is opt-in.
- Choose `'adopted'` when the CSP `style-src` has neither `'unsafe-inline'` nor a nonce: a `<style>` element would be refused, a constructable stylesheet is not.
- Where constructable stylesheets are missing (no `adoptedStyleSheets`, `CSSStyleSheet` or `replaceSync` on the target document's own realm), an `'adopted'` request falls back to the element channel; `handle.mode` tells which ran.
- Cascade order: adopted sheets come after the document's own sheets, so a rule of equal specificity wins where a `<style>` in `<head>` might not.
- A constructed sheet ignores `@import` rules (platform rule).
- The mode lives in factory scope: one per runtime container, not shared between instances. Not worker-safe: without a `document`, `attach` returns an inert handle (`mode: 'none'`).

## See also

[component](./component.md) — scoped component CSS injection
[template](./template.md) — template CSS injection
[themeTokens](./themeTokens.md) — design-token `<style>` management
