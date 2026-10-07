---
module: pdfActionLaunch
category: pdf/action
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfActionLaunch

> Launch action — ISO 32000-2 §12.6.4.5.

**Module** `pdfActionLaunch` | **Source** `packages/front/office/pdf/src/action/launch.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

`/S /Launch` action — requests launching an external application. `/F` (file spec) or the platform-specific `/Win`/`/Mac`/`/Unix` entries. Optional `/NewWindow` boolean. **Major attack surface** — this module **never executes anything**; it always returns `sandboxed: true` and a `securityWarning` string alongside the typed entries, so the host application decides what to do (typically: ignore, or prompt the user).

## Resolve

```js
const launch = runtime.resolve('pdfActionLaunch');
// Returns: { typeLaunch }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeLaunch` | `(dict) => { kind: 'Launch', sandboxed: true, securityWarning: string, file?, win?, mac?, unix?, newWindow?, raw }` | Typing only — no execution. |

## Examples

### Inspection without execution

```js
const a = runtime.resolve('pdfActionLaunch').typeLaunch(actionDict);
console.warn('Launch action present', a.file);   // refused by default
```

### Filtering in a viewer

```js
function safeDispatch(action) {
    if (action.kind === 'Launch') return false;
    // …
}
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/action/launch/not-dict` | `ParseError` | Argument is not a dict. |
| `pdf/action/launch/empty` | `ParseError` | No target at all (`/F`, `/Win`, `/Mac`, `/Unix` all absent). |

## See also

- [`pdfAction`](./action.md) · [`pdfFileSpec`](../embedded/fileSpec.md)
