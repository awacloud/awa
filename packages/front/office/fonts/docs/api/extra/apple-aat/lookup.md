---
module: aatLookup
category: extra/apple-aat/lookup
dependencies: [fontErrors]
returns: object
worker-safe: true
status: complete
---

# aatLookup

> The AAT lookup tables and extended state tables (Apple TT RM06, "AAT special tables").

**Module** `aatLookup` | **Source** `packages/front/office/fonts/src/extra/apple-aat/lookup.js` | **Deps** `fontErrors` | **Worker-safe** yes

The two shared structures of the AAT tables: the lookup table (glyph to value) and the extended state table (`STXHeader`) that drives the `morx` subtables. `aatMorx` decodes its bodies through them.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseLookup` | function | `(bytes, offset, opts?) => { format, get(glyph) }`: a lookup table of format 0 (simple array), 2 (segment single), 4 (segment array), 6 (single table), 8 (trimmed array) or 10 (extended trimmed array). `get` gives the glyph's 16-bit value (format 10: its 1-, 2- or 4-byte value), or `null`. |
| `parseStateTable` | function | `(bytes, offset, entryWords, opts?) => { nClasses, nStates, entries, classOf(glyph), entry(state, klass) }`: an extended state table whose entries carry `entryWords` 16-bit words of data. |
| `DELETED_GLYPH` | const | `0xFFFF`, the deleted-glyph marker. |
| `aatLookup` | factory | Factory. |

## Options

| Option | Default | Effect |
|---|---|---|
| `numGlyphs` | — | Bounds a format 0 lookup (else it runs to the end of the bytes). |
| `valueSize` | 2 | 4 reads 32-bit values in formats 0, 2, 4, 6 and 8 (`kerx` format 6's long tables). |

## Notes

- **Binary-search formats** (2, 4, 6) skip their last unit when it is the `0xFFFF` terminator (both keys of a segment, the glyph of a single entry).
- **Classes** of a state table: `classOf` gives 2 (deleted glyph) for `0xFFFF`, the class lookup's value, else 1 (out of bounds); class 0 is the end of text and 3 the end of line. `entry(state, klass)` reads a class past `nClasses` as 1.
- **States and entries** are the reachable ones: from state 0, every entry index of the rows read, then every new state of those entries, until nothing new is reached. A state array cut after them is enough; a reachable row or entry past the bytes throws.
- **Errors** are `ParseError`s: `fonts/aat-input` (not a `Uint8Array`, bad offset), `fonts/aat-lookup-short`, `fonts/aat-lookup-unit` (a unit size the format cannot hold), `fonts/aat-lookup-format`, `fonts/aat-state-short`, `fonts/aat-state-classes` (fewer than 4 or more than 65,535 classes).

## See also

- [morx](./morx.md) [morx-engine](./morx-engine.md)
