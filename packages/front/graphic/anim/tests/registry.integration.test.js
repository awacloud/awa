// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — `deps↔dependencies` invariant for all 10
 * graphic module descriptors, plus topological order validation.
 *
 * FROZEN CONTRACT invariant (BATCH_3.md + docs/CONTRACT.md):
 *   `deps.map(d => d.name)` deep-equals `dependencies`
 *
 * This holds for every module in `graphicModules`. The special case is
 * `graphic.svgApply` whose `dependencies === ['dom']` and `deps === [dom]`
 * (the fw module, not a graphic descriptor). The invariant still holds:
 * `deps.map(d => d.name)` === `['dom']` === `dependencies`.
 *
 * Topological order: for each module at index `i`, every entry in
 * `dependencies` whose name starts with `graphic.` must appear in
 * `graphicModules` at an index < i.
 */

import { describe, test, expect } from 'bun:test';
import { graphicModules } from '../src/main.js';

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Assert deep equality between two arrays using expect().toEqual() so
 * test failures show a diff.
 */
function assertArrayEqual(actual, expected, label) {
    expect({ [label]: actual }).toEqual({ [label]: expected });
}

// ── invariant tests ───────────────────────────────────────────────────────────

describe('graphicModules — deps↔dependencies invariant', () => {

    test('graphicModules contains exactly 18 descriptors', () => {
        // W2 (graphic/BATCH_4) extended the frozen G1 ten as a strict superset:
        // + graphic.scopedIds, graphic.svgBuild, graphic.scene.
        // P2 (graphic/BATCH_5) appends graphic.frames topo-last (strict superset).
        // P2 W2 (graphic/BATCH_7) appends graphic.pageflip topo-last.
        // graphic-anim-extensions W3 (graphic/BATCH_8) appends graphic.hypertree topo-last.
        // graphic/BATCH_10 task 01 appends graphic.anim (the aggregator) topo-last.
        // graphic/BATCH_12 task 02 appends graphic.svg3d topo-last.
        expect(graphicModules).toHaveLength(18);
    });

    test('graphic.lerp — deps↔dependencies', () => {
        const m = graphicModules.find(x => x.name === 'graphic.lerp');
        expect(m).toBeDefined();
        assertArrayEqual(m.deps.map(d => d.name), m.dependencies, 'graphic.lerp');
    });

    test('graphic.easing — deps↔dependencies', () => {
        const m = graphicModules.find(x => x.name === 'graphic.easing');
        expect(m).toBeDefined();
        assertArrayEqual(m.deps.map(d => d.name), m.dependencies, 'graphic.easing');
    });

    test('graphic.units — deps↔dependencies', () => {
        const m = graphicModules.find(x => x.name === 'graphic.units');
        expect(m).toBeDefined();
        assertArrayEqual(m.deps.map(d => d.name), m.dependencies, 'graphic.units');
    });

    test('graphic.matrix — deps↔dependencies', () => {
        const m = graphicModules.find(x => x.name === 'graphic.matrix');
        expect(m).toBeDefined();
        assertArrayEqual(m.deps.map(d => d.name), m.dependencies, 'graphic.matrix');
    });

    test('graphic.color — deps↔dependencies', () => {
        const m = graphicModules.find(x => x.name === 'graphic.color');
        expect(m).toBeDefined();
        assertArrayEqual(m.deps.map(d => d.name), m.dependencies, 'graphic.color');
    });

    test('graphic.interpolate — deps↔dependencies', () => {
        const m = graphicModules.find(x => x.name === 'graphic.interpolate');
        expect(m).toBeDefined();
        assertArrayEqual(m.deps.map(d => d.name), m.dependencies, 'graphic.interpolate');
    });

    test('graphic.svgApply — deps↔dependencies (special: dep is fw dom, not a graphic descriptor)', () => {
        const m = graphicModules.find(x => x.name === 'graphic.svgApply');
        expect(m).toBeDefined();
        // dependencies === ['dom'] (the fw module name)
        expect(m.dependencies).toEqual(['dom']);
        // deps[0] IS the fw dom module object
        expect(m.deps).toHaveLength(1);
        expect(m.deps[0].name).toBe('dom');
        // invariant still holds
        assertArrayEqual(m.deps.map(d => d.name), m.dependencies, 'graphic.svgApply');
    });

    test('graphic.scheduler — deps↔dependencies', () => {
        const m = graphicModules.find(x => x.name === 'graphic.scheduler');
        expect(m).toBeDefined();
        assertArrayEqual(m.deps.map(d => d.name), m.dependencies, 'graphic.scheduler');
    });

    test('graphic.tween — deps↔dependencies', () => {
        const m = graphicModules.find(x => x.name === 'graphic.tween');
        expect(m).toBeDefined();
        assertArrayEqual(m.deps.map(d => d.name), m.dependencies, 'graphic.tween');
    });

    test('graphic.timeline — deps↔dependencies', () => {
        const m = graphicModules.find(x => x.name === 'graphic.timeline');
        expect(m).toBeDefined();
        assertArrayEqual(m.deps.map(d => d.name), m.dependencies, 'graphic.timeline');
    });

    // ── W2 (graphic/BATCH_4) additions ──────────────────────────────────────────

    test('graphic.scopedIds — deps↔dependencies (pure Worker-safe leaf, no deps)', () => {
        const m = graphicModules.find(x => x.name === 'graphic.scopedIds');
        expect(m).toBeDefined();
        expect(m.dependencies).toEqual([]);
        assertArrayEqual(m.deps.map(d => d.name), m.dependencies, 'graphic.scopedIds');
    });

    test('graphic.svgBuild — deps↔dependencies', () => {
        const m = graphicModules.find(x => x.name === 'graphic.svgBuild');
        expect(m).toBeDefined();
        assertArrayEqual(m.deps.map(d => d.name), m.dependencies, 'graphic.svgBuild');
    });

    test('graphic.scene — deps↔dependencies', () => {
        const m = graphicModules.find(x => x.name === 'graphic.scene');
        expect(m).toBeDefined();
        assertArrayEqual(m.deps.map(d => d.name), m.dependencies, 'graphic.scene');
    });

    // ── P2 (graphic/BATCH_5) addition ────────────────────────────────────────────

    test('graphic.frames — deps↔dependencies', () => {
        const m = graphicModules.find(x => x.name === 'graphic.frames');
        expect(m).toBeDefined();
        expect(m.dependencies).toEqual(['graphic.scheduler', 'graphic.svgApply']);
        assertArrayEqual(m.deps.map(d => d.name), m.dependencies, 'graphic.frames');
    });

    // ── P2 W2 (graphic/BATCH_7) addition ─────────────────────────────────────────

    test('graphic.pageflip — deps↔dependencies', () => {
        const m = graphicModules.find(x => x.name === 'graphic.pageflip');
        expect(m).toBeDefined();
        // pageflip depends on five graphic engine modules + the two injected pure
        // kernels (pageflip.fold / pageflip.compose, which are NOT graphicModules
        // members — they are DI-injected internals).
        expect(m.dependencies).toEqual([
            'graphic.svgBuild', 'graphic.scopedIds', 'graphic.timeline',
            'graphic.tween', 'graphic.svgApply', 'pageflip.fold', 'pageflip.compose',
        ]);
        assertArrayEqual(m.deps.map(d => d.name), m.dependencies, 'graphic.pageflip');
    });

    // ── graphic-anim-extensions W3 (graphic/BATCH_8) addition ────────────────────

    test('graphic.hypertree — deps↔dependencies', () => {
        const m = graphicModules.find(x => x.name === 'graphic.hypertree');
        expect(m).toBeDefined();
        // hypertree depends on six graphic engine modules + the two injected pure
        // kernels (hypertree.layout / hypertree.measure, which are NOT
        // graphicModules members — they are DI-injected internals).
        expect(m.dependencies).toEqual([
            'graphic.svgBuild', 'graphic.scopedIds', 'graphic.timeline',
            'graphic.tween', 'graphic.svgApply', 'graphic.scheduler',
            'hypertree.layout', 'hypertree.measure',
        ]);
        assertArrayEqual(m.deps.map(d => d.name), m.dependencies, 'graphic.hypertree');
    });

    // ── graphic/BATCH_10 task 01 addition ────────────────────────────────────────

    test('graphic.anim — deps↔dependencies (the whole-package aggregator, frozen 14-core deps)', () => {
        const m = graphicModules.find(x => x.name === 'graphic.anim');
        expect(m).toBeDefined();
        expect(m.dependencies).toEqual([
            'graphic.lerp', 'graphic.easing', 'graphic.units', 'graphic.matrix',
            'graphic.color', 'graphic.scopedIds', 'graphic.interpolate',
            'graphic.svgApply', 'graphic.svgBuild', 'graphic.scheduler',
            'graphic.tween', 'graphic.timeline', 'graphic.scene', 'graphic.frames',
        ]);
        assertArrayEqual(m.deps.map(d => d.name), m.dependencies, 'graphic.anim');
    });

    // ── graphic/BATCH_12 task 02 addition ────────────────────────────────────────

    test('graphic.svg3d — deps↔dependencies (the software-3D terrain viewer)', () => {
        const m = graphicModules.find(x => x.name === 'graphic.svg3d');
        expect(m).toBeDefined();
        // svg3d depends on its three pure/DOM sibling kernels (svg3d.vec3/mesh/
        // project/apply — NOT graphicModules members, DI-injected internals)
        // plus five graphic engine modules.
        expect(m.dependencies).toEqual([
            'svg3d.vec3', 'svg3d.mesh', 'svg3d.project', 'svg3d.apply',
            'graphic.svgBuild', 'graphic.scopedIds', 'graphic.timeline',
            'graphic.tween', 'graphic.svgApply', 'graphic.scheduler',
        ]);
        assertArrayEqual(m.deps.map(d => d.name), m.dependencies, 'graphic.svg3d');
    });

    test('all 18 descriptors satisfy the invariant (bulk check)', () => {
        for (const m of graphicModules) {
            const fromDeps = m.deps.map(d => d.name);
            expect(fromDeps).toEqual(m.dependencies);
        }
    });
});

// ── topological order ─────────────────────────────────────────────────────────

describe('graphicModules — topological order', () => {

    test('for every module, all graphic.* dependencies appear at a lower index', () => {
        const indexByName = new Map(graphicModules.map((m, i) => [m.name, i]));

        for (let i = 0; i < graphicModules.length; i++) {
            const m = graphicModules[i];
            for (const depName of m.dependencies) {
                if (!depName.startsWith('graphic.')) {
                    // fw dependency (e.g. 'dom') — not in graphicModules, skip
                    continue;
                }
                const depIdx = indexByName.get(depName);
                expect(depIdx).toBeDefined(); // dep must exist in graphicModules
                expect(depIdx).toBeLessThan(i); // dep must precede the dependent
            }
        }
    });

    test('the canonical frozen order matches the contract', () => {
        // W2 (graphic/BATCH_4) extends the frozen G1 ten as a strict superset,
        // preserving their relative order and inserting the three new modules at
        // topo-valid slots (scopedIds pure leaf; svgBuild after svgApply; scene
        // topo-last). NOTE: docs/CONTRACT.md ratification of this extension is a
        // human decision (creation-record open-Q3) pending at the W2 merge gate.
        const names = graphicModules.map(m => m.name);
        expect(names).toEqual([
            'graphic.lerp',
            'graphic.easing',
            'graphic.units',
            'graphic.matrix',
            'graphic.color',
            'graphic.scopedIds',
            'graphic.interpolate',
            'graphic.svgApply',
            'graphic.svgBuild',
            'graphic.scheduler',
            'graphic.tween',
            'graphic.timeline',
            'graphic.scene',
            'graphic.frames',
            'graphic.pageflip',
            'graphic.hypertree',
            'graphic.anim',
            'graphic.svg3d',
        ]);
    });
});
