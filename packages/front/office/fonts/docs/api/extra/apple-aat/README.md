# Apple AAT — Advanced Typography scaffolds

Scaffolds for the Apple AAT tables (RM06). The modules decode the
**envelopes** (header, version, count, offsets) and, where the format
allows it, the **AAT lookup tables** themselves; the **state-machine
bodies** (`morx` subtable actions, `kerx` formats 1/2/4/6) are kept as
raw bytes and are not decoded.

The stub-ness signal is **not uniform** across the six modules — verify
against the live code rather than assuming a shared contract:

- `prop.js` and `morx.js`/`kerx.js` (non-format-0 `kerx` subtables) return
  `parsed: false` (`prop.js` also adds `reason: 'aat-state-machine-deferred'`);
  `kerx.js` format 0 subtables and any fully-decoded record return
  `parsed: true`.
- `ankr.js` and `lcar.js` give **no runtime signal at all** — their
  `parseAnkr`/`parseLcar` return an AAT lookup-table `lookupFormat` +
  raw `lookupBytes`, but neither module decodes the AAT lookup formats
  (0/2/4/6/8/10) needed to resolve a glyph ID to its anchor/caret block
  offset. There is no marker or `parsed` field to detect this in either
  file — a consumer must not call `readAnchorBlock`/`readCaretBlock` with
  an offset derived from the lookup table, since the table is not
  decoded.
- `feat.js` has no stub signal because it has no state-machine body to
  defer — `parseFeat` fully decodes every feature/setting record.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [morx](./morx.md) | `{ parseMorx }` | `fontErrors`, `fontReader` | Extended metamorphosis. |
| [kerx](./kerx.md) | `{ parseKerx }` | `fontErrors`, `fontReader` | Extended kerning. |
| [ankr](./ankr.md) | `{ parseAnkr, readAnchorBlock }` | `fontErrors`, `fontReader` | Anchor points. |
| [prop](./prop.md) | `{ parseProp, PROP_BITS }` | `fontErrors`, `fontReader` | Glyph properties. |
| [lcar](./lcar.md) | `{ parseLcar, readCaretBlock }` | `fontErrors`, `fontReader` | Ligature carets. |
| [feat](./feat.md) | `{ parseFeat, FEAT_FLAGS }` | `fontErrors`, `fontReader` | Feature names. |
| [index](./index.md) | `{ aatFactories }` | the 6 modules above | Barrel (module `aatBarrel`, not `aatIndex`). |
