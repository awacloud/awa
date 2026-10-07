---
module: pdfChoiceField
category: pdf/form
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfChoiceField

> Typing of a choice field `/FT /Ch` (list box or combo box) — ISO 32000-2 §12.7.5.4.

**Module** `pdfChoiceField` | **Source** `packages/front/office/pdf/src/form/choice.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

A choice field is either a **list box** (default) or a **combo** (bit 18). Sub-flags: **Edit** (bit 19, combo + free text entry), **Sort** (bit 20), **MultiSelect** (bit 22, list only), **DoNotSpellCheck** (bit 23, Edit-combo only), **CommitOnSelChange** (bit 27). `/Opt` accepts two shapes: `string|name` (display = export) or a 2-element `[export, display]` array. `/V` is a `string` or `array<string>`. `/I` is a parallel array of indices.

## Resolve

```js
const cf = runtime.resolve('pdfChoiceField');
// Returns: { typeChoiceField }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeChoiceField` | `(dict) => ChoiceField` | Typing. |

### Shape `ChoiceField`

```js
{
    ft: 'Ch',
    flags: number,
    kind: 'list' | 'combo',
    editable, sort, multiSelect, doNotSpellCheck, commitOnSelChange,  // booleans
    opt: Array<{ export: string|Uint8Array, display: string|Uint8Array }>,
    v:   Array<string|Uint8Array> | null,
    dv:  Array<string|Uint8Array> | null,
    i:   number[],          // indices
    ti:  number,            // top index
    da:  Uint8Array | null,
    q:   number,
    t:   Uint8Array | null,
    raw, _extras
}
```

`editable` is computed as `combo && Edit`. `multiSelect` is computed as `!combo && MultiSelect` (combos cannot be multi-select).

## Examples

### Typical list box

```js
const cf = runtime.resolve('pdfChoiceField');
const ch = cf.typeChoiceField(record.node);
ch.kind;          // 'list'
ch.opt;           // [{export:'A',display:'Alpha'}, ...]
ch.v;             // ['A']
```

### Editable combo

```js
if (ch.kind === 'combo' && ch.editable) {
    // The user can enter a value outside /Opt
}
```

### Multi-select

```js
if (ch.multiSelect) {
    ch.v;   // ['A','C']
    ch.i;   // [0, 2]
}
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/form/ch/not-dict` | `ParseError` | Argument is not a typed dict. |
| `pdf/form/ch/bad-ft` | `ParseError` | `/FT` present but ≠ `/Ch`. |
| `pdf/form/ch/bad-opt` | `ParseError` | `/Opt` is not an array. |
| `pdf/form/ch/bad-opt-entry` | `ParseError` | Invalid entry (shape, length, or types). |
| `pdf/form/ch/bad-v` | `ParseError` | `/V` array contains a non-string. |

## See also

- [`pdfFieldTree`](./fieldTree.md) — discovery.
- [`pdfButtonField`](./button.md), [`pdfTextField`](./text.md), [`pdfSignatureField`](./signature.md).
- [`pdfAppearance`](./appearance.md) — re-rendering when `NeedAppearances`.
