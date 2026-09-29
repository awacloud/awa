// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/src/bundle/lib/bundler.js
/**
 * @fileoverview Build backend selector for the autonomous bundles. Ported
 * logic-verbatim from `packages/front/fw/tools/build/bundler/lib/bundler.js`;
 * the only adaptation is the path-resolution seam — the esbuild/rollup backend
 * URLs now derive from a `setPkgRoot(dir)` seam (default `process.cwd()`)
 * instead of the tool's own file location, so `--pkg <dir>` points them at the
 * target package's `integrations/`.
 *
 * Exposes `buildOne` / `buildClassical` with a stable contract :
 *   buildOne(opts)        → { outputs, outFile, bytes, hashSha256, gzBytes }
 *   buildClassical(opts)  → idem (IIFE, sanity.min.js)
 *
 * Two backends share that contract :
 *   - **bun** (default, inline here) — `Bun.build` + `Bun.gzipSync`.
 *   - **esbuild** (`integrations/esbuild/backend.js`) — `esbuild.build` +
 *     `node:zlib` + `node:crypto`, so `dist/build/*` builds under pure Node.
 *
 * Selection (see `activeBackendName`) :
 *   1. explicit `setBackend('bun'|'esbuild')` (wired to the `--backend` flag),
 *   2. else `FW_BUILD_BACKEND` env,
 *   3. else auto : `bun` when running under Bun, otherwise `esbuild`.
 *
 * The esbuild backend is imported lazily (only when chosen) so a bun build
 * never needs esbuild installed, and vice-versa.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const VALID = new Set(['bun', 'esbuild', 'rollup']);

/** @type {(string|null)} */
let _forced = null;
/** @type {(Promise<{buildOne: Function, buildClassical: Function}>|null)} */
let _backend = null;
/** Package root the integration backends resolve against (path-resolution seam). */
let _pkgRoot = process.cwd();

/**
 * Point the esbuild/rollup integration backends at a package root (the
 * `--pkg`/cwd seam). Resets the memoised backend so a later `buildOne` picks
 * up the new location.
 * @param {(string|null|undefined)} dir
 */
export function setPkgRoot(dir) {
    _pkgRoot = dir ? resolve(dir) : process.cwd();
    _backend = null;
}

/**
 * Force a backend (overrides env + auto-detection). Resets the memoised
 * backend so a later `buildOne` picks up the new choice.
 * @param {('bun'|'esbuild'|null|undefined)} name
 */
export function setBackend(name) {
    if (name && !VALID.has(name)) {
        throw new Error(`Unknown build backend "${name}" (expected: bun, esbuild)`);
    }
    _forced = name || null;
    _backend = null;
}

/**
 * The backend that will be used, after applying force → env → auto-detect.
 * @returns {('bun'|'esbuild')}
 */
export function activeBackendName() {
    const env = (process.env.FW_BUILD_BACKEND || '').toLowerCase();
    const choice = _forced || (VALID.has(env) ? env : null);
    if (choice) return /** @type {'bun'|'esbuild'} */ (choice);
    return typeof Bun !== 'undefined' ? 'bun' : 'esbuild';
}

/** @returns {Promise<{buildOne: Function, buildClassical: Function}>} */
function resolveBackend() {
    if (_backend) return _backend;
    const name = activeBackendName();
    if (name === 'bun') {
        if (typeof Bun === 'undefined') {
            throw new Error(
                'build backend "bun" requested but not running under Bun. ' +
                'Use `--backend esbuild` (or run with bun).'
            );
        }
        _backend = Promise.resolve({ buildOne: bunBuildOne, buildClassical: bunBuildClassical });
    } else {
        // `file://` URLs — Node's ESM `import()` rejects raw Windows absolute paths.
        const rel = name === 'rollup' ? 'integrations/rollup/backend.js' : 'integrations/esbuild/backend.js';
        const url = pathToFileURL(resolve(_pkgRoot, rel)).href;
        _backend = import(url)
            .then((m) => ({ buildOne: m.buildOne, buildClassical: m.buildClassical }))
            .catch((e) => {
                throw new Error(
                    `build backend "${name}" selected but could not be loaded ` +
                    `(install it with \`bun run setup:e2e\`): ${e.message}`,
                    { cause: e }
                );
            });
    }
    return _backend;
}

/**
 * Build a single entry with the active backend.
 * @returns {Promise<{ outputs: string[], outFile: string, bytes: number, hashSha256: string, gzBytes: number }>}
 */
export async function buildOne(opts) {
    return (await resolveBackend()).buildOne(opts);
}

/**
 * Build a classical (IIFE) script (sanity.min.js) with the active backend.
 * @returns {Promise<{ outputs: string[], outFile: string, bytes: number, hashSha256: string, gzBytes: number }>}
 */
export async function buildClassical(opts) {
    return (await resolveBackend()).buildClassical(opts);
}

// ─────────────────────────── bun backend (inline) ───────────────────────────

/**
 * Build a single entry with Bun.build. Returns the shared contract object.
 */
async function bunBuildOne({
    entry,
    outdir,
    outFileName,        // optional: enforce a specific output file name
    minify = true,
    sourcemap = 'external',
    format = 'esm',
    target = 'browser',
    naming,             // optional override for Bun.build naming
    external,           // optional: array of specifiers to keep as imports
}) {
    const buildOpts = {
        entrypoints: [entry],
        outdir,
        target,
        format,
        minify,
        sourcemap,
    };
    if (naming) buildOpts.naming = naming;
    else if (outFileName) buildOpts.naming = { entry: outFileName };
    if (external && external.length) {
        buildOpts.external = external;
        // Bun.build's `external` matches bare specifiers reliably but relative
        // paths still get resolved+bundled. Add a plugin to short-circuit
        // resolution for the listed specifiers so they survive verbatim.
        buildOpts.plugins = [
            ...(buildOpts.plugins || []),
            {
                name: 'mark-external',
                setup(b) {
                    for (const spec of external) {
                        // Escape regex special chars in the literal specifier
                        const escaped = spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        b.onResolve({ filter: new RegExp(`^${escaped}$`) }, (args) => ({
                            path: args.path,
                            external: true,
                        }));
                    }
                },
            },
        ];
    }

    let result;
    try {
        result = await Bun.build({ ...buildOpts, throw: false });
    } catch (e) {
        throw new Error(`Bun.build threw for ${entry}: ${e.message}\n${e.stack || ''}`, { cause: e });
    }
    if (!result.success) {
        const msgs = result.logs.map((l) => {
            const pos = l.position ? ` at ${l.position.file}:${l.position.line}` : '';
            return `[${l.level || '?'}] ${l.message || String(l)}${pos}`;
        }).join('\n');
        throw new Error(`Bun.build failed for ${entry}:\n${msgs}`);
    }

    // Find the main JS output (not the .map)
    const jsOut = result.outputs.find((o) => o.path.endsWith('.js'));
    if (!jsOut) throw new Error(`No JS output for ${entry}`);
    const buf = readFileSync(jsOut.path);
    const bytes = buf.byteLength;
    const hashSha256 = createHash('sha256').update(buf).digest('hex');
    const gzBytes = Bun.gzipSync(buf).byteLength;

    return {
        outputs: result.outputs.map((o) => o.path),
        outFile: jsOut.path,
        bytes,
        hashSha256,
        gzBytes,
    };
}

/**
 * Build a classical (IIFE-equivalent) script — used for the sanity
 * dual-delivery artifacts (`sanity-<tier>-classic.min.js` / its
 * `sanity.min.js` alias). Bun 1.3.13+ DOES support `format:'iife'` natively
 * (this JSDoc used to claim otherwise), but that alone is not sufficient: an
 * ESM module that only *exports* a function never calls it. The caller must
 * pass a NON-EXPORTING entry — one that imports the export and calls it, per
 * `buildSanity()`'s R1b recipe (`tools/fw-bundler/src/bundle/index.js`).
 * Given such an entry, `format:'esm'` already emits no import/export
 * statements (the entry re-exports nothing of its own), so this backend
 * keeps that format — a script-tag-friendly blob that self-applies on load.
 */
async function bunBuildClassical({ entry, outdir, outFileName, minify = true }) {
    return bunBuildOne({
        entry,
        outdir,
        outFileName,
        minify,
        sourcemap: 'none',
        format: 'esm',
        target: 'browser',
    });
}
