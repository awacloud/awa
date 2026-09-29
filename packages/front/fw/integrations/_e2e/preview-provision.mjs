// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/_e2e/preview-provision.mjs
/**
 * @fileoverview Explicit browser-install step for the preview gate.
 *
 * `preview.mjs` NEVER auto-installs (frozen §4.3 rejection — a gate that
 * silently downloads ~295 MiB on a contributor's first run is a worse
 * experience than an honest SKIP). This script is the one explicit,
 * developer-invoked step that provisions Chromium into the SAME in-repo
 * location `preview.mjs` resolves via `browsers-path.mjs`
 * (`applyBrowsersPath()`), so provisioning and the gate never populate two
 * caches.
 *
 *   node integrations/_e2e/preview-provision.mjs
 *   # or: bun run e2e:preview:install
 *
 * ## CLI resolution — measured, not the naive form
 *
 * `createRequire(...).resolve('playwright/cli.js')` THROWS
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` at the pinned playwright 1.60.0: its
 * `package.json` `exports` map publishes only `'.'`, `'./package.json'`,
 * `'./lib/*'`, `'./jsx-runtime'` and `'./test'` — `cli.js` exists on disk but
 * is unreachable through that subpath. The working form below still goes
 * through Node's own resolver (never a `.bin`/`.cmd` shim) by resolving the
 * package's `package.json` (which IS exported) and joining `cli.js` from its
 * directory. See `ai/memory/types/fw.md` (2026-08-10 entry) and
 * `ai/archives/plans/front-e2e/spikes/w0-e2e-harness/FINDINGS.md` §1/§4.
 *
 * Exit codes: `1` on an unresolvable playwright (prints the `bun install`
 * remediation) or a non-zero child exit; otherwise the child's own exit code
 * (`0` on success, including the "already complete" branch).
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

import { applyBrowsersPath } from './browsers-path.mjs';

const REMEDIATION = 'playwright is not resolvable — run `bun install` at the workspace root first.';

/**
 * Resolve playwright's CLI entry point via its `package.json` (which IS
 * published in the `exports` map) + `join('cli.js')` — the FORBIDDEN form is
 * `require.resolve('playwright/cli.js')` (throws at 1.60.0; see fileoverview).
 *
 * @returns {string|null} absolute path to `cli.js`, or `null` when unresolvable
 */
function resolveCliJs() {
    try {
        const require = createRequire(import.meta.url);
        const pkgJson = require.resolve('playwright/package.json');
        const cliJs = join(dirname(pkgJson), 'cli.js');
        return existsSync(cliJs) ? cliJs : null;
    } catch {
        return null;
    }
}

async function main() {
    const cliJs = resolveCliJs();
    if (!cliJs) {
        console.error(`[preview:install] ${REMEDIATION}`);
        return 1;
    }
    console.log(`[preview:install] resolved playwright CLI: ${cliJs}`);

    const browsersPath = applyBrowsersPath();
    console.log(`[preview:install] browsers path: ${browsersPath}`);

    const code = await new Promise((done) => {
        const child = spawn(process.execPath, [cliJs, 'install', 'chromium'], {
            stdio: 'inherit',
            env: process.env,
        });
        child.once('exit', (exitCode) => done(exitCode ?? 1));
        child.once('error', () => done(1));
    });

    console.log(`[preview:install] browsers path: ${browsersPath}`);
    return code;
}

process.exitCode = await main();
