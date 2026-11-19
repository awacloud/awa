---
module: pdfFormFill
category: pdf/form
dependencies: [pdfErrors, pdfDocument, pdfFieldTree, pdfIncrementalWriter]
returns: object
worker-safe: true
status: complete
---

# pdfFormFill

> Fill an AcroForm and save it, as an incremental update (ISO 32000-2 §12.7, §7.5.6).

**Module** `pdfFormFill` | **Source** `packages/front/office/pdf/src/form/fill.js` | **Deps** `pdfErrors`, `pdfDocument`, `pdfFieldTree`, `pdfIncrementalWriter` | **Worker-safe** yes

## API

| Export | Signature | Description |
|---|---|---|
| `fill` | `(bytes, values) => Uint8Array` | `bytes` followed by an update that sets the fields `values` names. |

`values` maps a field's **fully qualified name** (its ancestors' and its own `/T`, joined by `.`, e.g. `addr.street`) to its value.

| Field (`/FT`, inherited) | Value | Written |
|---|---|---|
| text (`Tx`) | a string | `/V` (a PDF text string: ASCII as is, else UTF-16BE), and each widget's generated `/AP /N` appearance |
| check box (`Btn`) | `true` / `false` | `/V` and each widget's `/AS`: its on-state (its `/AP /N` key other than `/Off`) or `/Off` |
| radio (`Btn`, `Ff` bit 16) | a state name, or `null` | `/V` the state; each widget's `/AS` it when the widget has that state, else `/Off` |
| choice (`Ch`) | a string; an array of strings for a multi-select (`Ff` bit 22) | `/V`; with `/Opt` and not editable (`Ff` bit 19), each value must be one of its options (export or display value) |

The AcroForm gets `/NeedAppearances true` (its own object, or the catalog when the AcroForm is direct there), so a viewer rebuilds the other appearances.

## Example

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/pdf';

const runtime = new ModuleRuntime();
runtime.registerAll([...fw_require, ...modules]);
const { fill } = runtime.resolve('pdfFormFill');

const filled = fill(bytes, { name: 'Ada Lovelace', 'addr.street': '12 St James Sq', agree: true, size: 'L', color: 'blue' });
```

## Notes

- **A text field's appearance** is a Form XObject the size of the widget's `/Rect`, in a `/Tx BMC … EMC` block:
  - the font, size and colour are the `/DA`'s (the field's, inherited, else the AcroForm's); a size of 0 is auto: (height − 4) × 0.7, held to 4–12;
  - the text is one line, left-aligned, 2 points in, vertically centred; the field's `/Q`, comb and multi-line flags are not applied;
  - the font is the AcroForm `/DR` resource the `/DA` names, else a Helvetica Type 1 added;
  - the text is encoded in WinAnsi, a character outside it written `?` (`/V` keeps the full text);
  - a password field (`Ff` bit 14) shows `*` per character.
- **The update** appends the changed objects (fields, widgets, the AcroForm or catalog, the new appearance streams) after the prior bytes, which stay intact: an earlier signature's byte range still verifies, though a DocMDP or field-lock permission is not checked.
- Fields not named in `values` keep their values.

## Errors

| Code | Class | When |
|---|---|---|
| `pdf/form/bad-values` | `ContractError` | `values` is not a plain object. |
| `pdf/form/no-acroform` | `ContractError` | The document has no AcroForm. |
| `pdf/form/unknown-field` | `ContractError` | A name is no terminal field's. |
| `pdf/form/bad-value` | `ContractError` | A value of the wrong type, an option or state the field lacks, a push button, a field with no fillable type. |
| `pdf/form/signature-field` | `ContractError` | A signature field (sign it with the `sig` modules). |
| `pdf/form/encrypted` | `ContractError` | An encrypted document. |
| `readDocument`'s | — | The document does not read. |

## See also

- [`pdfFieldTree`](./fieldTree.md) — the field walk and inheritance this uses
- [`pdfIncrementalWriter`](../document/incrementalWriter.md) — the update writer
