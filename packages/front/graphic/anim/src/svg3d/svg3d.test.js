// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Unit + animation-seam tests for `graphic.svg3d`. Covers the
 * descriptor shape (both `graphic.svg3d` and its injected `svg3d.apply` DOM
 * rig-builder sibling), construction + the triangle-count ceiling guards
 * (path-mode default/override/hard-ceiling, polygon-mode fixed ceiling),
 * DISTINCT per-instance scoped-ids prefix (BATCH_4 collision lesson), the
 * orbit seam (single render pass per tick, riding the frozen
 * timeline/tween/scheduler engine — structural finding 4), slot blanking when
 * the visible face count drops to zero, `play`/`pause`/`seek`/`setCamera`/
 * `dispose`, and Worker-serializability via `runtime.serialize()` (the
 * package's faithful bare-scope check, `src/aggregator-min.test.js`).
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { svg3dModule } from './svg3d.js';
import { svg3dApplyModule } from './apply.js';
import { events as fwEvents } from '@awacloud/fw/dom/query/events.js';

// Resolve transitively (pulls svgBuild/scopedIds/timeline/tween/svgApply/
// scheduler + the injected pure/DOM sibling kernels svg3d.vec3/mesh/project/
// apply, and fw dom/secPolicy via deps).
const runtime = new ModuleRuntime();
runtime.registerDeep(svg3dModule);
const { Svg3d, createTerrain } = runtime.resolve('graphic.svg3d');
const { Scheduler } = runtime.resolve('graphic.scheduler');
const { SVG_NS } = runtime.resolve('graphic.svgApply');

/** A manual-clock scheduler so timelines register HERE, never on the shared singleton. */
function manualScheduler() {
    return new Scheduler({ now: () => 0, schedule: () => 1, cancel: () => {} });
}

/** A flat (all-zero) heightmap of `side` samples per side — deterministic geometry. */
function flatHeightmap(side) {
    return { side, heights: new Float64Array(side * side) };
}

// ── Descriptor shape ─────────────────────────────────────────────────────────

describe('svg3dModule descriptor', () => {
    test('has the frozen name / type / version', () => {
        expect(svg3dModule.name).toBe('graphic.svg3d');
        expect(svg3dModule.type).toBe('fw.dom.graphic');
        expect(svg3dModule.version).toBe('0.1.0');
    });

    test('dependencies are the prescribed tuple (3 svg3d kernels + apply + 5 engine deps)', () => {
        expect(svg3dModule.dependencies).toEqual([
            'svg3d.vec3', 'svg3d.mesh', 'svg3d.project', 'svg3d.apply',
            'graphic.svgBuild', 'graphic.scopedIds', 'graphic.timeline',
            'graphic.tween', 'graphic.svgApply', 'graphic.scheduler',
        ]);
    });

    test('deps mirror dependencies in the same order', () => {
        expect(svg3dModule.deps.map((d) => d.name)).toEqual(svg3dModule.dependencies);
    });

    test('factory returns { Svg3d, createTerrain }', () => {
        expect(typeof Svg3d).toBe('function');
        expect(typeof createTerrain).toBe('function');
    });
});

describe('svg3dApplyModule descriptor (injected DOM rig-builder sibling)', () => {
    test('has the frozen name / type / version, no dependencies, non-graphic.* name', () => {
        expect(svg3dApplyModule.name).toBe('svg3d.apply');
        expect(svg3dApplyModule.type).toBe('lib.graphic.svg3d');
        expect(svg3dApplyModule.dependencies).toEqual([]);
        expect(svg3dApplyModule.deps).toEqual([]);
    });

    test('factory returns { createPolygonRig, createPathRig }', () => {
        const api = svg3dApplyModule.factory();
        expect(typeof api.createPolygonRig).toBe('function');
        expect(typeof api.createPathRig).toBe('function');
    });
});

// ── Construction — heightmap / ceiling guards ────────────────────────────────

describe('Svg3d construction', () => {
    test('throws on a degenerate 1x1 heightmap (cells < 1)', () => {
        expect(() => createTerrain(null, { side: 1, heights: [0] }, { scheduler: manualScheduler() }))
            .toThrow('too small');
    });

    test('propagates decodeHeightmap TypeError on a malformed heightmap', () => {
        expect(() => createTerrain(null, { nope: true }, { scheduler: manualScheduler() })).toThrow();
    });

    test('default path mode builds under the 8192-triangle ceiling', () => {
        const inst = createTerrain(null, flatHeightmap(17) /* cells=16 -> 512 tris */, {
            scheduler: manualScheduler(),
        });
        expect(inst.mode).toBe('path');
        expect(inst.mesh.triangleCount).toBe(512);
    });

    test('default path ceiling throws above 8192 triangles', () => {
        // cells=66 -> 2*66*66 = 8712 > 8192
        expect(() => createTerrain(null, flatHeightmap(67), { scheduler: manualScheduler() }))
            .toThrow('8192');
    });

    test('maxTriangles override permits a mesh above the default ceiling', () => {
        const inst = createTerrain(null, flatHeightmap(67) /* 8712 tris */, {
            scheduler: manualScheduler(), maxTriangles: 9000,
        });
        expect(inst.mesh.triangleCount).toBe(8712);
    });

    test('maxTriangles beyond the measured hard ceiling (~51200) throws regardless of actual mesh size', () => {
        expect(() => createTerrain(null, flatHeightmap(5) /* tiny mesh */, {
            scheduler: manualScheduler(), maxTriangles: 60000,
        })).toThrow('51200');
    });

    test("mode:'polygons' accepts exactly 2048 triangles (cells=32)", () => {
        const inst = createTerrain(null, flatHeightmap(33), {
            scheduler: manualScheduler(), mode: 'polygons',
        });
        expect(inst.mode).toBe('polygons');
        expect(inst.mesh.triangleCount).toBe(2048);
    });

    test("mode:'polygons' throws above 2048 triangles (cells=33)", () => {
        expect(() => createTerrain(null, flatHeightmap(34) /* 2178 tris */, {
            scheduler: manualScheduler(), mode: 'polygons',
        })).toThrow('2048');
    });

    test('host.appendChild receives the built node when host is provided', () => {
        const host = document.createElementNS(SVG_NS, 'svg');
        const inst = createTerrain(host, flatHeightmap(9), { scheduler: manualScheduler() });
        expect(host.childNodes[0]).toBe(inst.node);
    });

    test('no host: the node is built but not attached anywhere', () => {
        const inst = createTerrain(null, flatHeightmap(9), { scheduler: manualScheduler() });
        expect(inst.node.parentNode).toBeFalsy();
    });

    test('the built root is namespace-correct', () => {
        const inst = createTerrain(null, flatHeightmap(9), { scheduler: manualScheduler() });
        expect(inst.node.namespaceURI).toBe(SVG_NS);
        expect(inst.node.tagName).toBe('svg');
    });
});

// ── Distinct per-instance scoped-ids prefix (BATCH_4 collision lesson) ───────

describe('distinct scopedIds prefix per instance', () => {
    test('two default-prefix terrains mint distinct prefixes -> no id collision', () => {
        const a = createTerrain(null, flatHeightmap(9), { scheduler: manualScheduler() });
        const b = createTerrain(null, flatHeightmap(9), { scheduler: manualScheduler() });
        expect(a.prefix).not.toBe(b.prefix);
        const idA = a.node.getAttribute('id');
        const idB = b.node.getAttribute('id');
        expect(idA).toContain(a.prefix);
        expect(idB).toContain(b.prefix);
        expect(idA).not.toBe(idB);
    });

    test('an explicit prefix is honoured', () => {
        const inst = createTerrain(null, flatHeightmap(9), {
            scheduler: manualScheduler(), prefix: 'my-terrain',
        });
        expect(inst.prefix).toBe('my-terrain');
        expect(inst.node.getAttribute('id')).toContain('my-terrain');
    });
});

// ── Slot blanking when the visible face count drops to zero ─────────────────
//
// A flat (all-zero) terrain's static world-space face normal is purely -y
// (up); backface culling is `dp = n . (camera - centroid)` and does NOT
// depend on camera rotation. The default camera sits at `y=-900` (visible);
// flipping to `y=+900` flips the sign of every face's `dp` -> the ENTIRE
// mesh backface-culls to a visible count of exactly 0, deterministically.

describe('slot blanking when the visible count shrinks to zero', () => {
    test('path rig (default): every bucket is blanked (empty d) when count -> 0', () => {
        const inst = createTerrain(null, flatHeightmap(17) /* 512 tris */, {
            scheduler: manualScheduler(),
        });
        const group = inst.node.childNodes[0];
        const anyNonEmpty = () => Array.from(group.childNodes).some((el) => el.getAttribute('d') !== '');
        expect(anyNonEmpty()).toBe(true); // sanity: initial render painted something

        inst.setCamera({ y: 900 });
        for (const el of group.childNodes) {
            expect(el.getAttribute('d')).toBe('');
        }
    });

    test('polygon rig (opt-in): every slot is blanked (empty points) when count -> 0', () => {
        const inst = createTerrain(null, flatHeightmap(9) /* 128 tris */, {
            scheduler: manualScheduler(), mode: 'polygons',
        });
        const group = inst.node.childNodes[0];
        const anyNonEmpty = () => Array.from(group.childNodes).some((el) => el.getAttribute('points') !== '');
        expect(anyNonEmpty()).toBe(true);

        inst.setCamera({ y: 900 });
        for (const el of group.childNodes) {
            expect(el.getAttribute('points')).toBe('');
        }
    });
});

// ── Orbit seam: single render pass per tick, no scheduler leak ──────────────

describe('orbit seam on the injected scheduler', () => {
    test("play() registers exactly two tickables (timeline + render); 'no 2nd rAF' invariant", () => {
        const sched = manualScheduler();
        const inst = createTerrain(null, flatHeightmap(9), { scheduler: sched, duration: 100 });
        inst.play();
        expect(sched.active.size).toBe(2);
    });

    test('camera.ry advances toward a full turn as the timeline ticks; camera.rx stays fixed when pitchSpan=0', () => {
        const sched = manualScheduler();
        const inst = createTerrain(null, flatHeightmap(9), { scheduler: sched, duration: 100 });
        const ry0 = inst.camera.ry;
        const rx0 = inst.camera.rx;
        inst.play();
        sched.tick(0);
        sched.tick(50);
        expect(inst.camera.ry).toBeCloseTo(ry0 + Math.PI, 5); // halfway through one full turn
        expect(inst.camera.rx).toBeCloseTo(rx0, 10); // pitchSpan defaults to 0
    });

    test('exactly one full render pass per tick (render step is a separate, later tickable)', () => {
        const svgBuild = runtime.resolve('graphic.svgBuild');
        const scopedIds = runtime.resolve('graphic.scopedIds');
        const timelineMod = runtime.resolve('graphic.timeline');
        const tweenMod = runtime.resolve('graphic.tween');
        const realApply = runtime.resolve('graphic.svgApply');
        const schedulerMod = runtime.resolve('graphic.scheduler');
        const vec3Api = runtime.resolve('svg3d.vec3');
        const meshApi = runtime.resolve('svg3d.mesh');
        const projectApi = runtime.resolve('svg3d.project');
        const applyApi = runtime.resolve('svg3d.apply');

        const writes = [];
        const spyApply = {
            SVG_NS: realApply.SVG_NS,
            svgAttr(target, name, value) {
                writes.push(name);
                return realApply.svgAttr(target, name, value);
            },
        };
        const api = svg3dModule.factory(
            vec3Api, meshApi, projectApi, applyApi,
            svgBuild, scopedIds, timelineMod, tweenMod, spyApply, schedulerMod,
        );
        const sched = manualScheduler();
        const inst = new api.Svg3d(null, flatHeightmap(9), { scheduler: sched, duration: 100 });

        inst.play();
        const bucketCount = inst.node.childNodes[0].childNodes.length; // default 16
        sched.tick(0); // fixes the start time; one render pass
        writes.length = 0;
        sched.tick(50); // exactly one further tick -> exactly one further render pass
        const dWrites = writes.filter((n) => n === 'd').length;
        expect(dWrites).toBe(bucketCount); // NOT 2x bucketCount (which would mean a double render)
    });

    test('pause() unregisters both tickables and freezes the camera angle', () => {
        const sched = manualScheduler();
        const inst = createTerrain(null, flatHeightmap(9), { scheduler: sched, duration: 100 });
        inst.play();
        sched.tick(0);
        sched.tick(50);
        const ryPaused = inst.camera.ry;
        inst.pause();
        expect(sched.active.size).toBe(0);
        sched.tick(100);
        sched.tick(200);
        expect(inst.camera.ry).toBe(ryPaused);
    });

    test('resuming play() after pause() continues the orbit from the current angle', () => {
        const sched = manualScheduler();
        const inst = createTerrain(null, flatHeightmap(9), { scheduler: sched, duration: 100 });
        inst.play();
        sched.tick(0);
        sched.tick(50);
        inst.pause();
        const ryPaused = inst.camera.ry;
        inst.play();
        expect(sched.active.size).toBe(2);
        sched.tick(0);
        sched.tick(25); // a quarter turn further from the resumed base
        expect(inst.camera.ry).toBeGreaterThan(ryPaused);
    });

    test('loop:true (default) restarts the cycle on completion; loop:false stops', () => {
        const schedA = manualScheduler();
        const looping = createTerrain(null, flatHeightmap(9), { scheduler: schedA, duration: 100 });
        looping.play();
        schedA.tick(0);
        schedA.tick(100); // completes cycle 1 -> loop restarts
        expect(schedA.active.size).toBe(2);
        expect(looping._playing).toBe(true);

        const schedB = manualScheduler();
        const once = createTerrain(null, flatHeightmap(9), {
            scheduler: schedB, duration: 100, loop: false,
        });
        once.play();
        schedB.tick(0);
        schedB.tick(100); // completes -> no loop
        expect(schedB.active.size).toBe(0);
        expect(once._playing).toBe(false);
    });

    test('play() is a no-op while already playing; pause() is a no-op while not playing', () => {
        const sched = manualScheduler();
        const inst = createTerrain(null, flatHeightmap(9), { scheduler: sched, duration: 100 });
        expect(inst.pause()).toBe(inst); // not playing yet — no-op
        expect(sched.active.size).toBe(0);
        inst.play();
        const tl1 = inst._timeline;
        inst.play(); // already playing — no-op, same timeline
        expect(inst._timeline).toBe(tl1);
    });
});

// ── seek() — deterministic scrub, bypasses the scheduler ─────────────────────

describe('seek()', () => {
    test('seek(ms) sets a linear fraction of the orbit without touching the scheduler', () => {
        const sched = manualScheduler();
        const inst = createTerrain(null, flatHeightmap(9), { scheduler: sched, duration: 100 });
        const ry0 = inst.camera.ry;
        inst.seek(50);
        expect(inst.camera.ry).toBeCloseTo(ry0 + Math.PI, 5); // half a turn
        inst.seek(100); // a full cycle wraps back to the rest angle
        expect(inst.camera.ry).toBeCloseTo(ry0, 5);
        expect(sched.active.size).toBe(0);
    });

    test('seek() re-renders immediately (visible in the DOM without a tick)', () => {
        const inst = createTerrain(null, flatHeightmap(9), { scheduler: manualScheduler() });
        const group = inst.node.childNodes[0];
        const before = group.childNodes[0].getAttribute('d');
        inst.seek(50);
        const after = group.childNodes[0].getAttribute('d');
        expect(after).not.toBe(before);
    });
});

// ── setCamera() ───────────────────────────────────────────────────────────────

describe('setCamera()', () => {
    test('merges a partial camera override and re-renders', () => {
        const inst = createTerrain(null, flatHeightmap(9), { scheduler: manualScheduler() });
        inst.setCamera({ depth: 1200 });
        expect(inst.camera.depth).toBe(1200);
        expect(inst.camera.rx).toBeCloseTo(0.55, 10); // untouched fields survive the merge
    });
});

// ── dispose() ────────────────────────────────────────────────────────────────

describe('dispose()', () => {
    test('unregisters the in-flight timeline and the render tickable, leaving the scheduler clean', () => {
        const sched = manualScheduler();
        const inst = createTerrain(null, flatHeightmap(9), { scheduler: sched, duration: 100 });
        inst.play();
        expect(sched.active.size).toBe(2);
        inst.dispose();
        expect(sched.active.size).toBe(0);
    });

    test('is idempotent (a second dispose() does not throw)', () => {
        const inst = createTerrain(null, flatHeightmap(9), { scheduler: manualScheduler() });
        inst.dispose();
        expect(() => inst.dispose()).not.toThrow();
    });

    test('play()/pause()/seek()/setCamera() are no-ops after dispose()', () => {
        const sched = manualScheduler();
        const inst = createTerrain(null, flatHeightmap(9), { scheduler: sched, duration: 100 });
        inst.dispose();
        const ryBefore = inst.camera.ry;
        inst.play();
        expect(sched.active.size).toBe(0);
        inst.seek(50);
        inst.setCamera({ depth: 1 });
        expect(inst.camera.ry).toBe(ryBefore);
    });
});

// ── Worker-serializability — runtime.serialize() faithful bare-scope check ──
//
// Mirrors `src/aggregator-min.test.js`'s established method (the package's
// "memory standing check" for capture-freedom): `ModuleRuntime.serialize()`
// extracts every reachable factory's exact source, which is reconstructed in
// a scope with NO access to any module-scope binding. A captured identifier
// throws `ReferenceError` there — the same failure mode a minifier-renamed
// capture would hit inside a real Worker bootstrap. `graphic.svg3d` is not a
// member of the frozen 14-module `graphic.anim` aggregate, so there is no
// aggregate `.min.js` carrying its factory to check against; this therefore
// applies the REAL-code half of the established method directly; the generic
// "detection survives minification" proof is already established package-wide
// against throwaway fixtures in `src/aggregator-min.test.js` and is not
// re-derived per module.

describe('Worker-serializability (runtime.serialize, faithful bare-scope check)', () => {
    test('graphic.svg3d serializes and resolves cleanly in a bare scope (no captured module-scope binding)', () => {
        const rt = new ModuleRuntime();
        rt.registerDeep(svg3dModule);
        const { content } = rt.serialize(['graphic.svg3d']);
        const mods = new Function(`return ${content}`)();
        const fresh = new ModuleRuntime();
        fresh.registerAllDeep(mods);
        const api = fresh.resolve('graphic.svg3d');
        expect(typeof api.createTerrain).toBe('function');
        expect(typeof api.Svg3d).toBe('function');
    });
});

// ── Face colours on the bucketed rig ────────────────────────────────────────
// The default rig fills each painter slice with its mean colour, so altitude
// and shading average out. `faceColors` splits each slice into colour classes
// (altitude classes + water, × shade classes), one fixed-fill path each.

describe('path rig: faceColors', () => {
    const applyApi = runtime.resolve('svg3d.apply');
    const meshApi = runtime.resolve('svg3d.mesh');
    const projectApi = runtime.resolve('svg3d.project');
    const svgBuild = runtime.resolve('graphic.svgBuild');
    const scopedIds = runtime.resolve('graphic.scopedIds');
    const realApply = runtime.resolve('graphic.svgApply');

    function setup(faceColors, buckets = 2) {
        const side = 9;
        const heights = new Float64Array(side * side);
        for (let j = 0; j < side; j += 1) {
            for (let i = 0; i < side; i += 1) heights[j * side + i] = i < 3 ? 0 : (i * j) / ((side - 1) ** 2);
        }
        const m = meshApi.buildGridMesh({ cells: side - 1, heights });
        const camera = projectApi.createCamera({ width: 640, height: 400 });
        const buf = projectApi.createFrameBuffers(m);
        const count = projectApi.projectFrame(m, camera, buf);
        const writes = [];
        const spyApply = {
            SVG_NS: realApply.SVG_NS,
            svgAttr(target, name, value) { writes.push(name); return realApply.svgAttr(target, name, value); },
        };
        const rig = applyApi.createPathRig({
            svgBuild, svgApply: spyApply, mesh: m, buckets, width: 640, height: 400,
            idScope: scopedIds.createScope(`fc-${Math.random().toString(36).slice(2)}`), faceColors,
        });
        return { m, buf, count, rig, writes };
    }
    const pathsOf = (rig) => [...rig.root.querySelectorAll('path')];
    const r1 = (v) => Math.round(v * 10) / 10;

    test('true means 6 altitude classes + water, × 6 shade classes, per slice', () => {
        const { rig } = setup(true, 2);
        expect(rig.nodeCount).toBe(2 * 7 * 6);
        expect(pathsOf(rig).length).toBe(2 * 7 * 6);
    });

    test('each class path has a fixed fill, stroked with it (width 1)', () => {
        const { rig, m } = setup({ base: 2, shade: 2 }, 1);
        const fills = pathsOf(rig).map((p) => p.getAttribute('fill'));
        for (const p of pathsOf(rig)) {
            expect(p.getAttribute('stroke')).toBe(p.getAttribute('fill'));
            expect(p.getAttribute('stroke-width')).toBe('1');
        }
        // Order inside a slice: altitude classes then water, each × shade.
        const L = (b, sh) => m.colorLut[b * m.shadeLevels + sh];
        expect(fills).toEqual([L(4, 8), L(4, 24), L(11, 8), L(11, 24), m.waterLut[8], m.waterLut[24]]);
    });

    test('every visible face lands in the path of its slice and its class', () => {
        const { m, buf, count, rig } = setup({ base: 2, shade: 2 }, 2);
        rig.update(buf, count);
        const paths = pathsOf(rig);
        const per = Math.ceil(count / 2);
        const idx = m.indices;
        for (let k = 0; k < count; k += 1) {
            const f = buf.order[k];
            const slice = Math.floor(k / per);
            const sc = Math.min(1, Math.floor((buf.shadeQ[f] / m.shadeLevels) * 2));
            const cls = m.water[f] ? 2 * 2 + sc : Math.min(1, Math.floor((m.baseQ[f] / m.baseLevels) * 2)) * 2 + sc;
            const a = idx[f * 3]; const b = idx[f * 3 + 1]; const c = idx[f * 3 + 2];
            const tri = `M${r1(buf.px[a])} ${r1(buf.py[a])}L${r1(buf.px[b])} ${r1(buf.py[b])}L${r1(buf.px[c])} ${r1(buf.py[c])}Z`;
            expect(paths[slice * 6 + cls].getAttribute('d')).toContain(tri);
        }
        expect(paths.some((p) => p.getAttribute('fill').startsWith('#0000'))).toBe(true);
    });

    test('a path whose d did not change is not written again', () => {
        const { buf, count, rig, writes } = setup(true, 2);
        const first = rig.update(buf, count);
        expect(first).toBeGreaterThan(0);
        writes.length = 0;
        expect(rig.update(buf, count)).toBe(0);
        expect(writes.length).toBe(0);
    });

    test('the composed module forwards faceColors (path mode)', () => {
        const t = new Svg3d(null, flatHeightmap(5), { faceColors: true, buckets: 4, scheduler: manualScheduler() });
        expect(t._rig.nodeCount).toBe(4 * 7 * 6);
    });
});

// ── Pointer look (opt-in `events`) ──────────────────────────────────────────
// The old SVG-3D drag-to-look: a press pauses the orbit; dragging turns the
// camera (yaw from x, pitch from y, by the drag distance — not per event).

describe('pointer look', () => {
    function makeLook(extra) {
        const sched = manualScheduler();
        const t = new Svg3d(null, flatHeightmap(5), {
            scheduler: sched, width: 1280, height: 800, events: fwEvents.factory(), ...extra,
        });
        return { t, sched };
    }
    const pe = (t, type, x, y, buttons = 0) => t.node.dispatchEvent(
        new PointerEvent(type, { clientX: x, clientY: y, buttons, pointerId: 1, bubbles: true }));

    test('a press pauses the orbit; a drag sets yaw and pitch from the distance', () => {
        const { t } = makeLook();
        t.play();
        const ry0 = t.camera.ry;
        const rx0 = t.camera.rx;
        pe(t, 'pointerdown', 100, 100, 1);
        expect(t._playing).toBe(false);
        pe(t, 'pointermove', 100 - 128, 100, 1);
        expect(t.camera.ry).toBeCloseTo(ry0 + (128 / 1280) * Math.PI, 9);
        expect(t.camera.rx).toBeCloseTo(rx0, 9);
        pe(t, 'pointermove', 100 - 128, 100 - 80, 1);
        expect(t.camera.rx).toBeCloseTo(rx0 - (80 / 800) * (Math.PI / 2), 9);
        pe(t, 'pointerup', 100 - 128, 100 - 80);
        expect(t.camera.ry).toBeCloseTo(ry0 + (128 / 1280) * Math.PI, 9);
        expect(t._playing).toBe(false);
        t.play();
        expect(t._playing).toBe(true);
    });

    test('pitch is clamped to [−π/2, π/2]; moves without a press do nothing', () => {
        const { t } = makeLook({ camera: { rx: 0 } });
        pe(t, 'pointermove', 0, 0, 0);
        expect(t.camera.rx).toBe(0);
        pe(t, 'pointerdown', 0, 0, 1);
        pe(t, 'pointermove', 0, 100000, 1);
        expect(t.camera.rx).toBeCloseTo(Math.PI / 2, 9);
        pe(t, 'pointermove', 0, -100000, 1);
        expect(t.camera.rx).toBeCloseTo(-Math.PI / 2, 9);
    });

    test('a drag renders each move', () => {
        const { t } = makeLook();
        const before = [...t.node.querySelectorAll('path')].map((p) => p.getAttribute('d')).join('|');
        pe(t, 'pointerdown', 0, 0, 1);
        pe(t, 'pointermove', -300, 0, 1);
        const after = [...t.node.querySelectorAll('path')].map((p) => p.getAttribute('d')).join('|');
        expect(after).not.toBe(before);
    });

    test('the whole viewport takes the press: a transparent hit rect behind the faces', () => {
        const { t } = makeLook();
        const hit = t.node.firstChild;
        expect(hit.tagName).toBe('rect');
        expect(hit.getAttribute('fill')).toBe('transparent');
        expect([hit.getAttribute('width'), hit.getAttribute('height')]).toEqual(['1280', '800']);
        const plain = new Svg3d(null, flatHeightmap(5), { scheduler: manualScheduler() });
        expect(plain.node.firstChild.tagName).not.toBe('rect');
    });

    test('dispose clears the listeners; without events nothing is bound', () => {
        const { t } = makeLook();
        t.dispose();
        const ry = t.camera.ry;
        pe(t, 'pointerdown', 0, 0, 1);
        pe(t, 'pointermove', -300, 0, 1);
        expect(t.camera.ry).toBe(ry);
        const plain = new Svg3d(null, flatHeightmap(5), { scheduler: manualScheduler() });
        expect(plain._pointerScope).toBeNull();
    });
});

// ── Lifecycle: dispose detaches what the constructor appended ────────────────

describe('dispose detaches the built node', () => {
    test('the node leaves its host; the reference stays readable; idempotent', () => {
        const host = document.createElementNS(SVG_NS, 'svg');
        const inst = createTerrain(host, flatHeightmap(9), { scheduler: manualScheduler() });
        expect(inst.node.parentNode).toBe(host);
        inst.dispose();
        expect(inst.node).not.toBeNull();
        expect(inst.node.parentNode).toBeNull();
        expect(host.childNodes.length).toBe(0);
        expect(() => inst.dispose()).not.toThrow();
    });

    test('without a host, dispose leaves the unattached node alone', () => {
        const inst = createTerrain(null, flatHeightmap(9), { scheduler: manualScheduler() });
        inst.dispose();
        expect(inst.node.parentNode).toBeFalsy();
    });
});
