---
module: pdfButtonField
category: pdf/form
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfButtonField

> Typing of an `/FT /Btn` field — ISO 32000-2 §12.7.5.2.

**Module** `pdfButtonField` | **Source** `packages/front/office/pdf/src/form/button.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

A button field covers three subtypes selected by the `/Ff` flag word:

- **Pushbutton** (bit 17) — momentary, no retained state.
- **Radio** (bit 16) — exclusive.
- **Checkbox** — default when neither Pushbutton nor Radio.

Additional sub-flags: **NoToggleToOff** (bit 15, radio only) and **RadiosInUnison** (bit 26). `/V` is a `name` (`/Yes`, `/Off`, ...); `/Opt` is an array of strings/names for the export values. Any non-canonical entry falls into `_extras`.

## Resolve

```js
const bf = runtime.resolve('pdfButtonField');
// Returns: { typeButtonField }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeButtonField` | `(dict) => ButtonField` | Typing. |

### Shape `ButtonField`

```js
{
    ft: 'Btn',
    flags: number,
    kind: 'pushbutton' | 'radio' | 'checkbox',
    noToggleToOff:  boolean,
    radiosInUnison: boolean,
    v:   string | null,       // name value
    dv:  string | null,
    opt: Array<string|Uint8Array>,
    t:   Uint8Array | null,   // /T partial name
    raw: object,
    _extras: { [key]: PdfObject }
}
```

## Examples

### Typing

```js
const bf = runtime.resolve('pdfButtonField');
const btn = bf.typeButtonField(record.node);
btn.kind;       // 'checkbox'
btn.v;          // 'Yes' | 'Off'
```

### Radio detection

```js
if (btn.kind === 'radio') {
    btn.opt;             // ['First option', 'Second option', ...]
    btn.noToggleToOff;   // bit 15
}
```

### Pushbutton (no retained state)

```js
if (btn.kind === 'pushbutton') {
    // No /V to change; behavior is driven by /AA (actions).
}
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/form/btn/not-dict` | `ParseError` | Argument is not a typed dict. |
| `pdf/form/btn/bad-ft` | `ParseError` | `/FT` present but ≠ `/Btn`. |
| `pdf/form/btn/bad-opt` | `ParseError` | `/Opt` is not an array. |
| `pdf/form/btn/bad-opt-entry` | `ParseError` | `/Opt` entry is not a string/name. |

## See also

- [`pdfAcroForm`](./acroform.md) — roots.
- [`pdfFieldTree`](./fieldTree.md) — field discovery.
- [`pdfAppearance`](./appearance.md) — `/AP` with `states` for checkbox/radio.
- [`pdfTextField`](./text.md), [`pdfChoiceField`](./choice.md), [`pdfSignatureField`](./signature.md).
