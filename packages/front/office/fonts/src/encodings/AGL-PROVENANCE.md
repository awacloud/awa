# AGL (`glyphlist.txt`) vendoring — provenance & licence gate

> **Status: VENDORED.** `glyphlist.txt` was fetched with explicit user
> authorization (2026-07-22) from `adobe-type-tools/agl-aglfn` at a pinned
> commit, its licence confirmed (BSD-3-Clause), and `src/encodings/aglTable.js`
> generated from it via `tools/gen-agl-table.mjs`. The AGL copyright +
> licence notice travels inline in the header of the vendored
> `glyphlist.txt` itself, satisfying the BSD-3-Clause "retain the above
> copyright notice" condition.

## Licence

`adobe-type-tools/agl-aglfn` is licensed **BSD-3-Clause** ("New"/"Revised"),
Copyright 2002–2019 Adobe (http://www.adobe.com/). The licence permits
redistribution in source form provided the copyright notice, the list of
conditions, and the disclaimer are retained — all three are present inline
at the top of the vendored `glyphlist.txt`. Licence text read from
`LICENSE.md` at the pinned commit (identical to the header carried inside
`glyphlist.txt`):

> Redistribution and use in source and binary forms, with or without
> modification, are permitted provided that the following conditions are
> met: Redistributions of source code must retain the above copyright
> notice, this list of conditions and the following disclaimer. […]
> Neither the name of Adobe nor the names of its contributors may be used
> to endorse or promote products derived from this software without
> specific prior written permission. […]

## Regeneration

`aglTable.js` is generated, never hand-edited. To re-vendor / regenerate:
1. Fetch `glyphlist.txt` from the pinned commit below, save verbatim at
   `src/encodings/glyphlist.txt`, and confirm `LICENSE.md` still grants
   redistribution.
2. Set `PINNED_SHA` in `tools/gen-agl-table.mjs` to the commit SHA.
3. Run `bun tools/gen-agl-table.mjs` from the package root (byte-idempotent
   on re-run against the same input).
4. Run `bun test packages/front/office/fonts/` and
   `bun cli.ts coverage-gate --scopes packages/front/office/fonts/`.

## Provenance record

| Field | Value |
|---|---|
| Repository | `adobe-type-tools/agl-aglfn` |
| URL | `https://github.com/adobe-type-tools/agl-aglfn` |
| Vendored file | `glyphlist.txt` |
| Pinned commit SHA | `4036a9ca80a62f64f9de4f7321a9a045ad0ecfd6` |
| Retrieval date | `2026-07-22` |
| Vendored path | `src/encodings/glyphlist.txt` |
| SHA-256 (vendored bytes) | `a3b2f61ced9f3644cc0d4ecde5c59df34ca286c689d9484a43a710a81c466789` |
| Size / entries | 78060 bytes · 4281 name→code-point entries |
| Licence | `BSD-3-Clause` (Copyright 2002–2019 Adobe) — confirmed |
| Licence evidence | `LICENSE.md` @ 4036a9ca (SPDX `BSD-3-Clause`); notice also inline in `glyphlist.txt` header |

## Scope note

Only `glyphlist.txt` (AGL, name → Unicode) is in scope. AGLFN (the
reverse, Unicode → name-for-new-fonts list) is explicitly out of scope:
it is not needed for text extraction.
