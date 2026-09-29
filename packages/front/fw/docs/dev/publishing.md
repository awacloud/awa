# Publishing & CDN

> The `@awacloud/fw` npm package is **lean** (consumer); full transparency (tests + `tests/_vectors`) lives in the **git repo** and via **jsDelivr-GitHub**. See [§ Applied](#applied).

## Applied

`package.json#files` publishes a **lean** tarball: `src/**/*.{js,md,bin}` (code, excluding tests/kat), `types/**/*.d.ts`, `dist/types/**/*.d.ts(.map)`, `dist/build/*.min.js` + `*.meta.json` + `*.bin` (no dev bundles nor JS-side `.map`), `tools/rendering/**/*.js` + `tools/_lib/cli-help.js` (fw-private tooling only — the mutualized `fw-bundler`/`fw-codegen` tools ship in their own packages, not here), `integrations/**/*.{js,d.ts,md,json}` (excluding `_e2e`), `docs` (excluding `api-generated`), `fw.config.json`, `README.md`, `CHANGELOG.md` — every `*.test.js`/`*.kat.js`/`*.test.html`/`_fixtures/**` excluded throughout. Measured (`npm pack --dry-run`, `packages/front/fw`): **2.4 MB compressed / 8.4 MB uncompressed, 1065 files** (vs 44 MB / 106 MB for the full tree).

## Publication status

`@awacloud/fw` is ratified in the publishable set (lot 1, `Apache-2.0`, owner ruling #2) with `notice.required: false`. The repo has not published anything yet — the monorepo's export-pipeline and licence-stamp tooling is dry-run-only, used to gate and measure the export tree ahead of any real publication decision.

**Transparency (tests, `tests/_vectors`, KAT)** — outside the npm tarball, accessible:

- **git clone** of the repo (everything is present) → `bun run test`, full audit;
- **jsDelivr-GitHub** by URL, without installing: `https://cdn.jsdelivr.net/gh/<org>/<repo>@<tag>/packages/front/fw/tests/_vectors/...`.

**CDN consumption** (from publication, zero config):

- `https://cdn.jsdelivr.net/npm/@awacloud/fw@<v>/dist/build/fw.site.min.js` (self-contained ESM); `sanity.min.js` as a classic `<script>`;
- `https://esm.sh/@awacloud/fw/io/codec/hex.js` for subpaths.

---

## Decision record

Option A (lean npm package, transparency via git + jsDelivr-GitHub) **and**
Option C (`dist/build` ships `.min.js`/`.meta.json` only, no dev bundles or
`.map`) were both applied to `package.json#files`, 2026-08. The original
investigation (44 MB / 106 MB full-tree measurement, Option A/B/C tradeoffs)
is superseded by the ratified data in `docs/publication/` (§ Publication status above).
