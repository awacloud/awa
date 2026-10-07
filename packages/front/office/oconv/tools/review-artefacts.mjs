// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Dev script — human-review artefacts for the md->docx / md->odt
 * presentation work (BL-1766 / BL-1794 / BL-1799, office/BATCH_48 task 03).
 *
 * Converts the two committed markdown fixtures
 * (`tests/_fixtures/md/presentable-report.md`, `nested-lists.md`) to `docx`
 * and `odt` through the public `oconv.fromMd` facade and writes the four
 * files for the owner to open in Word / LibreOffice (rendering is not
 * reachable from a test). Prints each absolute path, its byte length and the
 * loss ledger. Pure: no network, no clock in the output names.
 *
 * Usage (from anywhere):
 *
 *     bun packages/front/office/oconv/tools/review-artefacts.mjs [outDir]
 *
 * `outDir` defaults to `tmp/office-batch-48/review` under the repo root
 * (git-ignored). NOT exported, NOT in `package.json` `files[]`: never shipped.
 *
 * @module oconv/tools/review-artefacts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../src/main.js';

const FIXTURES = ['presentable-report', 'nested-lists'];
const TARGETS = ['docx', 'odt'];

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../../../../..');
const argOut = process.argv[2];
const outDir = argOut
    ? resolve(argOut)
    : resolve(repoRoot, 'tmp/office-batch-48/review');

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconv = runtime.resolve('oconv');

mkdirSync(outDir, { recursive: true });

for (const fixture of FIXTURES) {
    const markdown = readFileSync(
        new URL('../tests/_fixtures/md/' + fixture + '.md', import.meta.url), 'utf8');
    for (const target of TARGETS) {
        const { bytes, losses } = await oconv.fromMd({ markdown, target });
        const file = resolve(outDir, fixture + '.' + target);
        writeFileSync(file, bytes);
        console.log(file + '  ' + bytes.length + ' bytes  losses=' + JSON.stringify(losses));
    }
}
