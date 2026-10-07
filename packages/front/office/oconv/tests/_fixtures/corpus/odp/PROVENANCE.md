# `@awacloud/oconv` odp corpus — provenance & licence

> Own provenance record for this directory only (per the durable rule,
> `ai/memory/types/office.md` 2026-07-21: "never append to another task's
> provenance file"). Sibling to `../PROVENANCE.md` (BATCH_11's docx/odt
> corpus) and `../pptx/PROVENANCE.md` (this task's vendored pptx corpus).

Two files, **first-party repository output** — no third-party content, no
third-party rights, same status as the docx/odt first-party fixtures in
`../PROVENANCE.md` §1/§2.

Generator: `../gen-odp-fixtures.js` (one-shot, committed for provenance
only — a fidelity harness reads the COMMITTED bytes below and never
re-runs it). Built via `@awacloud/odf`'s public `odp.write(doc, opts)` surface
only — same composition pattern `oconvOdpToIr`'s own unit tests use
(`../../src/read/odp-to-ir.test.js`). Regenerate with:

```bash
bun packages/front/office/oconv/tests/_fixtures/gen-odp-fixtures.js
```

| File | Bytes | SHA-256 | Content |
|---|---|---|---|
| `odp-structured.odp` | 1925 | `5fa471393570bab4465155135094b5b3763b03e4227577265a7bd51d0f43c30c` | 2 slides, each with a `presentation:class="title"` frame + a plain body text-box frame (2 paragraphs on slide 1, 1 on slide 2); slide 1 also carries speaker notes |
| `odp-media.odp` | 1899 | `645825e42b0c53cfd14af39f17a550b51dacef775647b3f8a73b5861721731ce` | 1 slide, NO title frame, one body paragraph, one embedded `<draw:image>` frame, speaker notes |

**Why odp instead of a second real-world source**: Apache POI's
`test-data` tree has no `.odp` content at all (POI does not implement
ODF — confirmed already in `../PROVENANCE.md` §3 for `.odt`, the same
absence holds for `.odp`; `ls test-data` at the pinned commit lists
`ddf`, `diagram`, `document`, `hmef`, `hpsf`, `hsmf`, `integration`,
`openxml4j`, `poifs`, `publisher`, `slideshow`, `spreadsheet`, `xmldsign`
— `slideshow/` is pptx/ppt only). The plan's own prescribed sourcing for
odp is first-party generation via `@awacloud/odf`'s public writer — applied
here exactly as prescribed, not a fallback from a rejected search.

Content, confirmed by running `oconvOdpToIr.odpToIr()` (this task's own
reader, `../../src/read/odp-to-ir.js`) against each file on this tree
after generating, both `includeNotes` values:

- **`odp-structured.odp`** — `includeNotes:false`: **lossy**, exactly
  `[{code: 'slides/notes-omitted', detail: ''}]` (slide 1's notes only —
  slide 2 has none). `includeNotes:true`: **zero loss**, the notes appear
  as a `blockquote` at the end of slide 1's section, after its body
  paragraphs and before slide 2's heading.
- **`odp-media.odp`** — both `includeNotes` values: `slides/media-dropped`
  (detail `image`) + `slides/untitled` fire regardless (title/media facts
  are independent of the notes option); `includeNotes:false` additionally
  records `slides/notes-omitted`, `includeNotes:true` instead appends the
  notes blockquote after the one body paragraph. Real-world-shaped
  confirmation that all three tier-1 loss codes coexist correctly on one
  slide.

**No reader gap was found on either file** — both convert without
throwing, and every loss recorded is one already covered by the reader's
own unit tests. Nothing here is a new BACKLOG feed-back item.

## Refresh procedure

1. Re-run `bun packages/front/office/oconv/tests/_fixtures/gen-odp-fixtures.js`,
   recompute the SHA-256s (NOT guaranteed byte-identical across a refresh —
   `@awacloud/odf`'s zip writer shares `@awacloud/fw`'s zip writer, which stamps a
   wall-clock DOS date/time by default, the same GAP-OOXML-4 note
   `../PROVENANCE.md` records for docx/odt), update this file.
2. Always re-run `bun test packages/front/office/oconv/` after touching
   anything in this directory.
