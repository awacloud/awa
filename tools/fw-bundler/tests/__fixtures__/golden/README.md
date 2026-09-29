# Golden fixtures — bundle + standalone (frozen fw input)

Committed reference output of `@awacloud/tool-fw-bundler` run against
`packages/front/fw` **extracted from git history at `MANIFEST.json`'s
`captureSha`** (see `tests/golden-fw.js`). The suites re-anchored here
(`bundle.integration.test.js`, `standalone.integration.test.js`) used to
spawn/import fw's original build scripts as live oracles; those originals
were later removed from fw, so the oracle became these fixtures.

**Provenance**: captured with `capture-goldens.mjs` at
`captureSha = 15ae672` (the last master state where the fw originals
existed), and proven **byte-identical to the originals' own output** on that
same input in the pre-rewrite parity run — so a test failing
against these goldens means the ported tool's behavior drifted from the
tools it replaced.

**Stamp-free output (D35(b))**: the tool emits no meta
`builtAt` field, no `// Built:` banner and no Bun `//# debugId=` trailer, so
the three normalizations that used to excuse those tokens are GONE from both
sides — `capture-goldens.mjs` and `bundle.integration.test.js` /
`standalone.integration.test.js`. A stamp reappearing in the output now FAILS
the golden compare (and `capture-goldens.mjs` refuses to regold it at all,
`assertStampFree`) instead of being silently normalized away.

**Surviving symmetric normalization** (one, applied identically at capture and
compare):

- `*.meta.json`: `bytes` + `hashSha256` values → `<n>` / `<sha256>`. The
  non-minified bundle embeds one `// <path>` comment per module (resolved
  relative to the build process's cwd), making its sizes/hashes
  build-location-dependent; byte-identity regression is carried by the min.js
  goldens, which are compared RAW.

`hex.standalone.js` and `*.pure.min.js` are goldened and compared as RAW
bytes.

**Regold procedure** (`bun tools/fw-bundler/tests/capture-goldens.mjs
[<sha>]`, no arg = re-capture at the current `captureSha`): needed when a
Bun upgrade changes the minifier's output of the `*.min.js` goldens (the
audit/standalone/meta goldens are Bun-version-insensitive). After the fw
cut-over the originals no longer exist, so a regold re-captures from the
ported tool — review the diff deliberately: it converts the fixtures from
"parity with the replaced originals" to "snapshot of the ported tool".
