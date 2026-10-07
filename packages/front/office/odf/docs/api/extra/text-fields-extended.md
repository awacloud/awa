---
module: textFieldsExtended
category: odf/extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# textFieldsExtended (P0)

> Opt-in extra : extended typed support for ODF text fields beyond the
> core `textFields` set.

**Module** `textFieldsExtended` | **Source** `packages/front/office/odf/src/extra/text-fields-extended.js`

## Elements covered

`text:variable-decl/set/get`, `text:user-field-decl/get/input`,
`text:sequence-decl`, `text:expression`,
`text:database-display/next/row-select/row-number/name`,
`text:hidden-paragraph`, `text:hidden-text`, `text:conditional-text`,
`text:placeholder`, `text:execute-macro`, `text:dde-connection`,
`text:dde-connection-decl`, `text:meta-field`.

## Hooks

`hydrateParagraph` / `dehydrateParagraph` (promotes recognised fields
from `_extras` into a `fields: [...]` array on the paragraph).
