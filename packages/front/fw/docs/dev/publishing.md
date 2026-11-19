# Publishing & CDN

> The `@awacloud/fw` npm package is **lean** (consumer); full transparency (tests + `tests/_vectors`) lives in the **git repo** and via **jsDelivr-GitHub**. See [§ Applied](#applied).

## Applied

`package.json#files` publishes a **lean** tarball: `src/**/*.{js,md,bin}` (code, excluding tests/kat), `types/**/*.d.ts`, `dist/types/**/*.d.ts(.map)`, `dist/build/*.min.js` + `*.meta.json` + `*.bin` (no dev bundles nor JS-side `.map`), `tools/rendering/**/*.js` + `tools/_lib/cli-help.js` (fw-private tooling only — the mutualized `fw-bundler`/`fw-codegen` tools ship in their own packages, not here), `integrations/**/*.{js,d.ts,md,json}` (excluding `_e2e`), `docs` (excluding `api-generated`), `fw.config.json`, `README.md`, `CHANGELOG.md` — every `*.test.js`/`*.kat.js`/`*.reference.js`/`*.test.html`/`_fixtures/**` excluded throughout. A `<module>.reference.js` is the logical (rolled) implementation kept beside a flattened crypto module; it lives in the git repository only. Measured (`npm pack --dry-run`, `packages/front/fw`): **2.4 MB compressed / 8.4 MB uncompressed, 1065 files** (vs 44 MB / 106 MB for the full tree).

## Publication status

`@awacloud/fw` is in the monorepo's publishable set (`Apache-2.0`), with no NOTICE requirement of its own. The repo has not published anything yet — the monorepo's export-pipeline and licence-stamp tooling is dry-run-only, used to gate and measure the export tree ahead of any real publication decision.

**Transparency (tests, `tests/_vectors`, KAT)** — outside the npm tarball, accessible:

- **git clone** of the repo (everything is present) → `bun run test`, full audit;
- **jsDelivr-GitHub** by URL, without installing: `https://cdn.jsdelivr.net/gh/<org>/<repo>@<tag>/packages/front/fw/tests/_vectors/...`.

**CDN consumption** (from publication, zero config):

- `https://cdn.jsdelivr.net/npm/@awacloud/fw@<v>/dist/build/fw.site.min.js` (self-contained ESM); `sanity.min.js` as a classic `<script>`;
- `https://esm.sh/@awacloud/fw/io/codec/hex.js` for subpaths.

---

## Decision record

Two choices shape `package.json#files` (2026-08): the npm package stays lean,
with transparency through git and jsDelivr-GitHub; and `dist/build` ships
`.min.js` / `.meta.json` only, no dev bundles or `.map`. The full-tree
measurement behind them (44 MB / 106 MB) is superseded by the publication
data of the source repository (§ Publication status above).
