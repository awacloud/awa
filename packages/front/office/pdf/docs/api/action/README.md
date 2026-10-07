# Actions — ISO 32000-2 §12.6

Actions executed from annotations, outlines, form fields.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [`pdfAction`](./action.md) | `{ typeAction }` | `pdfErrors`, `pdfParser` | Dispatcher, §12.6. |
| [`pdfActionGoTo`](./goTo.md) | `{ typeGoTo, typeGoToR, typeGoToE }` | `pdfErrors`, `pdfParser` | §12.6.4.2–4. |
| [`pdfActionUri`](./uri.md) | `{ typeUri }` | `pdfErrors`, `pdfParser` | §12.6.4.7. |
| [`pdfActionNamed`](./named.md) | `{ typeNamed }` | `pdfErrors`, `pdfParser` | §12.6.4.11. |
| [`pdfActionLaunch`](./launch.md) | `{ typeLaunch }` | `pdfErrors`, `pdfParser` | §12.6.4.5. |

## Pattern

```js
const a = runtime.resolve('pdfAction');
const typers = {
    GoTo:  runtime.resolve('pdfActionGoTo').typeGoTo,
    GoToR: runtime.resolve('pdfActionGoTo').typeGoToR,
    URI:   runtime.resolve('pdfActionUri').typeUri,
    Named: runtime.resolve('pdfActionNamed').typeNamed,
    Launch:runtime.resolve('pdfActionLaunch').typeLaunch
};
const action = a.typeAction(dict, typers);
```

## See also

- [Destination](../destination/README.md) · [Outline](../outline/README.md) · [Annot — Link / Widget](../annot/README.md)
