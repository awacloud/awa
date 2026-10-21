# A few OFL faces — provenance and licences

Every face below is licensed under the SIL Open Font License, Version
1.1. The files are copied byte for byte (per-file SHA-256 in
`MANIFEST.json`), not modified, and each family's licence file travels
beside it. Fetched 2026-10-13 with `bun cli.ts references fetch <entry>`
(entries in `references/OFFICE-CORPUS/sources.json`).

## Source Sans 3 — Adobe

| Field | Value |
|---|---|
| Files | `vendor/source-sans/SourceSans3-Regular.otf` (from `OTF/`), `vendor/source-sans/SourceSans3VF-Upright.otf` (from `VF/`) |
| Source | <https://github.com/adobe-fonts/source-sans>, tag `3.052R` (release of 2023-04-04) |
| Licence | the repository's `LICENSE.md` at that tag, copied byte for byte as `vendor/source-sans/LICENSE.md`: "Copyright 2010-2022 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'. All Rights Reserved. Source is a trademark of Adobe in the United States and/or other countries. This Font Software is licensed under the SIL Open Font License, Version 1.1." |
| OFFICE-CORPUS entries | `office-ofl-source-sans-3-regular`, `office-ofl-source-sans-3-vf-upright`, `office-ofl-source-sans-license` |

## Kalnia Glaze — The Kalnia Glaze Project Authors

| Field | Value |
|---|---|
| File | `vendor/kalnia-glaze/KalniaGlaze[wdth,wght].ttf` |
| Source | <https://github.com/google/fonts>, commit `66928797f271fed5ee428544e7229685e2d90127` (main, 2026-10-12), `ofl/kalniaglaze/`; designer Frida Medrano, project <https://github.com/fridamedrano/Kalnia-Glaze> |
| Licence | `ofl/kalniaglaze/OFL.txt` at that commit, copied byte for byte as `vendor/kalnia-glaze/OFL.txt`: "Copyright 2022 The Kalnia Glaze Project Authors (https://github.com/fridamedrano/Kalnia-Glaze). This Font Software is licensed under the SIL Open Font License, Version 1.1." (the directory's `METADATA.pb`: `license: "OFL"`) |
| OFFICE-CORPUS entries | `office-ofl-kalnia-glaze`, `office-ofl-kalnia-glaze-license` |

## Liberation Sans — reused, not copied

The Liberation Sans Regular face the test reads is the one
`packages/front/office/oconv-fonts/vendor/liberation/` already vendors
(Liberation Fonts 2.1.5, SIL OFL 1.1 with Reserved Font Names
Liberation, Arimo, Tinos, Cousine): its provenance, notice and licence
live there (`PROVENANCE.json`, `NOTICE-liberation`, `OFL.txt`).
`MANIFEST.json` records its path and SHA-256, which the test checks
against that `PROVENANCE.json`.
