// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/tests/capture-goldens.mjs
//
// Regold script for the bundle + standalone golden fixtures
// (tests/__fixtures__/golden/). Usage:
//   bun tools/fw-bundler/tests/capture-goldens.mjs [<captureSha>]
// Without an argument it re-captures at the MANIFEST's existing captureSha.
// Provenance + regold policy: see tests/__fixtures__/golden/README.md.
//
// The emitted output is STAMP-FREE (BL-697 / BL-698): no meta `builtAt`, no
// `// Built:` banner, no Bun `//# debugId=` trailer — so the normalizers that
// used to neutralize those three tokens are gone here AND on the compare side,
// symmetrically. `*.min.js` and the standalone ESM are goldened RAW.
//
// The ONE surviving normalization is SYMMETRIC with the compare side in
// bundle.integration.test.js:
// - meta.json: `bytes` + `hashSha256` values → "<n>" / "<sha256>" — the
//   non-minified bundle embeds one `// <path>` comment per module (resolved
//   relative to the build process's cwd), so its sizes/hashes are
//   build-location-dependent; byte-identity regression is carried by the
//   min.js golden itself.

import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { extractFwAt, readManifest } from './golden-fw.js';
import { parseArgs, runBundle } from '../src/bundle/index.js';
import { generateStandalone } from '../src/standalone/index.js';

const GOLD = join(import.meta.dir, '__fixtures__', 'golden');
const PRESETS = ['minimal', 'core', 'site'];
const STANDALONE_MODULE = 'hex';

const sha = process.argv[2] ?? readManifest().captureSha;

function normMeta(json) {
    return json
        .replace(/"(min|minGz|dev|devGz)":\s*\d+/g, '"$1":"<n>"')
        .replace(/"(min|dev)":\s*"[0-9a-f]{64}"/g, '"$1":"<sha256>"');
}

/**
 * Fail the regold loudly if a build stamp ever comes back — a golden captured
 * from stamped output would silently re-bless the regression the compare side
 * no longer normalizes away.
 */
function assertStampFree(label, text) {
    for (const token of ['//# debugId=', '// Built:', '"builtAt"']) {
        if (text.includes(token)) {
            throw new Error(`[capture-goldens] ${label} still carries a build stamp: ${token}`);
        }
    }
}

const fw = extractFwAt(sha);
mkdirSync(GOLD, { recursive: true });

// Presets: build with the ported copy against the frozen fw, golden the
// emitted min.js bytes RAW + the dev-size-normalized meta.json.
rmSync(join(fw, 'dist'), { recursive: true, force: true });
for (const preset of PRESETS) {
    await runBundle(parseArgs([preset, '--no-sanity', '--pkg', fw]));
    const min = readFileSync(join(fw, 'dist', 'build', `fw.${preset}.pure.min.js`));
    const meta = readFileSync(join(fw, 'dist', 'build', `fw.${preset}.pure.meta.json`), 'utf8');
    assertStampFree(`fw.${preset}.pure.min.js`, min.toString('latin1'));
    assertStampFree(`fw.${preset}.pure.meta.json`, meta);
    writeFileSync(join(GOLD, `fw.${preset}.pure.min.js`), min);
    writeFileSync(join(GOLD, `fw.${preset}.pure.meta.json`), normMeta(meta));
    console.log(`[capture-goldens] preset ${preset}: ${min.length} bytes min.js`);
}

// Standalone: golden the emitted ESM RAW for a small module (no banner to
// normalize any more — BL-697).
const saOut = join(import.meta.dir, 'tmp', `${STANDALONE_MODULE}.standalone.js`);
const saRes = await generateStandalone(STANDALONE_MODULE, { out: saOut, pkg: fw });
const saText = readFileSync(saOut, 'utf8');
assertStampFree(`${STANDALONE_MODULE}.standalone.js`, saText);
writeFileSync(join(GOLD, `${STANDALONE_MODULE}.standalone.js`), saText);

writeFileSync(
    join(GOLD, 'MANIFEST.json'),
    JSON.stringify({
        captureSha: sha,
        bunVersion: Bun.version,
        capturedAt: new Date().toISOString(),
        standaloneModule: STANDALONE_MODULE,
        standaloneModuleCount: saRes.moduleCount,
    }, null, 2) + '\n',
);

console.log(`[capture-goldens] bundle+standalone goldens written for fw@${sha} (bun ${Bun.version})`);
