# `@awacloud/oconv` golden corpus — provenance & licence

> Vendored per the durable owner ruling (`ai/memory/lessons.md`,
> 2026-07-20): **`references/` is documentation, never a code dependency.**
> Nothing under `tests/` reads from `references/` — every byte the fidelity
> harness (`tests/fidelity.integration.test.js`) consumes is committed
> under this directory. `grep -rn "references/" tests/` does hit 4 lines in
> `tests/fidelity.integration.test.js` (a header-comment sentence stating
> this same fact, plus a guard test's own describe/test titles and
> assertion string) — none of them is a fixture path: no test in this
> package RESOLVES a fixture read under `references/`, and the guard test
> asserts exactly that.

Three sources, each documented below: (1) the first-party docx corpus
inherited byte-identical from the W0 spike, plus one docx fixture generated
in-repo (§1b), (2) two odt fixtures generated
in-repo, (3) a small, owner-authorized real-world docx corpus. A fourth
candidate source (LibreOffice `contrib/test-files`) was **checked and
rejected** — see §4.

## 1 — `docx/` — first-party, inherited from the W0 spike (3 files)

Byte-identical copies of `ai/plans/oconv/spikes/w0-core/corpus/docx/*` —
**copied, never regenerated** (GAP-OOXML-4: `@awacloud/fw`'s zip writer stamps a
wall-clock DOS date/time by default, so regeneration is not
byte-identical — the spike's own `PROVENANCE.md` documents this measured
fact). Verified identical with `cmp` against the spike originals before
being committed here.

| File | Bytes | SHA-256 | Content |
|---|---|---|---|
| `docx/docx-smoke.docx` | 1556 | `7be541047cdb2255188fdf68ed6ddc98c47ed22332093df494dcb3f5c7f60b7c` | h1/h2/h3, prose, bold + italic runs, one external hyperlink (explicit `rId`) |
| `docx/docx-structured.docx` | 1252 | `d1adafd38e450e4d1610e846ad9d5caa2d1eae069f2b4f5b29fece3881bf94fb` | headings + two lists (numIds 1 and 2, **no `word/numbering.xml` part at all** — `unzip -l` confirmed) + a 5×3 table |
| `docx/docx-bulk.docx` | 3628 | `7b4a9c3984be963e7a669ba57e5cd45599d4cdf2857197a6c145152f10abd39d` | 1 h1 + 40 h2 + 400 paragraphs + a 61×3 table |

**Honest note on `docx-structured.docx`**: because the committed file has
no `numbering.xml` part, its two lists (`numId` 1 and 2) are genuinely
unresolvable — the frozen, delivered reader (`src/read/docx-to-ir.js`,
task 02) correctly reports `list/numbering-unresolved` twice on this file
(GAP-OOXML-2). The fidelity harness asserts this exact result rather than
a fabricated zero-loss claim (see the harness file's header comment for the
full explanation of why this differs from the W0 spike's own throwaway
prototype, which recorded no loss taxonomy at all).

**Licence**: first-party repository output (produced by `@awacloud/ooxml`'s
public `docx.write()` from literals in the spike's own `corpus-gen.js`); no
third-party content, no third-party rights.

### 1b — `docx/` — generated in-repo via `@awacloud/ooxml`'s public writer (1 file)

Generator: `tests/_fixtures/gen-docx-fr-styles-fixture.js` (one-shot,
committed for provenance only — the tests read the COMMITTED bytes below and
never re-run it). Regenerate with:

```bash
bun packages/front/office/oconv/tests/_fixtures/gen-docx-fr-styles-fixture.js
```

| File | Bytes | SHA-256 | Content |
|---|---|---|---|
| `docx/docx-fr-styles.docx` | 1753 | `074a5e237b273b63233d0e17ea9ae5969b71233de09e53aa01eb4530e80dea7a` | French-LOCALIZED paragraph style IDs (`Titre`, `Sous-titre`, `Titre1`..`Titre3`) whose `styles.xml` `w:name` values are the built-in `Title`, `Subtitle`, `heading 1`..`heading 3`; body: title "Rapport annuel", subtitle "Exercice 2026", heading 1 "Introduction", one paragraph, heading 2 "Contexte", heading 3 "Détails", closing paragraph "Fin." |

It proves the docx reader resolves heading levels by built-in style NAME,
not by style ID (`src/read/docx-to-ir.test.js`, "committed French-styled
fixture"): headings `[1, 1, 2, 3]`, the subtitle kept as a plain paragraph
with exactly one `heading/subtitle-degraded` loss. **Not byte-reproducible**:
the docx writer shares `@awacloud/fw`'s zip writer, which stamps a wall-clock
DOS date/time (the same note as the odt fixtures in §2) — a re-run yields
different bytes, so refresh the size and SHA-256 above whenever the fixture
is re-cut.

**Licence**: first-party repository output; no third-party content.

## 2 — `odt/` — generated in-repo via `@awacloud/odf`'s public writer (2 files)

Generator: `tests/_fixtures/gen-odt-fixtures.js` (one-shot, committed for
provenance only — the harness reads the COMMITTED bytes below and never
re-runs it). Regenerate with:

```bash
bun packages/front/office/oconv/tests/_fixtures/gen-odt-fixtures.js
```

| File | Bytes | SHA-256 | Content |
|---|---|---|---|
| `odt/odt-structured.odt` | 1958 | `e1035ef67e8d4e3888c185f2520c7e22bd135266a3078bdeee6ff69146faabb4` | 3 headings (`outlineLevel` 1/2/3), a plain + emphasised-span paragraph, a standalone hyperlink paragraph, a flat "ordered" list (3 items) and a bullet list with one nested level |
| `odt/odt-table.odt` | 1893 | `e0110e80012f31d5b282b8e5ba060f5f9a6a3653dd3fd4916fafd450dfed4a37` | a paragraph, a 2×2 `<table:table>` embedded directly in the text body as a raw XML element, a closing paragraph |

**Why a raw `<table:table>` element**: `@awacloud/odf`'s typed `text:p`/
`text:list` helpers have no table constructor for text-body content
(`table:table` is wired only for `.ods`, via `spreadsheet.js`) — the
fixture builds it as the same `{type:'element', name, attrs, children}`
shape `@awacloud/fw`'s own xml codec (`el()`/`text()`) produces, which is the
documented raw-passthrough shape every odf orchestrator accepts. It was
built to exercise **GAP-ODF-1** (the `@awacloud/odf` `textContent` reader had
no dispatch for `table:table` inside `<office:text>`), which the harness then
pinned as a documented `block/dropped` loss. **GAP-ODF-1 is RETIRED**
(office/BATCH_27: task 04 gave `odt.read()` a `<table:table>` dispatch, task
07 maps it): the raw `table:table` now READS as a real IR `table` and the
fixture converts with zero loss. The fixture is kept, bytes unchanged, as a
regression guard for that dispatch (`tests/fidelity.integration.test.js`,
"odt-table.odt — GAP-ODF-1 RETIRED"). Its opening paragraph still carries
the pre-retirement sentence as frozen fixture TEXT — content, not a claim.

**Licence**: first-party repository output — same status as the docx
corpus above; no third-party content.

## 3 — `real/` — owner-authorized real-world corpus (3 files)

Per the owner ruling
`ai/batches/types/office/BATCH_11/_OWNER-CORPUS-SOURCES.md` (2026-07-21):
a one-time network fetch, authorized for this vendoring act only (tests
never fetch). Source: **Apache POI `test-data`**
(`https://github.com/apache/poi`, `trunk` branch), repository licence
**Apache-2.0** — evidence: `legal/LICENSE` (Apache License 2.0 text) +
`legal/NOTICE` at the commit below, fetched and read on this tree; no
per-file or per-directory exception found for `test-data/`. Redistributing
these files here follows Apache-2.0 §4 (verbatim redistribution with the
licence and attribution preserved) — attribution: **Apache POI,
Copyright 2003-2026 The Apache Software Foundation**
(`https://www.apache.org/`).

**Redistribution files**: `NOTICE-apache-poi` (sha256 `a89ff8b670bcacd3e98ebee64979e0569181c7942e9ad795f4222b25e5637a61`) and
`LICENSE-apache-2.0` (sha256 `6e7c918e5a49f677c1b85a9eb2d035cd85c217fc42af6b4a336964a434001a9c`), both from the pinned commit below;
Apache-2.0 §4(a) requires the licence copy, §4(d) the NOTICE attributions.
The npm tarball excludes `tests/` (no POI bytes ship there); the
repository/source export carries this directory whole, so the files travel
with the fixtures. See §5.

- **Source commit**: `0d6d4872c491b1f230f51c6878e57407c60ae697` (`trunk`,
  fetched 2026-07-21).
- **Retrieved**: 2026-07-21, via
  `https://raw.githubusercontent.com/apache/poi/trunk/test-data/document/<name>`.
- **Selection criteria**: genuine, non-fuzzer, non-bug-crash Word-authored
  `.docx` documents, one per structural aspect not already exercised by the
  first-party corpus above (real-world list numbering, a real-world table,
  a real-world embedded raster image), kept small.

| File (vendored as) | Upstream path | git blob SHA-1 | Bytes | SHA-256 (vendored bytes) |
|---|---|---|---|---|
| `real/poi-numbering.docx` | `test-data/document/Numbering.docx` | `d5605c9f7861be2e225c74eec41c68012a233ee1` | 13808 | `776a59dcf0e290f1988602e6305e2d9cb2e31f631dc4aa751593c23cddbaad4d` |
| `real/poi-table-alignment.docx` | `test-data/document/table-alignment.docx` | `76fd85c338a1515c2ba2736953ba8424a9bc9367` | 15519 | `ee36729e0d050e529fea0b444006a194bea72b35cf8958ae58c6624c26156b41` |
| `real/poi-with-gif.docx` | `test-data/document/WithGIF.docx` | `8af42d588095b184337f09ea3a1b1a0a5d5b5245` | 20875 | `fb9f0bfa791921c43fe113005d3bb7d639ab2946c082e7d24d31e0bf73003036` |

Content, verified by unzipping and reading `word/document.xml` on this
tree before vendoring:

- **`poi-numbering.docx`** — a genuine multi-level (`ilvl` 0-3), multi-`numId`
  numbered-list document (`w:pStyle="ListParagraph"` + `w:numPr`), no
  `Heading*` styles. Real-world confirmation of the docx→md
  `list/nesting-flattened` behaviour (harness-asserted): **lossy**, one
  `list/nesting-flattened` (`numId 1 ilvl 1`).
- **`poi-table-alignment.docx`** — 6 `<w:tbl>` tables, no headings.
  Converts with **zero loss** (harness-asserted).
- **`poi-with-gif.docx`** — one `<w:drawing>` referencing an embedded
  `word/media/image1.gif`. Converts with **zero loss**; the image is kept
  as one `assets` entry (harness-asserted).

**No reader gap was found on any of these three files** — all three
convert without throwing, and every loss recorded is one already documented
from the first-party corpus (GAP-OOXML-2's sibling behaviour). Nothing here
is a new BACKLOG feed-back item.

**Odt real-world corpus: zero files.** Apache POI's `test-data` tree has no
`.odt` content at all (`ls test-data` at the commit above lists `ddf`,
`diagram`, `document`, `hmef`, `hpsf`, `hsmf`, `integration`, `openxml4j`,
`poifs`, `publisher`, `slideshow`, `spreadsheet`, `xmldsign` — POI does not
implement ODF). The only other source named by the owner ruling
(LibreOffice `contrib/test-files`) was checked and **rejected** — see §4.
This is the plan's own honest fallback, scoped exactly to the format the
LibreOffice source would have covered: **the fidelity claim for `odt→md`
real-world documents is not made** — `odt→md` is proven against the
first-party-generated fixtures in §2 only. `docx→md` IS additionally proven
against the three real-world files above.

## 4 — LibreOffice `contrib/test-files` — checked and REJECTED (license-contamination check)

Per the owner ruling's mandatory, fail-closed licence-contamination check:
only vendor a file whose licence is **explicit** and permits
redistribution here. Checked on 2026-07-21, via the https mirror
`https://cgit.freedesktop.org/libreoffice/contrib/test-files/`:

- Repository root tree (`tree/`) listing: `.git-hooks`, `.gitignore`,
  `Makefile`, `base/`, `calc/`, `draw/`, `general/`, `impress/`,
  `install_git_hooks`, `loperf/`, `loperf_suites/`, `math/`, `metafile/`,
  `ooxml-strict/`, `writer/` — **no `LICENSE`, `NOTICE`, `COPYING`, or
  `README` file anywhere at the root.**
- `writer/` subtree (where `.odt` candidates would live): `encrypt/`,
  `litmus/`, `numbering/`, `pictures/`, `redlines/`, `runs/`, `sections/`,
  `tables/`, `vml/` — category subdirectories only, again **no licence or
  attribution file**.

This confirms, rather than merely assumes, the owner ruling's own warning
("many files originate from bug-report attachments") — the git tree
carries **no explicit, repo-wide licence grant** and no per-file/per-folder
one was found either. Per the fail-closed rule: **REJECTED in full.** No
individual candidate file was downloaded or inspected further, since the
licence gate is checked before content selection, not after — a
structurally interesting `.odt` found this way would still fail the same
gate. **Absence of a usable file from this source is the acceptable,
documented outcome the owner ruling names explicitly**, not a lowered bar.

## 5 — Licence files (Apache POI NOTICE and Apache-2.0 text)

The vendored Apache POI fixtures — `real/*.docx` (§3), `pptx/poi-*.pptx` and
`xlsx/poi-*.xlsx` — are joined by two files placed once at this directory's
root, covering all three directories. Both are byte-exact copies (LF line
endings, no edits) of the upstream files at the pinned commit
`0d6d4872c491b1f230f51c6878e57407c60ae697`:

| File | Upstream path | Bytes | SHA-256 |
|---|---|---|---|
| `NOTICE-apache-poi` | `legal/NOTICE` | 1571 | `a89ff8b670bcacd3e98ebee64979e0569181c7942e9ad795f4222b25e5637a61` |
| `LICENSE-apache-2.0` | `legal/LICENSE` | 14416 | `6e7c918e5a49f677c1b85a9eb2d035cd85c217fc42af6b4a336964a434001a9c` |

Sources: `https://raw.githubusercontent.com/apache/poi/0d6d4872c491b1f230f51c6878e57407c60ae697/legal/NOTICE`
and `…/legal/LICENSE`. Verify with `sha256sum NOTICE-apache-poi LICENSE-apache-2.0`.

Apache-2.0 §4(a) requires a copy of the licence to accompany redistributed
works, and §4(d) requires the NOTICE attributions to be carried along; these
two files do both. The npm tarball excludes `tests/`
(`tests/pack-surface.integration.test.js` pins it), so no POI bytes ship
there; the repository/source export carries this directory whole, so the
files travel with the fixtures. The fixtures themselves are kept in place.
The `pptx/` and `xlsx/` pages point back here.

## Refresh procedure

1. **docx spike corpus** — never regenerate (GAP-OOXML-4); if the spike
   corpus is ever re-cut, re-copy the bytes here and update the SHA-256s
   above, noting the re-cut in this file. The generated
   `docx/docx-fr-styles.docx` (§1b) is re-cut by its own generator; update
   its size and SHA-256 afterwards.
2. **odt fixtures** — re-run `bun packages/front/office/oconv/tests/
   _fixtures/gen-odt-fixtures.js`, recompute the SHA-256s (it will NOT be
   byte-identical to the values above — the odt writer shares the same
   `@awacloud/fw` zip writer as docx, GAP-OOXML-4 applies here too), update this
   file, re-run the harness.
3. **Real-world corpus** — re-fetch from the pinned commit if a refresh is
   ever needed; re-run the licence check (§4's method) before adding any
   new candidate, LibreOffice or otherwise. If the pinned commit moves,
   re-copy `legal/NOTICE` and `legal/LICENSE` (§5) and update their
   SHA-256s here and in the `pptx/` and `xlsx/` pages.
4. Always re-run `bun test packages/front/office/oconv/` after touching
   anything in this directory.
