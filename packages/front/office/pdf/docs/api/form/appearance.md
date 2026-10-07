---
module: pdfAppearance
category: pdf/form
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfAppearance

> Typing of the `/AP` appearance-streams dict — ISO 32000-2 §12.5.5.

**Module** `pdfAppearance` | **Source** `packages/front/office/pdf/src/form/appearance.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

A widget annotation carries an `/AP` with 3 slots: **N** (Normal, required), **R** (Rollover, optional), **D** (Down, optional). Each slot is either a direct stream (or ref), or a sub-dict mapping **state names** (e.g. `/Yes`, `/Off`) to streams — the form used by checkbox/radio, with the current state selected by `/AS`. The module normalizes both shapes to `{ default, states }`.

## Resolve

```js
const ap = runtime.resolve('pdfAppearance');
// Returns: { typeAppearanceStreams, listPopulatedSlots }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeAppearanceStreams` | `(dict) => Appearance` | Typing. |
| `listPopulatedSlots` | `(ap) => Array<'N'\|'R'\|'D'>` | Non-null slots. |

### Shape `Appearance`

```js
{
    N: { default: stream|ref|null, states: { [stateName]: stream|ref } },
    R: { ... } | null,
    D: { ... } | null,
    raw: object,
    _extras: { [key]: PdfObject }
}
```

- If the slot was a bare stream/ref → `default` is set, `states = {}`.
- If the slot was a sub-dict → `default = null`, `states` populated.
- `/N` is always present (otherwise `pdf/form/ap/missing-n`).

## Examples

### Stateless (text field)

```js
const ap = runtime.resolve('pdfAppearance');
const a = ap.typeAppearanceStreams(widget.entries.AP);
a.N.default;        // typed stream
a.N.states;         // {}
```

### Checkbox/radio (with states)

```js
const a = ap.typeAppearanceStreams(widget.entries.AP);
const currentState = widget.entries.AS && widget.entries.AS.value;  // 'Yes' | 'Off'
const visualStream = a.N.states[currentState] || a.N.default;
```

### Enumeration

```js
ap.listPopulatedSlots(a);   // ['N'] or ['N','R'] or ['N','R','D']
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/form/ap/not-dict` | `ParseError` | Argument is not a typed dict. |
| `pdf/form/ap/missing-n` | `ParseError` | `/N` absent (Normal slot required). |
| `pdf/form/ap/bad-state` | `ParseError` | A state entry is neither a stream nor a ref. |
| `pdf/form/ap/bad-slot` | `ParseError` | An `/N`/`/R`/`/D` slot is neither stream/ref nor a sub-dict. |

## See also

- [`pdfButtonField`](./button.md) — checkbox/radio uses the `states`.
- [`pdfTextField`](./text.md), [`pdfChoiceField`](./choice.md), [`pdfSignatureField`](./signature.md).
- [`pdfContentStream`](../content/stream.md) — parses the appearance streams.
- [`pdfImages`](../content/images.md) — typing of the underlying Form XObjects.
