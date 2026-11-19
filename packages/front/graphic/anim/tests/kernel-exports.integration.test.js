// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — the public kernel export surface
 * (`graphic/BATCH_15` task 03; closes BACKLOG P2 / `ai/archives/packages/graphic/anim/demos-GAPS.md` item 5).
 *
 * The pure, Worker-safe kernels DI-injected into the three off-aggregate
 * composed modules — `pageflip.fold`/`pageflip.compose`, `hypertree.layout`/
 * `hypertree.measure`, and `svg3d.vec3`/`svg3d.mesh`/`svg3d.project`/
 * `svg3d.apply` — are documented as "framework-free, directly importable"
 * but, before this task, were reachable ONLY by a relative import from
 * inside `packages/front/graphic/anim/src/`: the root barrel (`src/main.js`)
 * never re-exported them and the package's `exports` map had no deep
 * subpaths (`.`, `./modules`, `./build/*`, `./standalone/*` only). Any
 * doc-sample import of a deep subpath threw `ERR_PACKAGE_PATH_NOT_EXPORTED`
 * under real Node/Bun exports-map resolution (the BATCH_13 finding class,
 * `docs/pageflip.md:87-88`'s residual `foldModule`/`composeModule` sample).
 *
 * This suite proves the fix two ways:
 *
 *   1. **Consumer-style resolution** — every kernel resolves through the
 *      bare package specifier `@awacloud/graphic-anim/kernels/<path>` (the new
 *      `./kernels/*` exports subpath), exactly the way an external
 *      consumer's runtime/bundler resolves a package import — never a
 *      relative path into this package's own `src/`.
 *   2. **DOM-free lock** — each kernel's REAL local import graph (walked
 *      from its resolved source file, not assumed) never reaches a
 *      DOM-bound module. This is the reason the chosen mechanism is a
 *      direct `./kernels/*` subpath rather than a root-barrel re-export:
 *      `src/main.js` imports `@awacloud/fw/dom/query/dom.js` and
 *      `graphic.svgApply` (`src/svg/apply.js`) unconditionally at its own
 *      top level (for the DOM-bound descriptors it also re-exports) — ES
 *      module evaluation runs a module's WHOLE top level on any import from
 *      it, not just the requested binding, and this package ships with no
 *      bundler to tree-shake that away. Routing a kernel-only import
 *      through `main.js` would therefore always evaluate that DOM-bound
 *      code too. A subpath resolving straight to the kernel's own source
 *      file bypasses `main.js` (and so `dom.js`/`svg/apply.js`) entirely.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as resolvePath } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');

/** The eight kernels closed by this task: subpath (under `./kernels/`) + the
 * descriptor's named export. */
const KERNELS = [
    { subpath: 'pageflip/fold.js', exportName: 'foldModule' },
    { subpath: 'pageflip/compose.js', exportName: 'composeModule' },
    { subpath: 'hypertree/layout.js', exportName: 'hypertreeLayoutModule' },
    { subpath: 'hypertree/measure.js', exportName: 'hypertreeMeasureModule' },
    { subpath: 'svg3d/vec3.js', exportName: 'svg3dVec3Module' },
    { subpath: 'svg3d/mesh.js', exportName: 'svg3dMeshModule' },
    { subpath: 'svg3d/project.js', exportName: 'svg3dProjectModule' },
    { subpath: 'svg3d/apply.js', exportName: 'svg3dApplyModule' },
];

// ── 1. Consumer-style resolution: the bare package specifier, exports-map only ─

describe('kernel surface resolves through the package specifier (exports map)', () => {
    for (const { subpath, exportName } of KERNELS) {
        test(`@awacloud/graphic-anim/kernels/${subpath} resolves ${exportName}`, async () => {
            const mod = await import(`@awacloud/graphic-anim/kernels/${subpath}`);
            const desc = mod[exportName];
            expect(desc).toBeTruthy();
            expect(typeof desc.name).toBe('string');
            expect(desc.type.startsWith('lib.graphic.')).toBe(true);
            expect(Array.isArray(desc.dependencies)).toBe(true);
            expect(Array.isArray(desc.deps)).toBe(true);
            expect(typeof desc.factory).toBe('function');
        });
    }
});

// ── 2. Each resolved kernel exposes its documented API shape ─────────────────

describe('resolved kernels expose their documented API', () => {
    test('pageflip.fold + pageflip.compose', async () => {
        const { foldModule } = await import('@awacloud/graphic-anim/kernels/pageflip/fold.js');
        const { composeModule } = await import('@awacloud/graphic-anim/kernels/pageflip/compose.js');

        const { fold, clampCorner, rotatePoint, lineIntersection, rectCorners, margin, EDGE_CASES, MARGIN_EPS }
            = foldModule.factory();
        expect(typeof fold).toBe('function');
        expect(typeof clampCorner).toBe('function');
        expect(typeof rotatePoint).toBe('function');
        expect(typeof lineIntersection).toBe('function');
        expect(typeof rectCorners).toBe('function');
        expect(typeof margin).toBe('function');
        expect(EDGE_CASES.OBTUSE).toBe('angle>0');
        expect(MARGIN_EPS).toBe(0.01);

        const { compose } = composeModule.factory();
        const solved = fold({ x: 128, y: 48 }, { width: 320, height: 480 });
        expect(compose(solved.turn).startsWith('M ')).toBe(true);
    });

    test('hypertree.layout + hypertree.measure', async () => {
        const { hypertreeLayoutModule } = await import('@awacloud/graphic-anim/kernels/hypertree/layout.js');
        const { hypertreeMeasureModule } = await import('@awacloud/graphic-anim/kernels/hypertree/measure.js');

        const { layout, focusMove, ringRadius, TWO_PI, DEFAULT_RADIUS } = hypertreeLayoutModule.factory();
        expect(typeof layout).toBe('function');
        expect(typeof focusMove).toBe('function');
        expect(typeof ringRadius).toBe('function');
        expect(TWO_PI).toBeCloseTo(Math.PI * 2);
        expect(DEFAULT_RADIUS).toBe(500);

        const tree = { id: 'root', children: [{ id: 'a' }, { id: 'b' }] };
        const base = layout(tree, { radius: 100 });
        expect(base.nodes.length).toBe(3);
        const zoomed = focusMove(base, 'a');
        expect(zoomed.nodes.length).toBe(3);

        const { wrapLabel } = hypertreeMeasureModule.factory();
        expect(wrapLabel('a bit of label text', 8)).toEqual(['a bit of', 'label', 'text']);
    });

    test('svg3d.vec3 + svg3d.mesh + svg3d.project + svg3d.apply', async () => {
        const { svg3dVec3Module } = await import('@awacloud/graphic-anim/kernels/svg3d/vec3.js');
        const { svg3dMeshModule } = await import('@awacloud/graphic-anim/kernels/svg3d/mesh.js');
        const { svg3dProjectModule } = await import('@awacloud/graphic-anim/kernels/svg3d/project.js');
        const { svg3dApplyModule } = await import('@awacloud/graphic-anim/kernels/svg3d/apply.js');

        const vec3 = svg3dVec3Module.factory();
        expect(typeof vec3.rotationMatrix3).toBe('function');

        // mesh/project both declare deps:['svg3d.vec3'] — DI-inject the
        // just-resolved vec3 API, the way `registerDeep` would.
        const mesh = svg3dMeshModule.factory(vec3);
        const meshObj = mesh.buildGridMesh({ cells: 2 });
        expect(meshObj.triangleCount).toBe(8);

        const project = svg3dProjectModule.factory(vec3);
        const camera = project.createCamera({});
        const buf = project.createFrameBuffers(meshObj);
        const count = project.projectFrame(meshObj, camera, buf);
        expect(count).toBeGreaterThanOrEqual(0);

        const applyApi = svg3dApplyModule.factory();
        expect(typeof applyApi.createPathRig).toBe('function');
        expect(typeof applyApi.createPolygonRig).toBe('function');
    });
});

// ── 3. DOM-free lock: the kernel's REAL local import graph never reaches a
//    DOM-bound module (fw `dom`/`secPolicy`, or `graphic.svgApply`'s
//    `src/svg/apply.js`) ─────────────────────────────────────────────────────

/** Parse a source file's static `import ... from '<spec>'` specifiers
 * (block/line comments stripped first so a commented-out import is ignored). */
function importSpecifiers(absPath) {
    const src = readFileSync(absPath, 'utf8');
    const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const specs = [];
    const re = /\bimport\s+[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(body)) !== null) specs.push(m[1]);
    return specs;
}

/**
 * Walk the LOCAL (relative-specifier) import graph from `absPath`,
 * collecting every visited file plus every bare specifier encountered
 * (recorded, not resolved) so a `@awacloud/fw/...` leak is directly visible.
 *
 * @param {string} absPath
 * @param {Set<string>} [visited]
 * @param {Set<string>} [bare]
 * @returns {{ visited: Set<string>, bare: Set<string> }}
 */
function walkLocalImports(absPath, visited = new Set(), bare = new Set()) {
    if (visited.has(absPath)) return { visited, bare };
    visited.add(absPath);
    for (const spec of importSpecifiers(absPath)) {
        if (spec.startsWith('.')) {
            walkLocalImports(resolvePath(dirname(absPath), spec), visited, bare);
        } else {
            bare.add(spec);
        }
    }
    return { visited, bare };
}

describe('kernel import graph is DOM-free (no fw dom / svgApply leak via the export path)', () => {
    for (const { subpath } of KERNELS) {
        test(`kernels/${subpath}'s real import graph pulls no DOM-bound module`, () => {
            const entry = join(SRC, subpath);
            const { visited, bare } = walkLocalImports(entry);

            // Never touches the DOM-bound SVG-attribute writer or scheduler.
            for (const file of visited) {
                const posix = file.replace(/\\/g, '/');
                expect(posix.endsWith('/svg/apply.js')).toBe(false);
                expect(posix.endsWith('/anim/scheduler.js')).toBe(false);
            }
            // Never references a bare fw specifier (dom.js/secPolicy.js are
            // always imported by bare `@awacloud/fw/...` specifiers, never relatively,
            // so a leak would show up here even if the file lived elsewhere).
            for (const spec of bare) {
                expect(spec.startsWith('@awacloud/fw')).toBe(false);
            }
        });
    }

    test('sanity check: the root barrel (src/main.js) DOES pull fw dom — confirms why it is NOT the chosen mechanism', () => {
        const { bare } = walkLocalImports(join(SRC, 'main.js'));
        expect([...bare].some((s) => s.startsWith('@awacloud/fw'))).toBe(true);
    });
});
