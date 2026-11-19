# Apple AAT — Advanced Typography scaffolds

Scaffolds for the Apple AAT tables (RM06). The modules decode the
**envelopes** (header, version, count, offsets) and, where the format
allows it, the **AAT lookup tables** themselves. `lookup.js` reads the
lookup tables and extended state tables; `morx.js` decodes the bodies of
its five subtable types with them, and `morx-engine.js` applies them;
`kerx.js` decodes every `kerx` format, `prop.js` its lookup and `ankr.js`
its anchors with them, and `kerx-engine.js` applies `kerx` (and the
classic `kern`).

The stub-ness signal is **not uniform** across the six modules — verify
against the live code rather than assuming a shared contract:

- `prop.js`, `kerx.js` and `morx.js` return `parsed: false` and an
  `error` for a body that does not decode, `parsed: true` otherwise.
- `ankr.js` resolves a glyph's anchors through its lookup
  (`anchors(glyph)`).
- `lcar.js` gives **no runtime signal at all** — `parseLcar` returns an
  AAT lookup-table `lookupFormat` + raw `lookupBytes`, but does not
  decode the AAT lookup formats (0/2/4/6/8/10) needed to resolve a glyph
  ID to its caret block offset. There is no marker or `parsed` field to
  detect this — a consumer must not call `readCaretBlock` with
  an offset derived from the lookup table, since the table is not
  decoded.
- `feat.js` has no stub signal because it has no state-machine body to
  defer — `parseFeat` fully decodes every feature/setting record.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [morx](./morx.md) | `{ parseMorx }` | `fontErrors`, `fontReader`, `aatLookup` | Extended metamorphosis. |
| [lookup](./lookup.md) | `{ parseLookup, parseStateTable, DELETED_GLYPH }` | `fontErrors` | Lookup and extended state tables. |
| [morx-engine](./morx-engine.md) | `{ applyMorx, chainFlags }` | — | Applies a parsed `morx`. |
| [kerx](./kerx.md) | `{ parseKerx }` | `fontErrors`, `fontReader`, `aatLookup` | Extended kerning. |
| [kerx-engine](./kerx-engine.md) | `{ applyKerx, applyKern }` | — | Applies a parsed `kerx` or `kern`. |
| [ankr](./ankr.md) | `{ parseAnkr, readAnchorBlock }` | `fontErrors`, `fontReader`, `aatLookup` | Anchor points. |
| [prop](./prop.md) | `{ parseProp, PROP_BITS }` | `fontErrors`, `fontReader`, `aatLookup` | Glyph properties. |
| [lcar](./lcar.md) | `{ parseLcar, readCaretBlock }` | `fontErrors`, `fontReader` | Ligature carets. |
| [feat](./feat.md) | `{ parseFeat, FEAT_FLAGS }` | `fontErrors`, `fontReader` | Feature names. |
| [index](./index.md) | `{ aatFactories }` | the 6 modules above | Barrel (module `aatBarrel`, not `aatIndex`). |
