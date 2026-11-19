// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — published-install barrel-load gate
 * (`graphic/BATCH_19` task 01, wave W1 precondition).
 *
 * Hard input: `ai/archives/spikes/graphic-anim/w0-declared-dep/FINDINGS.md`
 * § B.2 / § 7.1 (verdict GO, gated on this precondition; the spike was archived
 * out of this package at `graphic/BATCH_19`) — measured 2026-08-05 that
 * `import('@awacloud/graphic-anim')` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`
 * under a real Node published install, because three `src/**` files import
 * `@awacloud/fw/core/runtime.js`, a subpath fw's `exports` map does NOT
 * sanction at the time (it sanctioned the extension-less `./core/runtime`; fw
 * has since declared the `.js` twin of every core subpath, and the package
 * writes that spelling everywhere). This gate is
 * the suite guard the spike recommends so the class cannot silently return —
 * it reuses the spike's Proof-B METHOD (that archive's `proof-b.test.js`:
 * simulate `npm install` by copying each package per its own `files`
 * allowlist into a throwaway `node_modules/@awacloud/*` tree, reached only
 * through the package's `exports` map), copied here rather than imported —
 * spikes are not a runtime dependency of the shipped suite.
 *
 * WHY A REAL `node` SUBPROCESS, NOT BUN. Bun's resolver does not enforce
 * exports-map exclusivity for this package (measured 2026-08-03,
 * `ai/memory/types/graphic.md` § Packaging; `tests/exports-map.integration.test.js`):
 * a subpath the map does NOT sanction can still resolve under Bun while Node
 * throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. A Bun-only gate for this class of
 * claim is therefore vacuous by construction — every assertion below runs
 * against a real `node --input-type=module` subprocess, never
 * `import.meta.resolveSync`/`Bun.resolveSync`.
 *
 * If no `node` binary is on PATH (`Bun.which('node')` is `null`), the gate
 * FAILS with an explicit message — it never skips silently, so an
 * environment that cannot run this class of check cannot report a false
 * green either.
 *
 * Negative control FIRST (spike discipline, repeated here): an unsanctioned
 * specifier must still throw before the positive assertion is trusted, or a
 * broken/lenient resolver would make "it loads" prove nothing about the
 * exports map actually being enforced.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { graphicModules } from '../src/main.js';
import {
    mkdtempSync, rmSync, cpSync, copyFileSync, existsSync, mkdirSync,
} from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const FW = join(PKG, '..', '..', 'fw');

/**
 * Real `node` binary path, or `null`. `Bun.which` (not `spawnSync`+status) so
 * an unusable environment is detected without ever shelling out.
 * @type {string|null}
 */
const NODE_PATH = typeof Bun !== 'undefined' && typeof Bun.which === 'function'
    ? Bun.which('node')
    : null;

/**
 * Reject a path npm would NOT pack for either package — mirrors the two
 * `files` allowlists literally (`package.json` of each): both exclude
 * co-located `*.test.js`; fw additionally excludes `*.kat.js`/`*.test.html`.
 *
 * @param {string} src absolute source path.
 * @returns {boolean} true means copy it.
 */
function packable(src) {
    if (/\.test\.js$/.test(src)) return false;
    if (/\.kat\.js$/.test(src)) return false;
    if (/\.test\.html$/.test(src)) return false;
    return true;
}

/** @type {string} */
let INSTALL_ROOT = '';

beforeAll(() => {
    INSTALL_ROOT = mkdtempSync(join(tmpdir(), 'graphic-anim-published-install-'));
    const modules = join(INSTALL_ROOT, 'node_modules', '@awacloud');

    // -- @awacloud/graphic-anim, its own `files` allowlist and nothing else --
    const anim = join(modules, 'graphic-anim');
    mkdirSync(join(anim, 'dist'), { recursive: true });
    copyFileSync(join(PKG, 'package.json'), join(anim, 'package.json'));
    copyFileSync(join(PKG, 'README.md'), join(anim, 'README.md'));
    cpSync(join(PKG, 'src'), join(anim, 'src'), { recursive: true, filter: packable });
    cpSync(join(PKG, 'types'), join(anim, 'types'), { recursive: true });
    cpSync(join(PKG, 'docs'), join(anim, 'docs'), { recursive: true });
    cpSync(join(PKG, 'dist', 'build'), join(anim, 'dist', 'build'), { recursive: true });
    cpSync(join(PKG, 'dist', 'standalone'), join(anim, 'dist', 'standalone'), { recursive: true });

    // -- @awacloud/fw, the declared runtime dependency, also per its allowlist -
    const fw = join(modules, 'fw');
    mkdirSync(fw, { recursive: true });
    copyFileSync(join(FW, 'package.json'), join(fw, 'package.json'));
    if (existsSync(join(FW, 'fw.config.json'))) {
        copyFileSync(join(FW, 'fw.config.json'), join(fw, 'fw.config.json'));
    }
    cpSync(join(FW, 'src'), join(fw, 'src'), { recursive: true, filter: packable });
    cpSync(join(FW, 'types'), join(fw, 'types'), { recursive: true });
});

afterAll(() => {
    if (INSTALL_ROOT) rmSync(INSTALL_ROOT, { recursive: true, force: true });
});

/**
 * Run ONE real Node ESM subprocess against the simulated install.
 *
 * @param {string} script module source, evaluated with the install root as cwd.
 * @returns {{status: number|null, out: object|null, stderr: string}}
 */
function runNode(script) {
    const res = spawnSync(NODE_PATH, ['--input-type=module', '-e', script], {
        cwd: INSTALL_ROOT,
        encoding: 'utf8',
    });
    const marker = (res.stdout || '').split('\n').find((l) => l.startsWith('__GATE__'));
    return {
        status: res.status,
        out: marker ? JSON.parse(marker.slice('__GATE__'.length)) : null,
        stderr: res.stderr || '',
    };
}

describe('published-install barrel-load gate (real node, Bun never the resolver)', () => {
    test('a real node binary is required for this gate (never skip silently)', () => {
        if (!NODE_PATH) {
            throw new Error('Node required for this gate');
        }
        expect(typeof NODE_PATH).toBe('string');
    });

    test('the simulated install carries NO co-located tests and NO spikes dir', () => {
        const anim = join(INSTALL_ROOT, 'node_modules', '@awacloud', 'graphic-anim');
        const leakedTests = [...new Bun.Glob('**/*.test.js').scanSync({ cwd: anim })];
        expect(leakedTests).toEqual([]);
        // `spikes/` is not in the package's `files` allowlist at all — a
        // published consumer can never see it.
        expect(existsSync(join(anim, 'spikes'))).toBe(false);
        expect(existsSync(join(anim, 'src', 'main.js'))).toBe(true);
        expect(existsSync(join(anim, 'src', 'pageflip', 'create.js'))).toBe(true);
    });

    // -- Negative control FIRST: the exports map is genuinely enforced -------

    // `./src/*` is not an fw export: a deep path into fw's source tree stays
    // unsanctioned whatever twins fw declares.
    test('negative control — an unsanctioned fw subpath still throws under real Node', () => {
        if (!NODE_PATH) throw new Error('Node required for this gate');
        const script = `
            const out = {};
            try {
                import.meta.resolve('@awacloud/fw/src/core/runtime.js');
                out.code = 'OK';
            } catch (e) {
                out.code = e.code || 'THROW';
            }
            console.log('__GATE__' + JSON.stringify(out));
        `;
        const { status, out } = runNode(script);
        expect(status).toBe(0);
        // If this were ever OK, the positive assertion below would prove
        // nothing about the exports map being enforced.
        expect(out.code).toBe('ERR_PACKAGE_PATH_NOT_EXPORTED');
    });

    test('the .js core-runtime spelling the package writes resolves under real Node', () => {
        if (!NODE_PATH) throw new Error('Node required for this gate');
        const script = `
            const out = {};
            try {
                out.url = import.meta.resolve('@awacloud/fw/core/runtime.js');
                out.code = 'OK';
            } catch (e) {
                out.code = e.code || 'THROW';
            }
            console.log('__GATE__' + JSON.stringify(out));
        `;
        const { status, out } = runNode(script);
        expect(status).toBe(0);
        expect(out.code).toBe('OK');
        expect(out.url.replace(/\\/g, '/')).toMatch(/\/@awacloud\/fw\/src\/core\/runtime\.js$/);
    });

    // -- The gate: the root barrel must LOAD, not merely resolve -------------

    test("import('@awacloud/graphic-anim') LOADS under real Node and exposes the source's graphicModules count", () => {
        if (!NODE_PATH) throw new Error('Node required for this gate');
        const script = `
            const out = {};
            try {
                const m = await import('@awacloud/graphic-anim');
                out.hasGraphicModules = typeof m.graphicModules;
                out.count = Array.isArray(m.graphicModules) ? m.graphicModules.length : -1;
            } catch (e) {
                out.code = e.code || 'THROW';
                out.message = String(e.message || e);
            }
            console.log('__GATE__' + JSON.stringify(out));
        `;
        const { status, out, stderr } = runNode(script);
        if (out === null) {
            throw new Error(`node subprocess produced no result. status=${status}\n${stderr}`);
        }
        expect(status).toBe(0);
        // Falsification-friendly: on failure this prints WHICH subpath threw,
        // instead of leaving a bare boolean mismatch.
        if (out.code) {
            throw new Error(`import('@awacloud/graphic-anim') threw ${out.code}: ${out.message}`);
        }
        expect(out.hasGraphicModules).toBe('object');
        // The live count of the source the install was copied from, not a
        // literal: the frozen count is the registry test's to hold.
        expect(out.count).toBe(graphicModules.length);
    }, 30_000);
});
