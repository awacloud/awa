# `@awacloud/oconv` pptx corpus — provenance & licence

> Own provenance record for this directory only (per the durable rule,
> `ai/memory/types/office.md` 2026-07-21: "never append to another task's
> provenance file"). Sibling to `../PROVENANCE.md` (BATCH_11's docx/odt
> corpus) and `../odp/PROVENANCE.md` (this task's first-party odp corpus).
> Same `references/` rule applies: nothing under `tests/` reads from
> `references/` — every byte here is committed in this directory.

Three files, owner-authorized real-world corpus. Per the same fail-closed
recipe BATCH_11 established (`ai/memory/types/office.md`, "corpus
licensing, reusable recipe"): licence gate BEFORE content selection.
Source: **Apache POI `test-data`** (`https://github.com/apache/poi`,
`trunk` branch), repository licence **Apache-2.0**.

- **Source commit**: `0d6d4872c491b1f230f51c6878e57407c60ae697` — the SAME
  commit BATCH_11's own docx/odt corpus was cut from (`../PROVENANCE.md`
  §3), re-verified rather than re-picked: a repository's licence status at
  a fixed commit does not change directory to directory, so the check
  below re-confirms rather than re-establishes it.
- **Licence evidence, re-checked 2026-07-22** (this task, this commit):
  `legal/LICENSE` (Apache License 2.0 text, fetched and read on this tree)
  + `legal/NOTICE` ("Apache POI, Copyright 2003-2026 The Apache Software
  Foundation") — no per-file or per-directory exception found for
  `test-data/slideshow/`. Redistributing these files here follows
  Apache-2.0 §4 (verbatim redistribution with the licence and attribution
  preserved) — attribution: **Apache POI, Copyright 2003-2026 The Apache
  Software Foundation** (`https://www.apache.org/`).
- **Retrieved**: 2026-07-22, via
  `https://raw.githubusercontent.com/apache/poi/<commit>/test-data/slideshow/<name>`.
- **Redistribution files**: the POI `legal/NOTICE` and Apache-2.0 licence
  text for this directory live once at the corpus root —
  `../NOTICE-apache-poi` (sha256 `a89ff8b670bcacd3e98ebee64979e0569181c7942e9ad795f4222b25e5637a61`) and `../LICENSE-apache-2.0`
  (sha256 `6e7c918e5a49f677c1b85a9eb2d035cd85c217fc42af6b4a336964a434001a9c`), both from the pinned commit above (see `../PROVENANCE.md`
  §3 and §5). Apache-2.0 §4(a) requires the licence copy, §4(d) the NOTICE
  attributions; the npm tarball excludes `tests/`, the repository/source
  export carries them with these fixtures.
- **Selection criteria**: genuine, non-fuzzer, non-bug-crash
  PowerPoint-authored `.pptx` files (excluded every
  `clusterfuzz-testcase-*` and ambiguous `bug*` name in the directory
  listing), one per structural aspect the first-party unit tests
  (`../../src/read/pptx-to-ir.test.js`) already exercise with hand-built
  bytes: genuine title+body text, a real table, real embedded pictures.
  Kept small.

| File (vendored as) | Upstream path | git blob SHA-1 | Bytes | SHA-256 (vendored bytes) |
|---|---|---|---|---|
| `poi-sampleshow.pptx` | `test-data/slideshow/SampleShow.pptx` | `4496c269530b69ad70631e2543f8c3a360866238` | 39083 | `bfb4b2f07c9233afd2f32aa5781d849d0c7d225bf03721a10becf487b481d828` |
| `poi-table.pptx` | `test-data/slideshow/table_test.pptx` | `451a6dce78b982a0e12cf51d35c49590ef3c0baa` | 28935 | `b9c3eb4b198ef3e53a4ff1a5ef4118a5ce6ba1760592c553abf665b37dcac5f8` |
| `poi-pictures.pptx` | `test-data/slideshow/crop-to-0.pptx` | `71cdafa21e42058368ce2b02671ad78dbf38460b` | 10314 | `5d6aa3a226c6257592e3d97d4a4a4e4832c16411116d97e70676f38dc5a525c5` |

Content, confirmed by running `oconvPptxToIr.pptxToIr()` (this task's own
reader, `../../src/read/pptx-to-ir.js`) against each file on this tree
before vendoring:

- **`poi-sampleshow.pptx`** — 2 genuine slides, `ctrTitle`/`title`
  placeholders + subtitle/body placeholders, real prose (incl. a smart
  apostrophe — non-ASCII text handled). Converts with **zero loss**: every
  paragraph maps, both titles map.
- **`poi-table.pptx`** — 1 slide holding only a `<p:graphicFrame>` table,
  no title, no other text shape. Real-world confirmation of the
  `slides/media-dropped` (detail `table`) + `slides/untitled` combination:
  **lossy**, exactly `[{code: 'slides/media-dropped', detail: 'table'},
  {code: 'slides/untitled', detail: ''}]`.
- **`poi-pictures.pptx`** — 3 slides, each holding only a `<p:pic>`
  picture, no title, no other text shape. Real-world confirmation of the
  same combination repeated per slide: **lossy**, 3×
  `slides/media-dropped` (detail `picture`) interleaved with 3×
  `slides/untitled`, in slide order.

**No reader gap was found on any of these three files** — all three
convert without throwing, and every loss recorded is one already covered
by the reader's own unit tests. Nothing here is a new BACKLOG feed-back
item (the pptx speaker-notes gap is a SEPARATE, already-documented item —
see `../../src/read/pptx-to-ir.js`'s own module header — and none of
these three files were used to discover it).

## Refresh procedure

1. Re-fetch from the pinned commit if a refresh is ever needed; re-run the
   licence check (this file's own method) before adding any new candidate.
2. Always re-run `bun test packages/front/office/oconv/` after touching
   anything in this directory.
