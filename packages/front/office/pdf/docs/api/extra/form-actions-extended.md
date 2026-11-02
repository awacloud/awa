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

Covers: GoTo3DView (§12.6.4.15), SetOCGState (§12.6.4.12), Trans (§12.6.4.13), Rendition (§12.6.4.14), Hide (§12.6.4.10), SubmitForm (§12.6.4.4), ResetForm (§12.6.4.5), ImportData (§12.6.4.6), JavaScript (§12.6.4.7, sandboxed flag only), and from `Key:type` tables Thread (`f`, `d`, `b`), Sound (`sound`, `volume`, `synchronous`, `repeat`, `mix`), Movie (`annotation`, `t`, `operation`), RichMediaExecute (`ta`, `ti`, `cmd`), GoToDp (`dp`) and the PDF 1.2 SetState (`t`, `as`) and NOP — a name, a string (its bytes), a number, an integer or a boolean by its value, a dictionary, array or stream as read, a reference as read, a key of several types by the first that fits. Returns `{ kind, ...typed, raw, _extras }`.

## Resolve

```js
const ext = runtime.resolve('pdfFormActionsExtended');
// Returns: { typeExtendedAction, EXTENDED_ACTION_SUBTYPES, typeFieldEntries,
//   typeAdditionalActions, ADDITIONAL_ACTION_TRIGGERS }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typeExtendedAction` | `(dict) => ExtendedAction` | Dispatches on `/S`. |
| `EXTENDED_ACTION_SUBTYPES` | `Set<string>` | The 16 covered subtypes. |
| `typeAdditionalActions` | `(dict, kind) => { raw, _extras, … }` | An additional-actions dictionary (`/AA`), `kind` `catalog` (`DC`, `WS`, `DS`, `WP`, `DP`), `formField` (`K`, `F`, `V`, `C`), `pageObject` (`O`, `C`), `screenAnnotation` (`E`, `X`, `D`, `U`, `PO`, `PC`, `PV`, `PI`) or `widgetAnnotation` (those and `Fo`, `Bl`): one field per trigger key, named after it in lower case, the action dictionary or reference as read (`null` for another value); the other keys in `_extras`. |
| `ADDITIONAL_ACTION_TRIGGERS` | frozen object | Kind → its trigger keys. |
| `typeFieldEntries` | `(dict) => { parent?, kids?, t?, tu?, tm?, ff?, aa?, ds?, rv?, raw }` | The companion of the core field typers: the field dictionary's shared keys and its rich text (`ds` a text string, `rv` a text string or a stream), present only when the key is, `null` for another value; no `_extras`. Throws `pdf/extra/action-ext/field-not-dict` for a non-dictionary. |

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
a.js;          // string, stream, or the indirect reference of a stream
              // (the form a stream script takes in a dictionary; resolve it)
a.sandboxed;   // true
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/action-ext/not-dict` | `ParseError` | Argument is not a dictionary. |
| `pdf/extra/action-ext/bad-type` | `ParseError` | `/Type` present and not `/Action`. |
| `pdf/extra/action-ext/unsupported` | `ParseError` | `/S` outside `EXTENDED_ACTION_SUBTYPES`. |
| `pdf/extra/action-ext/aa-not-dict` | `ParseError` | `typeAdditionalActions`: not a dict. |
| `pdf/extra/action-ext/aa-kind` | `ContractError` | `typeAdditionalActions`: `kind` missing or unknown. |
| `pdf/extra/action-ext/bad-state` | `ParseError` | SetOCGState `/State` malformed. |
| `pdf/extra/action-ext/bad-trans` | `ParseError` | `/Trans` dict invalid. |
| `pdf/extra/action-ext/missing-t` | `ParseError` | `/T` absent (Hide). |
| `pdf/extra/action-ext/bad-t` | `ParseError` | `/T` wrong type. |
| `pdf/extra/action-ext/missing-f` | `ParseError` | `/F` absent (SubmitForm/ImportData). |
| `pdf/extra/action-ext/missing-js` | `ParseError` | `/JS` absent. |
| `pdf/extra/action-ext/bad-js` | `ParseError` | `/JS` neither a string, a stream nor a reference. |

## See also

- [`pdfAction`](../action/action.md)
- [Extras index](./README.md)
