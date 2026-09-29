// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/_e2e/playground-recipes.test.js
/**
 * Drift gate, timing freeze, browsers-path resolution and a browser-less smoke
 * run of the preview harness.
 *
 * Browser-LESS by construction: nothing here imports playwright, and the harness
 * itself is only ever reached through a spawned `node` process — the driver runs
 * under Node, never Bun (FINDINGS §1 / acvp constraint C5).
 */

import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BROWSERS_DIR_REL, applyBrowsersPath, resolveBrowsersPath } from './browsers-path.mjs';
import {
    EXAMPLES_JSON_REL,
    RECIPES,
    SENTINEL_NAME,
    TIMING,
    WAIT_UNTIL,
    catalogueNames,
    checkCoverage,
    defaultLegs,
} from './playground-recipes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOGUE = catalogueNames(JSON.parse(readFileSync(resolve(HERE, EXAMPLES_JSON_REL), 'utf8')));

/** Playwright is a task-02 devDependency: absent here, present later. Measured, not assumed. */
function playwrightInstalled() {
    try {
        createRequire(import.meta.url).resolve('playwright/package.json');
        return true;
    } catch {
        return false;
    }
}

describe('preview gate — drift gate', () => {
    it('covers every catalogue entry, and names no unknown one', () => {
        expect(CATALOGUE.length).toBe(14);
        expect(checkCoverage(CATALOGUE, RECIPES)).toEqual({ missingRecipes: [], unknownRecipes: [] });
    });

    it('is NOT vacuous: an empty table leaves every entry missing', () => {
        // An "all entries covered" assertion passes identically on an empty table —
        // this is the control that makes the green assertion above evidence.
        expect(checkCoverage(CATALOGUE, []).missingRecipes).toEqual(CATALOGUE);
    });

    it('FALSIFIED: a doctored catalogue entry surfaces in missingRecipes', () => {
        const doctored = [...CATALOGUE, 'zzz-fake'];
        expect(checkCoverage(doctored, RECIPES).missingRecipes).toEqual(['zzz-fake']);
    });

    it('FALSIFIED: a recipe naming an unknown entry surfaces in unknownRecipes', () => {
        const doctored = [...RECIPES, { name: 'zzz-ghost', entryName: 'zzz-unknown', type: 'static' }];
        expect(checkCoverage(CATALOGUE, doctored).unknownRecipes).toEqual(['zzz-unknown']);
    });

    it('every recipe name is unique and the sentinel is out of the default run', () => {
        const names = RECIPES.map((r) => r.name);
        expect(new Set(names).size).toBe(names.length);
        expect(names).toContain(SENTINEL_NAME);
        expect(defaultLegs().map((r) => r.name)).not.toContain(SENTINEL_NAME);
        expect(defaultLegs().length).toBe(15);
    });
});

describe('preview gate — recipe table shape', () => {
    it('has exactly 8 runtime rows, each with a non-empty skip reason', () => {
        const runtime = RECIPES.filter((r) => r.type === 'runtime');
        expect(runtime.length).toBe(8);
        expect(new Set(runtime.map((r) => r.name))).toEqual(
            new Set(['bun', 'deno', 'eslint', 'jest', 'nest', 'nodejs', 'typedoc', 'vitest'])
        );
        for (const row of runtime) {
            expect(typeof row.skip).toBe('string');
            expect(row.skip.trim().length).toBeGreaterThan(0);
        }
    });

    it('never duplicates the runtime bucket coverage of e2e:playgrounds', () => {
        const runtimeNames = new Set(RECIPES.filter((r) => r.type === 'runtime').map((r) => r.entryName));
        const driven = RECIPES.filter((r) => r.type !== 'runtime').map((r) => r.entryName);
        for (const name of driven) expect(runtimeNames.has(name)).toBe(false);
    });

    it('every driven leg carries a port and an entry path; static legs carry a docroot', () => {
        for (const recipe of RECIPES.filter((r) => r.type !== 'runtime')) {
            expect(typeof recipe.port).toBe('number');
            expect(recipe.entryPath.startsWith('/')).toBe(true);
            if (!recipe.serve) expect(typeof recipe.docroot).toBe('string');
        }
    });

    it('spawns package bin JS only — no .bin shim, no bun run', () => {
        for (const recipe of RECIPES) {
            for (const step of [...(recipe.build ?? []), ...(recipe.serve ? [recipe.serve] : [])]) {
                const target = step.binRel ?? step.scriptRel;
                expect(target).toBeString();
                expect(target).not.toContain('.bin');
                expect(target.endsWith('.cmd')).toBe(false);
            }
        }
    });
});

describe('preview gate — frozen timing contract', () => {
    it('deep-equals the measured FINDINGS §2.0 values', () => {
        expect({ ...TIMING }).toEqual({
            pollIntervalMs: 250,
            readyTimeoutStaticMs: 10_000,
            readyTimeoutServerMs: 90_000,
            buildTimeoutMs: 300_000,
            gotoTimeoutMs: 30_000,
            settleMs: 1500,
            portFreeTimeoutMs: 15_000,
        });
    });

    it('navigates on `load`', () => {
        expect(WAIT_UNTIL).toBe('load');
    });
});

describe('preview gate — browsers path', () => {
    it('resolves in-repo with a clean env', () => {
        const value = resolveBrowsersPath({});
        expect(value.endsWith(join('third_party', 'ms-playwright'))).toBe(true);
        // External anchor: two hops up from the cache dir must BE a repo root.
        expect(existsSync(join(value, '..', '..', 'cli.ts'))).toBe(true);
        expect(BROWSERS_DIR_REL).toBe('third_party/ms-playwright');
    });

    it('returns a pre-set env value verbatim (the documented operator override)', () => {
        expect(resolveBrowsersPath({ PLAYWRIGHT_BROWSERS_PATH: 'D:/warm/ms-playwright' })).toBe('D:/warm/ms-playwright');
        expect(resolveBrowsersPath({ PLAYWRIGHT_BROWSERS_PATH: '  D:/warm/ms-playwright  ' })).toBe('D:/warm/ms-playwright');
    });

    it('ignores an empty/whitespace override and writes the value back', () => {
        expect(resolveBrowsersPath({ PLAYWRIGHT_BROWSERS_PATH: '   ' })).toBe(resolveBrowsersPath({}));
        const env = {};
        const written = applyBrowsersPath(env);
        expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe(written);
    });
});

describe('preview gate — harness smoke (no browser)', () => {
    const run = (args) =>
        spawnSync('node', [join(HERE, 'preview.mjs'), ...args], { cwd: HERE, encoding: 'utf8', timeout: 120_000 });

    it('--list exits 0 and prints the leg table', () => {
        const done = run(['--list']);
        const out = `${done.stdout ?? ''}${done.stderr ?? ''}`;
        expect(done.status).toBe(0);
        expect(out).toContain(SENTINEL_NAME);
        expect(out).toContain('astro-preview');
        expect(out).toContain(`${RECIPES.length} recipes`);
        expect(out).toContain('14 catalogue entries');
    }, 120_000);

    it('exits 2 on an unknown leg (config error, before any browser work)', () => {
        expect(run(['zzz-not-a-leg']).status).toBe(2);
    }, 120_000);

    it.skipIf(playwrightInstalled())(
        'full run without playwright: exit 0, every leg SKIPs, report written',
        () => {
            const done = run([]);
            const out = `${done.stdout ?? ''}${done.stderr ?? ''}`;
            expect(done.status).toBe(0);
            expect(out).toContain('playwright not provisioned');

            const reportPath = join(HERE, 'artifacts', 'report.json');
            expect(existsSync(reportPath)).toBe(true);
            const report = JSON.parse(readFileSync(reportPath, 'utf8'));
            expect(report.schema).toBe('fw-preview-gate/1');
            expect(Object.keys(report)).toEqual(['schema', 'generatedAt', 'host', 'allowlist', 'totals', 'results']);
            expect(Object.keys(report.host)).toEqual(['platform', 'node', 'browser', 'headed']);
            expect(report.totals).toEqual({ total: 15, pass: 0, fail: 0, skip: 15, inconclusive: 0 });
            expect(report.allowlist).toEqual([]);

            // Per-leg contract fields, exactly in this order (extras come after).
            const contract = [
                'name', 'type', 'url', 'status', 'consoleErrors', 'consoleWarnings',
                'pageErrors', 'consoleAll', 'screenshot', 'durationMs', 'launch',
            ];
            for (const leg of report.results) {
                expect(Object.keys(leg).slice(0, contract.length)).toEqual(contract);
                expect(Object.keys(leg.launch).slice(0, 3)).toEqual(['cmd', 'port', 'readyMs']);
                expect(leg.status).toBe('SKIP');
                expect(leg.note.length).toBeGreaterThan(0);
            }
            // The runtime bucket keeps its own reason; the rest report provisioning.
            const bun = report.results.find((r) => r.name === 'bun');
            expect(bun.note).toContain('browser-surface-less');
        },
        180_000
    );
});
