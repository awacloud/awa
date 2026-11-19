---
module: encodingAgl
category: encodings/agl
dependencies: [encodingAglTable, encodingZapfDingbatsGlyphs]
returns: object
worker-safe: true
status: complete
---

# encodingAgl

> `glyphNameToUnicode(name)` — Adobe Glyph List name-to-Unicode resolver; `dingbatsNameToUnicode(name)` for a Zapf Dingbats font.

**Module** `encodingAgl` | **Source** `packages/front/office/fonts/src/encodings/agl.js` | **Deps** `encodingAglTable`, `encodingZapfDingbatsGlyphs` | **Worker-safe** yes

## Resolve

```js
const { glyphNameToUnicode, dingbatsNameToUnicode } = runtime.resolve('encodingAgl');
// Returns: { glyphNameToUnicode, dingbatsNameToUnicode }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `glyphNameToUnicode` | `(name: string) => number[] \| null` | Unicode code point sequence for a PostScript glyph name, or `null` when unresolvable. Never throws. |
| `dingbatsNameToUnicode` | `(name: string) => number[] \| null` | For a glyph of a Zapf Dingbats font: the ITC Zapf Dingbats Glyph List first (`a1` to `a206`, `encodingZapfDingbatsGlyphs`), then `glyphNameToUnicode`. Never throws. |

## Examples

```js
const { glyphNameToUnicode } = runtime.resolve('encodingAgl');

glyphNameToUnicode('Agrave');        // [0x00C0] — table lookup
glyphNameToUnicode('ffi');           // [0xFB03] — ligature, single precomposed code point
glyphNameToUnicode('uni0041');       // [0x0041]
glyphNameToUnicode('uni00410042');   // [0x0041, 0x0042] — a 2-codepoint sequence
glyphNameToUnicode('u1F600');        // [0x1F600] — astral-plane single codepoint
glyphNameToUnicode('not-a-glyph');   // null
glyphNameToUnicode('a73');           // null — a Zapf Dingbats name, not an AGL one
dingbatsNameToUnicode('a73');        // [0x25A0] — for a Zapf Dingbats font
dingbatsNameToUnicode('space');      // [0x0020] — then as glyphNameToUnicode
```

## Resolution algorithm

The **AGL Specification**'s (`adobe-type-tools/agl-specification`, §3
"Mapping glyph names to Unicode values") heuristic algorithm has three
relevant rules; this module implements all three:

1. **Table lookup** — a verbatim Adobe Glyph List name (e.g. `Agrave` →
   `[0x00C0]`, `bullet` → `[0x2022]`, ligatures like `ffi` → `[0xFB03]`).
   Backed by `encodingAglTable`'s `AGL_TABLE`, generated from the vendored
   `adobe-type-tools/agl-aglfn` `glyphlist.txt` (BSD-3-Clause, pinned commit
   `4036a9ca`, 4281 entries — see `../../src/encodings/AGL-PROVENANCE.md`
   and the re-runnable generator `../../tools/gen-agl-table.mjs`).
2. **`uniXXXX[YYYY...]` form** — `"uni"` + a hex-digit sequence
   whose length is a multiple of 4; each 4-digit group is one Unicode
   code point (surrogate / out-of-range groups invalidate the whole name).
3. **`uXXXX`/`uXXXXX`/`uXXXXXX` form** — `"u"` + 4 to 6 hex
   digits, a single Unicode code point (same range/surrogate exclusion).

A name that matches none of the three resolves to `null`.

## Worker Usage

```js
const worker = fw.createWorker([encodingAglTable, encodingZapfDingbatsGlyphs, encodingAgl]);
```

## Notes

- Hex-digit matching is case-insensitive (a documented, deliberate
  deviation from the spec's literal "uppercase hexadecimal digits" — real
  fonts use both cases; this only widens what resolves).
- Consumers should treat a `null` result as "no Unicode mapping known"
  rather than "the glyph name is invalid".
- `dingbatsNameToUnicode` is for a font the caller knows to be a Zapf
  Dingbats one: other fonts use names of the `aNN` form for unrelated
  glyphs, so `glyphNameToUnicode` never reads the Zapf Dingbats list.

## See also

- [lookup](./lookup.md) — the byte-to-glyph-name encoding dispatcher this
  module complements (glyph name → Unicode, vs. byte → glyph name).
- [zapfDingbatsGlyphs](./zapfDingbatsGlyphs.md) — the ITC Zapf Dingbats Glyph List behind `dingbatsNameToUnicode`.
- `../../src/encodings/AGL-PROVENANCE.md` — vendoring provenance + regeneration recipe.
