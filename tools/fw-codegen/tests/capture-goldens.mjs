// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-codegen/tests/capture-goldens.mjs
//
// Regold script for the audit golden fixtures (tests/__fixtures__/golden/).
// Usage:
//   bun tools/fw-codegen/tests/capture-goldens.mjs [<captureSha>]
// Without an argument it re-captures at the MANIFEST's existing captureSha.
// Provenance + regold policy: see tests/__fixtures__/golden/README.md.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { extractFwAt, readManifest } from './golden-fw.js';
import { renderAudit } from '../src/audit/index.js';

const GOLD = join(import.meta.dir, '__fixtures__', 'golden');
const sha = process.argv[2] ?? readManifest().captureSha;

const fw = extractFwAt(sha);
mkdirSync(GOLD, { recursive: true });

writeFileSync(join(GOLD, 'fw-audit.txt'), renderAudit(fw));
writeFileSync(join(GOLD, 'fw-audit.lossy-only.txt'), renderAudit(fw, { lossyOnly: true }));
writeFileSync(
    join(GOLD, 'MANIFEST.json'),
    JSON.stringify({
        captureSha: sha,
        bunVersion: Bun.version,
        capturedAt: new Date().toISOString(),
    }, null, 2) + '\n',
);

console.log(`[capture-goldens] audit goldens written for fw@${sha} (bun ${Bun.version})`);
