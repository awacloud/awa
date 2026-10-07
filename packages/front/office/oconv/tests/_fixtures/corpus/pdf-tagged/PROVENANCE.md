# `@awacloud/oconv` tagged-pdf fixture — provenance & licence

## `tagged-structured.pdf` — first-party, generated via `@awacloud/pdf`'s public write surface

**First-party repository output.** Produced by
`tests/_fixtures/gen-pdf-tagged-fixture.js` (committed for provenance only —
the reader tests read the COMMITTED bytes and never re-run it), which builds
the document ENTIRELY through `@awacloud/pdf`'s PUBLIC write surface: the
typed-object constructors `pdfParser.obj` + `@awacloud/fonts`'
`cmapToUnicode.buildToUnicode` for the ToUnicode CMap + the document writer
via the `pdf.write({ indirects, root, version })` façade. **No PDF bytes are
hand-crafted and no `@awacloud/pdf` internal is reached** (task 05 hard
constraint, F8). No third-party content, no third-party rights.

| File | Bytes | SHA-256 |
|---|---|---|
| `tagged-structured.pdf` | 2260 | `37336f1f4aece85edb3ebcf9941e0dddb74fd0bbbac3b4bb5d49d86c7a047a13` |

**Why it exists**: task 05 requires the tagged fast path to be attempted
first-party, and to fall back to an honest `missing-input` record ONLY if the
public write surface cannot produce a valid tagged sample. It can — this
fixture is the proof: `@awacloud/pdf`'s public writer emits a real
`/StructTreeRoot` (`/MarkInfo << /Marked true >>`, per-page `/StructParents`,
marked content `/H1 …/P … BDC … EMC`), and `pdf.read()` reads it back with
the struct tree resolving. So the reader ships the tagged fast path, not a
missing-input note.

**Logical structure** (single tagged page):

```
H1  "Quarterly Report"           (MCID 0)
P   "This report summarizes …"   (MCID 1)
H2  "Details"                    (MCID 2)
P   "Revenue grew across …"      (MCID 3)
Table                             (container — no own content)
  ├ P "Cell one"                 (MCID 4)
  └ P "Cell two"                 (MCID 5)
```

It exercises: heading-level mapping (`H1`→`heading{1}`, `H2`→`heading{2}`),
paragraph mapping (`P`→`paragraph`), and the `Table` container flatten
(`struct/dropped` loss, descendant cell text kept as paragraphs). The font is
standard-14 Helvetica carrying a printable-ASCII ToUnicode CMap so the text
decodes through the ToUnicode path independent of the AGL named-glyph table.

**Measured**: 1 page, tagged; 106 / 106 codes decoded (100.00%, 0
undecodable); 6 IR blocks (`h1, p, h2, p, p, p`); one `struct/dropped`
(`Table`) loss.

## Refresh procedure

Regenerate with:

```bash
bun packages/front/office/oconv/tests/_fixtures/gen-pdf-tagged-fixture.js
```

Then update the byte count + SHA-256 above and re-run
`bun test packages/front/office/oconv/`.
