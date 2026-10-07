---
module: formForms
category: odf/form
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# formForms

> `<office:forms>` container + typed `<form:*>` controls.

**Module** `formForms` | **Source** `packages/front/office/odf/src/form/forms.js` | **Deps** `xml` | **Worker-safe** yes

Recognised control kinds: `button`, `text`, `checkbox`, `listbox`,
`combobox`, `radio`, `date`, `time`, `file`, `hidden`, `image-frame`,
`formatted-text`, `fixed-text`, `password`, `textarea`,
`generic-control`, `value-range`, `column`, `grid`, `item`, `option`,
`properties`, `property`, `list-property`, `connection-resource`.

Model:

```js
{
  forms: [
    { name?, attrs, controls: [{ kind, attrs, children?, _extras? }], _extras? }
  ]
}
```

## Resolve

```js
const forms = runtime.resolve('formForms');
// → { isFormElementName, parseOfficeForms, renderOfficeForms,
//     parseForm, renderForm, parseControl, renderControl }
```

## API

| Method | Description |
|--------|-------------|
| `isFormElementName(name)` | Returns whether `name` is a `form:*` tag (in the known set, or any `form:`-prefixed name). |
| `parseOfficeForms(el)` / `renderOfficeForms(f)` | The `<office:forms>` container roundtrip. |
| `parseForm(el)` / `renderForm(form)` | A single `<form:form>` roundtrip. |
| `parseControl(el)` / `renderControl(c)` | A single form control roundtrip. |

## Examples

```js
const forms = runtime.resolve('formForms');
const el = xml.parse('<office:forms><form:form form:name="F1"><form:button/></form:form></office:forms>');
const f = forms.parseOfficeForms(el);
// { forms: [{ name: 'F1', attrs: {...}, controls: [{ kind: 'form:button', attrs: {} }] }] }
forms.renderOfficeForms(f);
```

## Notes

- Nested children of a control (e.g. `form:item` inside `form:listbox`) are kept as raw XML nodes — nested control trees are not typed here; the opt-in `formsControls` extra types the `form:*` vocabulary.
- Controls preserve unknown attributes verbatim on `attrs`; the container preserves non-`form:form` children under `_extras.children`.

## See also

- [extra/forms-controls](../extra/forms-controls.md)
- [errors](../errors.md)
