---
module: standard14Lookup
category: standard14/lookup
dependencies: [fontErrors, standard14Helvetica, standard14Times, standard14Courier, standard14Symbol, standard14ZapfDingbats]
returns: object
worker-safe: true
status: complete
---

# standard14Lookup

> Standard 14 dispatcher — `lookupStandard14(name)` / `isStandard14(name)`.

**Module** `standard14Lookup` | **Source** `packages/front/office/fonts/src/standard14/lookup.js` | **Deps** `fontErrors`, `standard14Helvetica`, `standard14Times`, `standard14Courier`, `standard14Symbol`, `standard14ZapfDingbats` | **Worker-safe** yes

Resolves a PostScript font name ('Helvetica', 'Times-Roman', 'Courier-Bold', 'Symbol', 'ZapfDingbats', etc.) to its metrics record.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `STANDARD_14_NAMES` | const | Frozen list of the 14 canonical names. |
| `lookupStandard14` | function | `(name) => MetricsRecord`. Throws `ContractError` if unknown. |
| `isStandard14` | function | `(name) => boolean`. |
| `standard14Lookup` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { lookupStandard14, isStandard14 } = fw.runtime.resolve('standard14Lookup');
if (isStandard14('Helvetica-Bold')) {
    const m = lookupStandard14('Helvetica-Bold');
}
```

## Notes

- 14 exact names: Helvetica + 3 variants, Times-Roman + 3 variants, Courier + 3 variants, Symbol, ZapfDingbats.
- In a PDF, these fonts can be referenced without being embedded.

## See also

- [helvetica](./helvetica.md) [times](./times.md) [courier](./courier.md) [symbol](./symbol.md) [zapfDingbats](./zapfDingbats.md)
