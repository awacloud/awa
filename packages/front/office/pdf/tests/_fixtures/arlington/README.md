# Arlington PDF Model files

Third-party model files read by
`tests/arlington-read-keys.integration.test.js` through the shared harness
`tests/_helpers/arlington.js`: the `tsv/latest` tree of the PDF
Association's *Arlington PDF Model* at commit `c48b363e9` — **613 files**
(492,790 bytes), one per PDF object of ISO 32000-2:2020 with its errata,
one row per key. Copied byte for byte. Licence and attribution:
[`PROVENANCE.md`](PROVENANCE.md). These files are test fixtures only and
are not part of the published package (`package.json` `files` does not
list `tests/`).

## Layout

- `vendor/tsv/<Object>.tsv` — each file keeps its upstream name
  (`tsv/latest/Catalog.tsv` upstream). Under a `vendor/` segment, as
  third-party bytes, which the repository's licence-header stamping never
  touches.
- `MANIFEST.json` — the commit, the SHA-256 of the upstream archive, the
  tree, the selection rule and, per file, its name, byte count and
  SHA-256; `upstreamNotices` lists the two licence files the same way. The
  test checks every file against it and refuses unlisted files.
- `UPSTREAM-LICENSE.txt`, `UPSTREAM-NOTICE.txt` — the repository's
  `LICENSE` and `NOTICE.txt`, byte for byte.
- `.gitattributes` — `* -text`: git never converts these bytes.

## What the test measures

For each Arlington object, how many of its keys the package's read model
types. The rules live in `tests/_helpers/arlington.js`; in short:

- **Measured keys** — every named key of a dictionary or stream object
  whose since-version is not a bare `fn:Extension(…)` (an extension that
  ISO 32000-2 did not adopt). Array objects (entries are positions), maps
  (entries under arbitrary names), wildcard entries and extension keys are
  listed as skipped, with the reason.
- **The dictionary** — every measured key of the object, each with a value
  of its first Arlington type that is not the key's default (a typer that
  applies the default to an absent key could not tell them apart): a
  possible value when the model gives a literal one (preferring one valid
  in PDF 2.0), else a generic value of the type; a linked object's
  required entries two levels deep, one item for an any-length array of
  scalars or references, an indirect reference where the model requires
  one. A few keys whose model row is looser than the
  ISO 32000-2 text get a stated value (`OVERRIDES`, each with its clause).
- **The typers** — a hand table (`BINDINGS`) from Arlington object to the
  package's public typer functions, core and opt-in extras alike; the
  annotation and action dispatchers run with the package's subtype
  typers. An object with no typer counts every measured key as not
  handled.
- **Handled** — a bound typer returns on the dictionary and either leaves
  the key out of its record's `_extras`, or, for a typer with no `_extras`
  channel, returns something else once the key is removed or its value
  replaced by `null`. A key counts when one of the object's typers handles
  it.

A stricter variant (`measure(model, BINDINGS, { surfaced: true })`)
counts a key only when it reaches the typed record: every typer is judged
by the remove-or-null probe, with `_extras` left out of the comparison,
so a key a typer lists as known but keeps only in `raw` does not count.

The test pins both scores, the bound and unbound object counts and every
typer that throws on the dictionary built for its object, with the reason.
The same harness gives the `arlington-read-keys` and
`arlington-read-keys-surfaced` suites of `tools/office-scorecard`.
