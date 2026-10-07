# Standard 14 — Adobe PDF built-in fonts

Metrics for the 14 PDF Standard PostScript fonts (Helvetica × 4, Times × 4, Courier × 4, Symbol, ZapfDingbats). Referenceable without embedding.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [helvetica](./helvetica.md) | 4 records + widths | none | Helvetica family. |
| [times](./times.md) | 4 records + widths | none | Times family. |
| [courier](./courier.md) | 4 records + widths | none | Courier family (monospace 600). |
| [symbol](./symbol.md) | 1 record + widths | none | Symbol (Greek + math). |
| [zapfDingbats](./zapfDingbats.md) | 1 record + widths | none | ITC Zapf Dingbats. |
| [lookup](./lookup.md) | `{ lookupStandard14, isStandard14, STANDARD_14_NAMES }` | `fontErrors`, `standard14Helvetica`, `standard14Times`, `standard14Courier`, `standard14Symbol`, `standard14ZapfDingbats` | Dispatcher by name. |
