# Golden fixtures — audit (frozen fw input)

Committed reference output of `@awacloud/tool-fw-codegen audit` run against
`packages/front/fw` **extracted from git history at `MANIFEST.json`'s
`captureSha`** (see `tests/golden-fw.js`). The golden-compare describe in
`audit.integration.test.js` used to spawn fw's original `tools/types/audit`
script as a live oracle; that original was later removed from fw, so the
oracle became these fixtures.

**Provenance**: captured with `capture-goldens.mjs` at
`captureSha = 15ae672` (the last master state where the fw originals
existed), and proven **byte-identical to the original script's stdout** on
that same input in the pre-rewrite parity run — so a test failing
against these goldens means the ported tool's behavior drifted from the
script it replaced.

The audit render is plain text with no build-instance metadata: the compare
is a raw byte compare, no normalization, Bun-version-insensitive.

**Regold procedure**: `bun tools/fw-codegen/tests/capture-goldens.mjs
[<sha>]` (no arg = re-capture at the current `captureSha`). Only needed if
the audit render format changes deliberately — review the diff: after the fw
cut-over a regold re-captures from the ported tool, converting the fixture
from "parity with the replaced original" to "snapshot of the ported tool".
