// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — `graphic.frames` BOTH-SURFACES PARITY + registry.
 *
 * Mirrors `tests/parity.integration.test.js`'s structure for the new P2
 * `graphic.frames` primitive: drives an identical injected-clock sprite-mode
 * `Frames` run on all THREE surfaces —
 *
 *   - fw-resolved   : `new ModuleRuntime().registerAllDeep(graphicModules)` then
 *                     `runtime.resolve('graphic.frames')`.
 *   - direct-ESM    : the re-exported `framesModule` descriptor from
 *                     `src/main.js`, wired by a tiny local resolver (no
 *                     ModuleRuntime) over its transitive deps.
 *   - standalone    : the GENERATED `dist/standalone/graphic-frames-bundled.js`
 *                     single-factory bundle (inlined mini-DI).
 *
 * — and asserts the emitted frame-index / `viewBox` write sequences (captured
 * on a stub sprite target) are IDENTICAL across surfaces.
 *
 * Scheduler-singleton identity is compared WITHIN each surface only (each
 * surface owns its own DI container — W2 lesson, `ai/memory/types/graphic.md`
 * — there is no cross-surface singleton to assert).
 *
 * Also covers the registry contract: `graphic.frames` resolves, `framesModule`
 * is present in `graphicModules`, `dist/build/index.js` re-exports it, and
 * `dist/standalone/graphic-frames-bundled.js` exists and is framework-free.
 * Finally, a lint-capture check mirrors `lint-capture.integration.test.js`'s
 * non-vacuous-wiring proof for the frames descriptor specifically (the
 * `Frames` class is defined inside the factory).
 */

// happy-dom registers the DOM globals the resolved fw `dom` factory needs.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered in this worker */ }

import { describe, test, expect, beforeAll } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import {
    graphicModules,
    fw_require,
    framesModule,
    schedulerModule,
    svgApplyModule,
} from '../src/main.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, '..');
const STANDALONE = join(PACKAGE_ROOT, 'dist', 'standalone');
const BUILD_INDEX = join(PACKAGE_ROOT, 'dist', 'build', 'index.js');

// ── Surface A — fw-resolved (ModuleRuntime) ───────────────────────────────────

const fwRuntime = new ModuleRuntime();
fwRuntime.registerAllDeep(graphicModules);

/** @param {string} name @returns {*} */
function fwResolve(name) { return fwRuntime.resolve(name); }

// ── Surface B — direct-ESM (tiny local resolver over the re-exported descriptors) ─

const ESM_DESCRIPTORS = (() => {
    const map = Object.create(null);
    for (const d of [framesModule, schedulerModule, svgApplyModule, ...fw_require]) {
        map[d.name] = d;
    }
    return map;
})();

const esmCache = Object.create(null);

/** @param {string} name @returns {*} */
function esmResolve(name) {
    if (name in esmCache) return esmCache[name];
    const def = ESM_DESCRIPTORS[name];
    if (!def) throw new Error(`esmResolve: unknown module ${name}`);
    const args = def.dependencies.map(esmResolve);
    return (esmCache[name] = def.factory.apply({}, args));
}

// ── Surface C — standalone (generated single-factory bundle) ──────────────────

let saFramesMod;
let saSchedMod;

beforeAll(async () => {
    const mod = await import(join(STANDALONE, 'graphic-frames-bundled.js'));
    const desc = mod[Object.keys(mod)[0]];
    saFramesMod = desc.factory();

    // The frames bundle's factory returns only { Frames, frames } — the
    // scheduler singleton is a SEPARATE standalone bundle (own inlined mini-DI).
    const schedMod = await import(join(STANDALONE, 'graphic-scheduler-bundled.js'));
    const schedDesc = schedMod[Object.keys(schedMod)[0]];
    saSchedMod = schedDesc.factory();
});

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic sprite-mode Frames run — captured viewBox write sequences
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A stub sprite target whose every `setAttribute` write is captured.
 * @returns {{ writes: Array<{name:string,value:string}>, el: object }}
 */
function makeSpyTarget() {
    const writes = [];
    const el = {
        setAttribute(name, value) { writes.push({ name, value }); },
    };
    return { writes, el };
}

/**
 * Run an identical deterministic sprite-mode `Frames` sequence on a surface,
 * building the manual-clock scheduler from that surface's OWN
 * `graphic.scheduler` resolution — proves the sequence is identical even when
 * driven from each surface's own DI wiring, not just a fw-resolved scheduler
 * class. Returns the captured `viewBox` writes and the `onFrame` index trace.
 * @param {{ Frames: Function }} framesApi
 * @param {{ Scheduler: Function }} schedApi
 * @returns {{ writes: Array<{name:string,value:string}>, indices: number[] }}
 */
function runFramesOwnScheduler(framesApi, schedApi) {
    const sched = new schedApi.Scheduler({ now: () => 0, schedule: () => 1, cancel: () => {} });
    const { writes, el } = makeSpyTarget();
    const indices = [];
    const anim = new framesApi.Frames({
        sprite: { target: el, cols: 4, rows: 1, frameW: 10, frameH: 10 },
        fps: 10,
        loop: true,
        scheduler: sched,
        onFrame: (i) => indices.push(i),
    });
    anim.play();
    for (const ts of [0, 100, 200, 300, 400, 500, 600]) sched.tick(ts);
    return { writes, indices };
}

describe('parity — graphic.frames sprite-mode viewBox sequence', () => {
    test('fw === esm === standalone: identical viewBox write + frame-index sequences', () => {
        const fwApi = fwResolve('graphic.frames');
        const esmApi = esmResolve('graphic.frames');

        const fwRun = runFramesOwnScheduler(fwApi, fwResolve('graphic.scheduler'));
        const esmRun = runFramesOwnScheduler(esmApi, esmResolve('graphic.scheduler'));
        const saRun = runFramesOwnScheduler(saFramesMod, saSchedMod);

        // Non-trivial: the run actually produced writes and advanced frames.
        expect(fwRun.writes.length).toBeGreaterThan(0);
        expect(fwRun.indices.length).toBeGreaterThan(0);

        expect(esmRun.writes).toEqual(fwRun.writes);
        expect(saRun.writes).toEqual(fwRun.writes);
        expect(esmRun.indices).toEqual(fwRun.indices);
        expect(saRun.indices).toEqual(fwRun.indices);

        // Every write targets 'viewBox'.
        for (const w of fwRun.writes) expect(w.name).toBe('viewBox');
    });

    test('a non-looping ping-pong discrete run also matches across surfaces', () => {
        const runDiscrete = (framesApi, schedApi) => {
            const sched = new schedApi.Scheduler({ now: () => 0, schedule: () => 1, cancel: () => {} });
            const writes = [];
            const els = Array.from({ length: 3 }, () => ({
                setAttribute(name, value) { writes.push({ name, value }); },
            }));
            const anim = new framesApi.Frames({
                frames: els,
                fps: 10,
                loop: false,
                pingPong: true,
                scheduler: sched,
            });
            anim.play();
            for (const ts of [0, 100, 200, 300, 400, 500]) sched.tick(ts);
            return writes;
        };

        const fwSeq = runDiscrete(fwResolve('graphic.frames'), fwResolve('graphic.scheduler'));
        const esmSeq = runDiscrete(esmResolve('graphic.frames'), esmResolve('graphic.scheduler'));
        const saSeq = runDiscrete(saFramesMod, saSchedMod);

        expect(fwSeq.length).toBeGreaterThan(0);
        expect(esmSeq).toEqual(fwSeq);
        expect(saSeq).toEqual(fwSeq);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler-singleton identity — WITHIN each surface, not across
// ─────────────────────────────────────────────────────────────────────────────

describe('parity — graphic.frames scheduler singleton identity (within each surface)', () => {
    test('fw surface: Frames without opts.scheduler registers on the stable shared singleton', () => {
        const framesApi = fwResolve('graphic.frames');
        const schedApi = fwResolve('graphic.scheduler');
        const a = new framesApi.Frames({ frames: [{ setAttribute() {} }] });
        expect(a._scheduler).toBe(schedApi.scheduler);
        const b = new framesApi.Frames({ frames: [{ setAttribute() {} }] });
        expect(b._scheduler).toBe(a._scheduler);
    });

    test('esm surface: Frames without opts.scheduler registers on ITS OWN stable shared singleton', () => {
        const framesApi = esmResolve('graphic.frames');
        const schedApi = esmResolve('graphic.scheduler');
        const a = new framesApi.Frames({ frames: [{ setAttribute() {} }] });
        expect(a._scheduler).toBe(schedApi.scheduler);
    });

    test('standalone surface: Frames without opts.scheduler registers on ITS OWN singleton', () => {
        // NOTE: the frames bundle inlines its OWN copy of the scheduler factory
        // (separate mini-DI from the standalone `graphic-scheduler-bundled.js`
        // resolved in beforeAll) — so a bare `new saFramesMod.Frames(...)`
        // registers on the frames bundle's OWN inlined scheduler singleton, a
        // DIFFERENT instance than `saSchedMod.scheduler`. This is expected: each
        // standalone bundle is a fully self-contained mini-DI (W2 lesson).
        const a = new saFramesMod.Frames({ frames: [{ setAttribute() {} }] });
        expect(a._scheduler).toBeTruthy();
        const b = new saFramesMod.Frames({ frames: [{ setAttribute() {} }] });
        expect(b._scheduler).toBe(a._scheduler);
    });

    test('the three surfaces (fw, esm, standalone-scheduler-bundle) have DISTINCT scheduler singletons (own DI each — do NOT assert cross-surface identity)', () => {
        const fwSched = fwResolve('graphic.scheduler').scheduler;
        const esmSched = esmResolve('graphic.scheduler').scheduler;
        const saSched = saSchedMod.scheduler;
        expect(fwSched).not.toBe(esmSched);
        expect(fwSched).not.toBe(saSched);
        expect(esmSched).not.toBe(saSched);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

describe('registry — graphic.frames', () => {
    test('graphic.frames resolves via ModuleRuntime.registerAllDeep(graphicModules)', () => {
        const api = fwResolve('graphic.frames');
        expect(typeof api.Frames).toBe('function');
        expect(typeof api.frames).toBe('function');
    });

    test('framesModule is present in graphicModules (strict superset member)', () => {
        expect(graphicModules).toContain(framesModule);
        // P2 W2 (graphic/BATCH_7) appended graphic.pageflip topo-last, then
        // graphic-anim-extensions W3 (graphic/BATCH_8) appended graphic.hypertree
        // topo-last, then graphic/BATCH_10 task 01 appended graphic.anim (the
        // aggregator) topo-last, then graphic/BATCH_12 task 02 appended
        // graphic.svg3d topo-last — so frames is now the fifth-to-last member
        // (still a strict-superset append after the frozen core; its relative
        // order is unchanged).
        expect(graphicModules[graphicModules.length - 5]).toBe(framesModule);
        expect(graphicModules.length).toBe(18);
    });

    test('framesModule has the frozen descriptor shape', () => {
        expect(framesModule.name).toBe('graphic.frames');
        expect(framesModule.dependencies).toEqual(['graphic.scheduler', 'graphic.svgApply']);
    });

    test('dist/build/index.js re-exports framesModule', () => {
        expect(existsSync(BUILD_INDEX)).toBe(true);
        const code = readFileSync(BUILD_INDEX, 'utf8');
        expect(code.includes('framesModule')).toBe(true);
    });

    test('dist/standalone/graphic-frames-bundled.js exists', () => {
        expect(existsSync(join(STANDALONE, 'graphic-frames-bundled.js'))).toBe(true);
    });

    test('dist/standalone/graphic-frames-bundled.js is framework-free (no @awacloud/fw, no import statements)', () => {
        const code = readFileSync(join(STANDALONE, 'graphic-frames-bundled.js'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        expect(code.includes('@awacloud/fw')).toBe(false);
        expect(/\bimport\s+[^;]*\bfrom\b/.test(code)).toBe(false);
        expect(/\bexport\s+\*\s+from\b/.test(code)).toBe(false);
        expect(/from\s+['"]fw[^'"]*['"]/.test(code)).toBe(false);
    });

    test('the standalone frames bundle resolves to a usable { Frames, frames } surface', async () => {
        const mod = await import(join(STANDALONE, 'graphic-frames-bundled.js'));
        const desc = mod[Object.keys(mod)[0]];
        expect(desc.dependencies).toEqual([]);
        const api = desc.factory();
        expect(typeof api.Frames).toBe('function');
        expect(typeof api.frames).toBe('function');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lint-capture — the frames descriptor is capture-free (mirrors
// lint-capture.integration.test.js's non-vacuous-wiring proof, applied to the
// ACTUAL frames.js source file rather than a synthetic fixture).
// ─────────────────────────────────────────────────────────────────────────────

describe('fw/no-factory-capture — graphic.frames is clean', () => {
    test('eslint over the real frames.js source exits clean (no capture violations)', () => {
        const framesSrc = join(PACKAGE_ROOT, 'src', 'frames', 'frames.js');
        const result = spawnSync(
            'bunx',
            ['eslint', '--no-warn-ignored', framesSrc],
            {
                cwd: PACKAGE_ROOT,
                encoding: 'utf8',
                shell: process.platform === 'win32',
            },
        );
        const output = (result.stdout ?? '') + (result.stderr ?? '');
        expect(output).not.toContain('fw/no-factory-capture');
        expect(result.status).toBe(0);
    });

    test('the rule is proven non-vacuous: a synthetic capturing sibling fixture IS caught', () => {
        // Mirrors lint-capture.integration.test.js exactly, placed under
        // src/frames/ so it is unambiguously covered by the same glob as
        // frames.js itself — proving the green result above is not vacuous.
        // mkdtempSync (rather than a fixed '_lint_fixture_tmp' name) makes the
        // directory per-run-unique, so a concurrent run of this same test file
        // cannot race this one's rmSync against the other's still-in-flight
        // eslint spawn (same rationale as lint-capture.integration.test.js).
        const fixtureDir = mkdtempSync(join(PACKAGE_ROOT, 'src', 'frames', '_lint_fixture_'));
        const fixtureFile = join(fixtureDir, 'capturing-frames-sibling.js');
        const fixtureSrc = `
// Deliberate capture — module-scope binding referenced inside factory.
const CAPTURED_FRAMES_CONSTANT = { foo: 'bar' };

export const badFramesSibling = {
    name: 'bad.frames.sibling',
    dependencies: [],
    deps: [],
    factory() {
        // VIOLATION: CAPTURED_FRAMES_CONSTANT is a module-scope binding.
        return CAPTURED_FRAMES_CONSTANT;
    },
};
`.trimStart();

        writeFileSync(fixtureFile, fixtureSrc, 'utf8');
        try {
            const result = spawnSync(
                'bunx',
                ['eslint', '--no-warn-ignored', fixtureFile],
                {
                    cwd: PACKAGE_ROOT,
                    encoding: 'utf8',
                    shell: process.platform === 'win32',
                },
            );
            const output = (result.stdout ?? '') + (result.stderr ?? '');
            expect(result.status).not.toBe(0);
            expect(output).toContain('fw/no-factory-capture');
        } finally {
            rmSync(fixtureDir, { recursive: true, force: true });
        }
    });
});
