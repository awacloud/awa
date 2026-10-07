---
module: pdfFormActionsExtended
category: pdf/extra
dependencies: [pdfErrors, pdfParserObj]
returns: object
worker-safe: true
status: complete
---

# pdfFormActionsExtended

> Extended action subtypes (GoTo3DView, SetOCGState, …) — ISO 32000-2 §12.6.4.

**Module** `pdfFormActionsExtended` | **Source** `packages/front/office/pdf/src/extra/form-actions-extended.js` | **Deps** `pdfErrors`, `pdfParserObj` | **Worker-safe** yes

Covers: GoTo3DView (§12.6.4.15), SetOCGState (§12.6.4.12), Trans (§12.6.4.13), Rendition (§12.6.4.14), Hide (§12.6.4.10), SubmitForm (§12.6.4.4), ResetForm (§12.6.4.5), ImportData (§12.6.4.6), JavaScript (§12.6.4.7, sandboxed flag only). Returns `{ kind, ...typed, raw, _extras }`.

## Resolve

```js
const ext = runtime.resolve('pdfFormActionsExtended');
// Returns: { typeExtendedAction, EXTENDED_ACTION_SUBTYPES }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typeExtendedAction` | `(dict) => ExtendedAction` | Dispatches on `/S`. |
| `EXTENDED_ACTION_SUBTYPES` | `Set<string>` | The 9 covered subtypes. |

## Examples

### Type an action

```js
const ext = runtime.resolve('pdfFormActionsExtended');
const a = ext.typeExtendedAction(actionDict);
a.kind;  // 'SubmitForm' | 'JavaScript' | …
```

### SetOCGState

```js
a.kind;   // 'SetOCGState'
a.state;  // raw /State array items
```

### JavaScript

```js
a.kind;        // 'JavaScript'
a.js;          // string or stream
a.sandboxed;   // true
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/action-ext/not-dict` | `ParseError` | Argument is not a dictionary. |
| `pdf/extra/action-ext/bad-type` | `ParseError` | `/Type` present and not `/Action`. |
| `pdf/extra/action-ext/unsupported` | `ParseError` | `/S` outside `EXTENDED_ACTION_SUBTYPES`. |
| `pdf/extra/action-ext/bad-state` | `ParseError` | SetOCGState `/State` malformed. |
| `pdf/extra/action-ext/bad-trans` | `ParseError` | `/Trans` dict invalid. |
| `pdf/extra/action-ext/missing-t` | `ParseError` | `/T` absent (Hide). |
| `pdf/extra/action-ext/bad-t` | `ParseError` | `/T` wrong type. |
| `pdf/extra/action-ext/missing-f` | `ParseError` | `/F` absent (SubmitForm/ImportData). |
| `pdf/extra/action-ext/missing-js` | `ParseError` | `/JS` absent. |
| `pdf/extra/action-ext/bad-js` | `ParseError` | `/JS` wrong type. |

## See also

- [`pdfAction`](../action/action.md)
- [Extras index](./README.md)
