// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — the assembled `dist/build` aggregate
 * **pair** (`graphic-anim.standalone.*` + `graphic-anim.fw.*`),
 * graphic/BATCH_10 tasks 02 + 04.
 *
 * The point of the pair is that a dev — or an AI — picks a pre-built file by
 * its NAME alone, with no ambiguity about what it needs at runtime:
 *
 *   - `graphic-anim.standalone.{js,min.js,meta.json}` — generator `bundled`
 *     variant: `dependencies: []`, every reachable fw factory inlined, needs
 *     NOTHING at runtime.
 *   - `graphic-anim.fw.{js,min.js,meta.json}` — generator `package` variant:
 *     declares the fw modules as `dependencies` and has them DI-injected, fw
 *     NOT inlined, needs an `@awacloud/fw` runtime (smaller artifact).
 *
 * Covers:
 *   1. All six artifacts exist under `dist/build/`, and the retired bare
 *      `graphic-anim.{js,min.js,meta.json}` names are gone. The exhaustive
 *      `dist/build` listing also covers the three DEDICATED extension root
 *      pairs — `graphic-svg3d.{standalone,fw}.*` (graphic/BATCH_15 task 04) and
 *      `graphic-pageflip.*` / `graphic-hypertree.*` (graphic/BATCH_16 task 03).
 *      Each has its own test file (`tests/svg3d-prebuilt-root.integration.test.js`,
 *      `tests/extension-prebuilt-roots.integration.test.js`); they appear here
 *      only so this listing stays exhaustive.
 *   2. The GENERATED — do not edit banner is present in all four JS files.
 *   3. `graphic-anim.standalone.js` re-imports cleanly, is a valid
 *      single-factory descriptor (`{ name, dependencies: [], factory }`),
 *      imports no `@awacloud/fw` anywhere, and its factory RESOLVES the
 *      whole-package namespace (all 14 frozen-core keys) with no fw runtime —
 *      the effective capture-free backstop for the embedded mini-DI.
 *   4. `graphic-anim.fw.js` declares the fw names as `dependencies`, does NOT
 *      inline the fw factories (it is the smaller artifact), and resolves to
 *      the SAME 14-key namespace when registered on a real `@awacloud/fw`
 *      `ModuleRuntime` (`registerAllDeep`) that supplies `secPolicy`/`dom`.
 *   5. Both `.min.js` files re-import and resolve too, post-minification.
 *   6. Both `.meta.json` files parse and match the documented shape
 *      (`ai/archives/spikes/graphic-anim/03-packaging/candidate/graphic-anim.meta.example.json`,
 *      FINDINGS Q6, normative) plus the `variant` / `fwDependencies`
 *      discriminators of the pair.
 *   7. DETERMINISM: a second `gen:bundles` run is byte-identical with NO
 *      exception — `.js`, `.min.js` and `.meta.json` alike, compared by raw
 *      hash. The former `builtAt` ISO stamp was REMOVED by the `graphic/BATCH_19`
 *      task 03 ruling precisely so this lock can be unconditional; the same
 *      block asserts no `dist/build` meta carries a stamp field, so
 *      reintroducing one FAILS here instead of silently re-weakening the gate.
 *   8. `dist/standalone/` and `dist/build/index.js` are byte-unchanged by the
 *      same run (each assembled-root step writes only its own six files).
 */

// happy-dom registers the DOM globals the resolved fw `dom` factory needs
// (the `fw` variant is resolved through a real ModuleRuntime below).
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered in this worker */ }

import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require } from '../src/main.js';

const HERE       = dirname(fileURLToPath(import.meta.url));
const PKG        = join(HERE, '..');
const BUILD      = join(PKG, 'dist', 'build');

const STANDALONE_JS   = join(BUILD, 'graphic-anim.standalone.js');
const STANDALONE_MIN  = join(BUILD, 'graphic-anim.standalone.min.js');
const STANDALONE_META = join(BUILD, 'graphic-anim.standalone.meta.json');
const FW_JS           = join(BUILD, 'graphic-anim.fw.js');
const FW_MIN          = join(BUILD, 'graphic-anim.fw.min.js');
const FW_META         = join(BUILD, 'graphic-anim.fw.meta.json');

// Retired by task 04 — a name whose runtime requirement has to be guessed.
const RETIRED = ['graphic-anim.js', 'graphic-anim.min.js', 'graphic-anim.meta.json'];

// The declared fw surface of `@awacloud/graphic-anim` (`src/main.js`'s
// `fw_require`), read live rather than hardcoded.
const FW_NAMES = fw_require.map((m) => m.name);

// The frozen 14 core module names, in topo order — same set as
// `aggregator.js`'s `AGGREGATE_NAMES` (NOT the full 17-entry registry:
// `graphic.pageflip`/`graphic.hypertree`/`graphic.anim` itself are excluded).
const AGGREGATE_NAMES = [
    'graphic.lerp', 'graphic.easing', 'graphic.units', 'graphic.matrix',
    'graphic.color', 'graphic.scopedIds', 'graphic.interpolate',
    'graphic.svgApply', 'graphic.svgBuild', 'graphic.scheduler',
    'graphic.tween', 'graphic.timeline', 'graphic.scene', 'graphic.frames',
];

const AGGREGATE_KEYS = AGGREGATE_NAMES.map((n) => n.split('.')[1]);

// Pure-leaf / Worker-safe subset — mirrors the `DOM_BOUND` complement over
// `ROOTS` in tests/standalone-bundles.integration.test.js.
const WORKER_SAFE_SLICE = [
    'graphic.lerp', 'graphic.easing', 'graphic.units', 'graphic.matrix',
    'graphic.color', 'graphic.scopedIds', 'graphic.interpolate',
];

/**
 * Import an emitted aggregate file and return its single exported descriptor.
 * `bust` cache-busts files the idempotency test rewrites within the same run.
 */
async function importDescriptor(path, bust = false) {
    const mod = await import(bust ? `${path}?t=${Date.now()}` : path);
    const keys = Object.keys(mod).filter((k) => k !== 'default');
    expect(keys.length).toBe(1);
    return mod[keys[0]];
}

/**
 * Resolve an fw-variant descriptor the way a real consumer would: register it
 * on an `@awacloud/fw` ModuleRuntime alongside the fw modules it declares, then
 * resolve by name. This is what makes the `fw` artifact usable at all — it
 * carries no fw code of its own.
 */
function resolveOnFwRuntime(descriptor) {
    const runtime = new ModuleRuntime();
    runtime.registerAllDeep([...fw_require, descriptor]);
    return runtime.resolve(descriptor.name);
}

describe('dist/build assembled aggregate pair — artifacts exist', () => {
    test('both variants ship .js / .min.js / .meta.json', () => {
        for (const p of [STANDALONE_JS, STANDALONE_MIN, STANDALONE_META, FW_JS, FW_MIN, FW_META]) {
            expect(existsSync(p)).toBe(true);
        }
    });

    test('the retired bare graphic-anim.* names are gone', () => {
        for (const name of RETIRED) {
            expect(existsSync(join(BUILD, name))).toBe(false);
        }
        // Exhaustive: the barrel + one six-file pair per assembled root
        // (`graphic-anim` aggregator, plus the three dedicated extension roots
        // `graphic-svg3d` — graphic/BATCH_15 task 04 — and `graphic-pageflip` /
        // `graphic-hypertree` — graphic/BATCH_16 task 03).
        // Each .js / .min.js has a generated .d.ts beside it.
        const runtime = [
            'graphic-anim.fw.js',
            'graphic-anim.fw.meta.json',
            'graphic-anim.fw.min.js',
            'graphic-anim.standalone.js',
            'graphic-anim.standalone.meta.json',
            'graphic-anim.standalone.min.js',
            'graphic-hypertree.fw.js',
            'graphic-hypertree.fw.meta.json',
            'graphic-hypertree.fw.min.js',
            'graphic-hypertree.standalone.js',
            'graphic-hypertree.standalone.meta.json',
            'graphic-hypertree.standalone.min.js',
            'graphic-pageflip.fw.js',
            'graphic-pageflip.fw.meta.json',
            'graphic-pageflip.fw.min.js',
            'graphic-pageflip.standalone.js',
            'graphic-pageflip.standalone.meta.json',
            'graphic-pageflip.standalone.min.js',
            'graphic-svg3d.fw.js',
            'graphic-svg3d.fw.meta.json',
            'graphic-svg3d.fw.min.js',
            'graphic-svg3d.standalone.js',
            'graphic-svg3d.standalone.meta.json',
            'graphic-svg3d.standalone.min.js',
            'index.js',
        ];
        const declarations = runtime.filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, '.d.ts'));
        expect(readdirSync(BUILD).sort()).toEqual([...runtime, ...declarations].sort());
    });
});

describe('GENERATED banner', () => {
    for (const [label, path] of [
        ['graphic-anim.standalone.js', STANDALONE_JS],
        ['graphic-anim.standalone.min.js', STANDALONE_MIN],
        ['graphic-anim.fw.js', FW_JS],
        ['graphic-anim.fw.min.js', FW_MIN],
    ]) {
        test(`${label} carries the GENERATED — do not edit banner`, () => {
            const src = readFileSync(path, 'utf8');
            expect(src.startsWith('/* GENERATED')).toBe(true);
            expect(src).toContain('do not edit');
        });
    }
});

describe('graphic-anim.standalone.js — autonomous, fw inlined', () => {
    test('declares no dependencies and imports no @awacloud/fw', () => {
        const src = readFileSync(STANDALONE_JS, 'utf8');
        expect(src).not.toContain('@awacloud/fw');
        expect(src).not.toContain('import ');
        // fw factories are INLINED into this variant.
        for (const fwName of FW_NAMES) {
            expect(src).toContain(`__register({ name: ${JSON.stringify(fwName)}`);
        }
    });

    test('its factory resolves the 14-key namespace with NO fw runtime', async () => {
        const desc = await importDescriptor(STANDALONE_JS);
        expect(Array.isArray(desc.dependencies)).toBe(true);
        expect(desc.dependencies).toEqual([]);
        expect(typeof desc.factory).toBe('function');
        // Running the factory exercises the inlined mini-DI end to end; a
        // captured (undefined) free variable would throw here.
        const value = desc.factory();
        expect(value == null).toBe(false);
        expect(Object.keys(value).sort()).toEqual([...AGGREGATE_KEYS].sort());
    });
});

describe('graphic-anim.fw.js — fw declared as dependencies, not inlined', () => {
    test('declares the fw names as dependencies and does NOT inline them', () => {
        const src = readFileSync(FW_JS, 'utf8');
        for (const fwName of FW_NAMES) {
            // injected into the mini-DI cache, never re-registered as a factory
            expect(src).toContain(`__cache[${JSON.stringify(fwName)}] =`);
            expect(src).not.toContain(`__register({ name: ${JSON.stringify(fwName)}`);
        }
        expect(src).not.toContain('@awacloud/fw');
    });

    test('is the smaller artifact (no inlined fw code)', () => {
        const fwMeta = JSON.parse(readFileSync(FW_META, 'utf8'));
        const saMeta = JSON.parse(readFileSync(STANDALONE_META, 'utf8'));
        expect(fwMeta.bytes.dev).toBeLessThan(saMeta.bytes.dev);
        expect(fwMeta.bytes.min).toBeLessThan(saMeta.bytes.min);
    });

    test('resolves the 14-key namespace on a real @awacloud/fw ModuleRuntime', async () => {
        const desc = await importDescriptor(FW_JS);
        expect(desc.dependencies).toEqual(FW_NAMES);
        expect(typeof desc.factory).toBe('function');
        expect(desc.factory.length).toBe(FW_NAMES.length);
        const value = resolveOnFwRuntime(desc);
        expect(value == null).toBe(false);
        expect(Object.keys(value).sort()).toEqual([...AGGREGATE_KEYS].sort());
    });
});

describe('both variants expose the same 14-key namespace', () => {
    test('standalone factory() and fw runtime-resolve agree key for key', async () => {
        const standalone = await importDescriptor(STANDALONE_JS);
        const fw = await importDescriptor(FW_JS);
        const a = Object.keys(standalone.factory()).sort();
        const b = Object.keys(resolveOnFwRuntime(fw)).sort();
        expect(a).toEqual(b);
        expect(a).toEqual([...AGGREGATE_KEYS].sort());
    });
});

describe('minified twins resolve too (post-minification)', () => {
    test('graphic-anim.standalone.min.js resolves the 14-key namespace', async () => {
        // Cache-bust: this file is re-written by the idempotency test below
        // within the same run.
        const desc = await importDescriptor(STANDALONE_MIN, true);
        expect(desc.dependencies).toEqual([]);
        const value = desc.factory();
        expect(Object.keys(value).sort()).toEqual([...AGGREGATE_KEYS].sort());
    });

    test('graphic-anim.fw.min.js resolves the 14-key namespace on an fw runtime', async () => {
        const desc = await importDescriptor(FW_MIN, true);
        expect(desc.dependencies).toEqual(FW_NAMES);
        const value = resolveOnFwRuntime(desc);
        expect(Object.keys(value).sort()).toEqual([...AGGREGATE_KEYS].sort());
    });
});

describe('meta shape — variant + fwDependencies discriminators', () => {
    for (const [label, path, variant, expectedFwDeps] of [
        ['graphic-anim.standalone.meta.json', STANDALONE_META, 'standalone', []],
        ['graphic-anim.fw.meta.json', FW_META, 'fw', FW_NAMES],
    ]) {
        test(`${label} parses and matches the documented shape`, () => {
            const meta = JSON.parse(readFileSync(path, 'utf8'));
            expect(meta.kind).toBe('build');
            expect(meta.variant).toBe(variant);
            expect(meta.name).toBe('graphic-anim');
            expect(meta.package).toBe('@awacloud/graphic-anim');
            expect(meta.aggregate).toBe('graphic.anim');
            expect(meta.modules).toEqual(AGGREGATE_NAMES);
            expect(meta.fwDependencies).toEqual(expectedFwDeps);
            expect(typeof meta.bytes).toBe('object');
            expect(typeof meta.bytes.dev).toBe('number');
            expect(typeof meta.bytes.min).toBe('number');
            expect(meta.bytes.dev).toBeGreaterThan(0);
            expect(meta.bytes.min).toBeGreaterThan(0);
            expect(meta.bytes.min).toBeLessThan(meta.bytes.dev);
            expect(meta.domBound).toBe(true);
            expect(meta.workerSafeSlice).toEqual(WORKER_SAFE_SLICE);
            expect(typeof meta.builtBy).toBe('string');
            // DETERMINISM RULING (graphic/BATCH_19 task 03): no build stamp.
            expect('builtAt' in meta).toBe(false);
        });
    }

    test('the aggregate declares NO siblings — it IS the core a consumer holds', () => {
        for (const path of [STANDALONE_META, FW_META]) {
            const meta = JSON.parse(readFileSync(path, 'utf8'));
            expect('siblingDependencies' in meta).toBe(false);
        }
    });

    test('fwDependencies matches each emitted descriptor s own dependencies', async () => {
        const saMeta = JSON.parse(readFileSync(STANDALONE_META, 'utf8'));
        const fwMeta = JSON.parse(readFileSync(FW_META, 'utf8'));
        expect(saMeta.fwDependencies).toEqual((await importDescriptor(STANDALONE_JS)).dependencies);
        expect(fwMeta.fwDependencies).toEqual((await importDescriptor(FW_JS)).dependencies);
    });
});

describe('barrel regenerated with 18 descriptors', () => {
    test('dist/build/index.js exports animAggregatorModule', async () => {
        const barrel = await import(join(BUILD, 'index.js'));
        expect(Array.isArray(barrel.graphicModules)).toBe(true);
        // 18 since graphic/BATCH_12 task 02 appended graphic.svg3d topo-last;
        // the aggregate's OWN frozen 14-core (AGGREGATE_NAMES) is unaffected —
        // graphic.svg3d, like pageflip/hypertree/anim, is not part of it.
        expect(barrel.graphicModules.length).toBe(18);
        expect(typeof barrel.animAggregatorModule).toBe('object');
        expect(barrel.animAggregatorModule.name).toBe('graphic.anim');
    });
});

describe('no build stamp', () => {
    // The `graphic/BATCH_19` task 03 ruling: the driver writes NO build stamp,
    // so `dist/` is bit-for-bit reproducible. The byte-level determinism and
    // freshness checks (two temp-dir runs, then a comparison with the committed
    // tree) live in `tests/dist-freshness.integration.test.js`, which never
    // writes `dist/`.
    test('no dist/build meta.json carries a build stamp', () => {
        const stamped = readdirSync(BUILD)
            .filter((f) => f.endsWith('.meta.json'))
            .filter((f) => 'builtAt' in JSON.parse(readFileSync(join(BUILD, f), 'utf8')));
        expect(stamped).toEqual([]);
        // Non-vacuity: there ARE meta files to check.
        expect(readdirSync(BUILD).filter((f) => f.endsWith('.meta.json')).length).toBeGreaterThan(0);
    });
});
