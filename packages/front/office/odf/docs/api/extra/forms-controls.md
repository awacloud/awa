---
module: formsControls
category: odf/extra
dependencies: [xml, odfTypedHelper]
returns: object
worker-safe: true
status: complete
---

# formsControls (P1)

> Opt-in extra : typed parse/render of the full ODF `form:*` control
> vocabulary — button, text, textarea, fixed-text, image, image-frame,
> checkbox, radio, listbox, option, combobox, item, password,
> formatted-text, number, date, time, file, hidden, frame, value-range,
> grid, column, generic-control, properties, property, list-property,
> list-value, connection-resource, item-list, button-control,
> event-listener.

**Module** `formsControls` | **Source** `packages/front/office/odf/src/extra/forms-controls.js`

## Helpers

`parseForms(el)` / `renderForms(forms)`.
