# Vendored Adobe Core 14 AFM metrics — provenance

**Metrics only — no font program is vendored.** These files are Adobe Font Metric
(AFM) text files: glyph widths, bounding boxes and kerning data. No Type 1 / CFF /
TrueType outline data is present in this directory.

Consumed by `packages/front/office/fonts/src/standard14` via
`tools/gen-standard14-widths.mjs` (office/BATCH_33 task 03).

## Upstream

Adobe Core 14 AFM set (a subset of Adobe's "Core 35 AFM Files with 314 Glyph
Entries" distribution), as redistributed by the Debian `pmw` package
(Philip Hazel's Philip's Music Writer), directory `fontmetrics/`.

| Field | Value |
|---|---|
| Source URL | `https://salsa.debian.org/wouter/pmw/-/archive/debian/pmw-debian.zip?ref_type=heads&path=fontmetrics` |
| Repository | `https://salsa.debian.org/wouter/pmw` |
| Branch | `debian` |
| Commit | `f827a29ec1de852061a8ea653dd2fc881df271dd` (short `f827a29e`, committed 2023-08-26) |
| Archive sha256 | `60da0a42036362c35d47d8c772c266a90550bf8dbc7e8924b61a0d642c498ad9` |
| Archive size | 326 967 bytes |
| Retrieved (UTC) | 2026-09-02 |

The archive is path-filtered to `fontmetrics/` and unpacks to
`pmw-debian-fontmetrics/fontmetrics/`; the top-level directory name therefore
carries no commit hash, and the commit above was resolved from the Salsa GitLab
API for branch `debian`
(`https://salsa.debian.org/api/v4/projects/wouter%2Fpmw/repository/branches/debian`).

The `debian/copyright` record was fetched separately from
`https://salsa.debian.org/wouter/pmw/-/raw/debian/debian/copyright`
(sha256 `0211ae4d18a53f6e3fef2c8e0f88d1886e85be5250928fddad80ae87dd154313`).

## Vendored files

All six AFMs were copied byte-identically from the archive (sha256 verified
before and after the copy).

| File | sha256 | bytes | FontName | Adobe version line |
|---|---|---|---|---|
| `Helvetica.afm` | `f2caa7e16f9737b9bd8850247c6f5cb43d9bf9238892d09870be244bfb5fb10f` | 76693 | `Helvetica` | `StartFontMetrics 4.1` / `Version 002.000` |
| `Helvetica-Bold.afm` | `2321d58fbb96eb8220970f224aba63daf3f6dffa21ceba572d354f25274f3cce` | 71664 | `Helvetica-Bold` | `StartFontMetrics 4.1` / `Version 002.000` |
| `Times-Roman.afm` | `5ced7d1191e05ca2cba556a1acf082f21fec3304251b609d0711a21a35b20bc2` | 62854 | `Times-Roman` | `StartFontMetrics 4.1` / `Version 002.000` |
| `Times-Bold.afm` | `82592d38193cecda0e62298aec2d6153fdcd8f67cc167b187998e1570a0c8d85` | 66651 | `Times-Bold` | `StartFontMetrics 4.1` / `Version 002.000` |
| `Times-Italic.afm` | `768be587d8c57e31e44dd88d36788a53a12bf8f153beca81ee8e77992a242183` | 68655 | `Times-Italic` | `StartFontMetrics 4.1` / `Version 002.000` |
| `Times-BoldItalic.afm` | `390a91f7b0a15a37e05f7a7f39808e6a579ef37dabe29d7d7c110309202a94e1` | 61973 | `Times-BoldItalic` | `StartFontMetrics 4.1` / `Version 002.000` |
| `NOTICE-adobe-afm.html` | `8c5c7334b73aa4ab2c23a971ff9c922d01ac3bce9fde95d9a1edd386c3e9367c` | 999 | — | Adobe `MustRead.html`, verbatim |

`Helvetica-Bold.afm`, `Times-Bold.afm`, `Times-Italic.afm` and
`Times-BoldItalic.afm` are the metrics required by BL-954; `Helvetica.afm` and
`Times-Roman.afm` are vendored as the cross-check baseline.

### Upstream modifications, as noted in the files themselves

The Adobe licence requires that modifications be prominently noted in the
modified files. Each vendored AFM carries such notes from the pmw maintainer
(initials `PH`, Philip Hazel) directly under the Adobe copyright comment, e.g.
in `Helvetica.afm`:

```
Comment PH added entry for Euro character, copied from a different version, 19 July 2009.
Comment PH added additional characters (after Euro) 18 November 2013
Comment PH added NBspace (character 160) 24 November 2019
```

The same three notes appear in all six files (with per-file dates of
16–18 November 2013 for the "additional characters" line). Consequently these
files carry 362 glyph entries rather than the 314 of Adobe's original
distribution; the added entries are appended after the original Adobe set. No
further modification was made when vendoring here.

## Licence basis

### (a) Adobe notice lines inside the AFMs (verbatim)

`Helvetica.afm` and `Helvetica-Bold.afm`:

```
Comment Copyright (c) 1985, 1987, 1989, 1990, 1997 Adobe Systems Incorporated.  All Rights Reserved.
Notice Copyright (c) 1985, 1987, 1989, 1990, 1997 Adobe Systems Incorporated.  All Rights Reserved.Helvetica is a trademark of Linotype-Hell AG and/or its subsidiaries.
```

`Times-Roman.afm`, `Times-Bold.afm`, `Times-Italic.afm`, `Times-BoldItalic.afm`:

```
Comment Copyright (c) 1985, 1987, 1989, 1990, 1993, 1997 Adobe Systems Incorporated.  All Rights Reserved.
Notice Copyright (c) 1985, 1987, 1989, 1990, 1993, 1997 Adobe Systems Incorporated.  All Rights Reserved.Times is a trademark of Linotype-Hell AG and/or its subsidiaries.
```

### (b) Adobe's AFM licence text — `MustRead.html`

Vendored verbatim beside the AFMs as **`NOTICE-adobe-afm.html`**. Its operative
paragraph, quoted verbatim:

> This file and the 35 PostScript(R) AFM files it accompanies may be used,
> copied, and distributed for any purpose and without charge, with or without
> modification, provided that all copyright notices are retained; that the AFM
> files are not distributed without this file; that all modifications to this
> file or any of the AFM files are prominently noted in the modified file(s);
> and that this paragraph is not modified. Adobe Systems has no responsibility
> or obligation to support the use of the AFM files.

**Obligation:** the AFM files must not be distributed without this notice file.
`NOTICE-adobe-afm.html` must therefore travel with these AFMs in any
redistribution, and must not be removed from this directory.

### (c) The stanza of `debian/copyright` covering `fontmetrics/` (verbatim)

`debian/copyright` introduces the fontmetrics licence and then embeds
`fontmetrics/LICENCE` verbatim between markers (reproduced here exactly, in a
code block so the original line breaks and indentation are preserved):

```
The source package also ships with several font files that are necessary to
produce correct PostScript output. These are under the following license:

======Begin fontmetrics/LICENCE file======
These AFM fonts have been relicensed by Adobe under a free license at different
points in time.

===============================================================================
From Adobe-Core35_AFMs-314.tar.gz:
Adobe Core 35 AFM Files with 314 Glyph Entries - ReadMe

                    This file and the 35 PostScript(R) AFM files it
                    accompanies may be used, copied, and distributed for any
                    purpose and without charge, with or without modification,
                    provided that all copyright notices are retained; that
                    the AFM files are not distributed without this file; that
                    all modifications to this file or any of the AFM files
                    are prominently noted in the modified file(s); and that
                    this paragraph is not modified. Adobe Systems has no
                    responsibility or obligation to support the use of the
                    AFM files.
```

The file list that follows that paragraph in `fontmetrics/LICENCE` names
`Helvetica.afm`, `Helvetica-Bold.afm`, `Times-Roman.afm`, `Times-Bold.afm`,
`Times-Italic.afm`, `Times-BoldItalic.afm` and `MustRead.html` among the covered
files, and adds: "Some of the filenames have been changed in this distribution,
dropping the ITC prefix."

Note that pmw's own source is GPL-2+ (Philip Hazel); that licence covers the
program, **not** these AFM files, which are covered solely by the Adobe grant
quoted above. No pmw program code is vendored here.

## Sanity check against the W3b spike

Width of glyph `A` (`C 65 ; WX <w> ; N A ;`), expected values recorded by the
W3b spike:

| File | Expected `A` | Found | Result | Source line |
|---|---|---|---|---|
| `Helvetica.afm` | 667 | 667 | OK | `C 65 ; WX 667 ; N A ; B 14 0 654 718 ;` |
| `Helvetica-Bold.afm` | 722 | 722 | OK | `C 65 ; WX 722 ; N A ; B 20 0 702 718 ;` |
| `Times-Roman.afm` | 722 | 722 | OK | `C 65 ; WX 722 ; N A ; B 15 0 706 674 ;` |
| `Times-Bold.afm` | 722 | 722 | OK | `C 65 ; WX 722 ; N A ; B 9 0 689 690 ;` |
| `Times-Italic.afm` | 611 | 611 | OK | `C 65 ; WX 611 ; N A ; B -51 0 564 668 ;` |
| `Times-BoldItalic.afm` | 667 | 667 | OK | `C 65 ; WX 667 ; N A ; B -67 0 593 683 ;` |

Bold-vs-regular divergence (the point of BL-954): `Helvetica.afm` and
`Helvetica-Bold.afm` both declare 362 glyph names, all 362 in common, of which
**141 differ in advance width** — far above the ≥20 threshold the check
required. Examples: `A` 667→722, `B` 667→722, `J` 500→556, `Hbar` 785→752,
`IJ` 700→808.

All checks passed; nothing was corrected or normalised.
