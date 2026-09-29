// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/_e2e/browsers-path.mjs
/**
 * @fileoverview Repo-scoped resolution of `PLAYWRIGHT_BROWSERS_PATH`.
 *
 * Owner ruling 2026-08-07 (FINDINGS §4.3 amendment, BINDING): third-party
 * installations live INSIDE the monorepo, never in `%LOCALAPPDATA%\ms-playwright`
 * nor the per-user cache of another platform. Both surfaces that touch a browser
 * binary — `playwright install` (provisioning) and `chromium.launch()` (the gate)
 * — must therefore resolve to ONE in-repo location, or they populate two caches.
 *
 * This module is PURE: no side effect at import, no I/O beyond an `existsSync`
 * sanity check inside `repoRoot()`. `applyBrowsersPath()` is the single mutating
 * entry point and it mutates only the env object it is handed.
 *
 * Consumed by `preview.mjs` (before its dynamic `import('playwright')`) and, per
 * the plan, by the provisioning script landed separately.
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Repo-relative home of the committed-location / gitignored-bytes browser cache.
 * The repo owns the LOCATION, never the bytes.
 */
export const BROWSERS_DIR_REL = 'third_party/ms-playwright';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path of the monorepo (or worktree) root, by a FIXED hop from this
 * file: `packages/front/fw/integrations/_e2e` → 5 levels up.
 *
 * Deliberately not a search: a walk-up looking for a marker would silently
 * succeed from a copied/vendored location. The `cli.ts` assertion turns a moved
 * file into a loud failure instead of a browser cache in the wrong place.
 *
 * @returns {string} absolute repo root
 * @throws {Error} when the fixed hop does not land on a tree root
 */
export function repoRoot() {
    const root = resolve(HERE, '..', '..', '..', '..', '..');
    if (!existsSync(join(root, 'cli.ts'))) {
        throw new Error(
            `[preview] repo root not found: expected \`cli.ts\` at ${root} ` +
                '(computed as a fixed 5-level hop from integrations/_e2e). ' +
                'Has the harness been moved?'
        );
    }
    return root;
}

/**
 * Resolve the browsers path WITHOUT touching any environment.
 *
 * Precedence: an explicit, non-empty `PLAYWRIGHT_BROWSERS_PATH` wins — it is the
 * documented operator override (a worktree run pointing at the main tree's warm
 * cache is the intended use). Otherwise the in-repo location is used.
 *
 * @param {Record<string, string|undefined>} [env] environment to read (never `process.env` implicitly in tests)
 * @returns {string} absolute path the browser cache must live at
 */
export function resolveBrowsersPath(env = process.env) {
    const raw = env?.PLAYWRIGHT_BROWSERS_PATH;
    const explicit = typeof raw === 'string' ? raw.trim() : '';
    if (explicit !== '') return explicit;
    return join(repoRoot(), BROWSERS_DIR_REL);
}

/**
 * Write the resolved value back into `env` so a child process — or the
 * playwright driver loaded later in THIS process — sees it.
 *
 * @param {Record<string, string|undefined>} [env] environment to mutate
 * @returns {string} the value written
 */
export function applyBrowsersPath(env = process.env) {
    const value = resolveBrowsersPath(env);
    env.PLAYWRIGHT_BROWSERS_PATH = value;
    return value;
}
