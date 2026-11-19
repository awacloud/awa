# CMap — Character Map utilities

PDF/Adobe CMaps (distinct from the OpenType `cmap` subtables, which live under [table/cmap](../table/cmap.md)).

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [toUnicode](./toUnicode.md) | `{ parseToUnicode, buildToUnicode }` | `fontErrors` | ToUnicode CMap stream (Adobe TN #5014). |
| [cid](./cid.md) | `{ parseCidCMap, chain, cidOf }` | `fontErrors` | CID CMap of a composite font: codes to CIDs (Adobe TN #5014). |
