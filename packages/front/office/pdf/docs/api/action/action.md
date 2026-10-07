---
module: pdfAction
category: pdf/action
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfAction

> Action dispatcher — ISO 32000-2 §12.6, walks `/Next` with cycle protection.

**Module** `pdfAction` | **Source** `packages/front/office/pdf/src/action/action.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

`typeAction(dict, typers, opts)` dispatches on `/S` to the specialized typer supplied in `typers` (`GoTo`, `GoToR`, `GoToE`, `URI`, `Named`, `Launch`, …). When no matching typer is supplied, falls back to a generic `{ kind, raw, _extras }` record — additionally flagged `vendor: true` when `/S` is outside the set of standard action kinds this module recognizes by name (Thread, Sound, Movie, Hide, SubmitForm, ResetForm, ImportData, SetOCGState, Rendition, Trans, GoTo3DView, GoToDp, JavaScript, RichMediaExecute, plus the ones with dedicated typers). Follows the `/Next` chain (recursive, either a single dict or an array) bounded by depth (`opts.maxDepth`, default **16**) and detecting cycles via a `Set` of already-visited dict objects.

## Resolve

```js
const a = runtime.resolve('pdfAction');
// Returns: { typeAction }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeAction` | `(dict, typers, opts?: { maxDepth? }) => Action` | Dispatched record + `next` chain. |

`typers` is a dict `{ GoTo: fn, GoToR: fn, URI: fn, Named: fn, Launch: fn, … }` — typically composed from the other action modules.

### Shape `Action`

```js
{ kind, /* fields per typer, or { raw, _extras, vendor? } for unrecognized/generic kinds */, next?: Action[] }
```

## Examples

### Composing the typers

```js
const a = runtime.resolve('pdfAction');
const goTo = runtime.resolve('pdfActionGoTo');
const uri  = runtime.resolve('pdfActionUri');
const typers = {
    GoTo:  goTo.typeGoTo,
    GoToR: goTo.typeGoToR,
    URI:   uri.typeUri,
    Named: runtime.resolve('pdfActionNamed').typeNamed,
    Launch:runtime.resolve('pdfActionLaunch').typeLaunch
};
const action = a.typeAction(dict, typers);
```

### Walking the action chain

```js
let cur = action;
while (cur) {
    console.log(cur.kind);
    cur = cur.next ? cur.next[0] : null;
}
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/action/max-depth` | `ParseError` | `/Next` chain exceeds `opts.maxDepth`. |
| `pdf/action/not-dict` | `ParseError` | Argument is not a dict. |
| `pdf/action/cycle` | `ParseError` | Action already visited. |
| `pdf/action/bad-type` | `ParseError` | `/Type` ≠ `/Action`. |
| `pdf/action/missing-s` | `ParseError` | `/S` absent. |
| `pdf/action/bad-next` | `ParseError` | `/Next` is neither a dict nor an array. |

## See also

- [`pdfActionGoTo`](./goTo.md) · [`pdfActionUri`](./uri.md) · [`pdfActionNamed`](./named.md) · [`pdfActionLaunch`](./launch.md)
- [`pdfLinkAnnot`](../annot/link.md) · [`pdfWidgetAnnot`](../annot/widget.md)
