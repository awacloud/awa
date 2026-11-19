# Type 1 — PostScript Type 1 and bare CFF font programs

A Type 1 program read from a PFB, a PFA or a PDF `/FontFile` stream, and a bare CFF program (a PDF `/FontFile3` `Type1C` or `CIDFontType0C`), their charstrings drawn into outlines. These are not sfnt fonts: [`fonts.read`](../fonts.md) does not take them.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [type1](./type1.md) | `{ readType1 }` | `fontErrors`, `encodingStandard`, `fontType1Charstring` | The program read: its name, matrix, bounding box, built-in encoding and glyphs. |
| [cff](./cff.md) | `{ readCff }` | `fontErrors`, `tableCff`, `encodingStandard` | A bare CFF as a font: encoding, names or CIDs, widths, closed contours, `seac`, per-Font-DICT matrices. |
| [charstring](./charstring.md) | `{ decrypt, draw }` | `fontErrors`, `encodingStandard` | Type 1 decryption and the charstring interpreter (flex, hint replacement, `seac`). |
