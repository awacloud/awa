// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { tweenModule } from './tween.js';

// Resolve the tween descriptor transitively (pulls scheduler, easing,
// interpolate, svgApply + fw dom/secPolicy via deps). The resolved
// dependency surfaces are pulled from the same runtime so tests use the very
// values the factory was wired with.
const runtime = new ModuleRuntime();
runtime.registerDeep(tweenModule);
const { Tween, tween } = runtime.resolve('graphic.tween');
const { Scheduler } = runtime.resolve('graphic.scheduler');
const { interpolator } = runtime.resolve('graphic.interpolate');
const easing = runtime.resolve('graphic.easing');
const { SVG_NS } = runtime.resolve('graphic.svgApply');

/** A scheduler with a no-op schedule so we drive frames manually via tick(). */
function manualScheduler() {
    return new Scheduler({ now: () => 0, schedule: () => 1, cancel: () => {} });
}

// ── Descriptor shape ─────────────────────────────────────────────────────────

describe('tweenModule descriptor', () => {
    test('has the frozen name / type / version', () => {
        expect(tweenModule.name).toBe('graphic.tween');
        expect(tweenModule.type).toBe('fw.dom.graphic');
        expect(tweenModule.version).toBe('0.1.0');
    });

    test('dependencies are exactly the frozen tuple in order', () => {
        expect(tweenModule.dependencies).toEqual([
            'graphic.scheduler', 'graphic.easing', 'graphic.interpolate', 'graphic.svgApply',
        ]);
    });

    test('deps names mirror dependencies in the same order', () => {
        expect(tweenModule.deps.map(d => d.name)).toEqual(tweenModule.dependencies);
    });
});

describe('Tween', () => {
    test('requires a target', () => {
        expect(() => new Tween({ property: 'x', from: 0, to: 1, duration: 1 }))
            .toThrow('Tween: target is required');
    });

    test('binds target by reference once at construction', () => {
        const target = { setAttribute() {} };
        const t = new Tween({ target, property: 'x', from: 0, to: 1, duration: 100 });
        expect(t.target).toBe(target);
    });

    test('linear from→to over duration: t=0 / mid / t=1 match interpolator', () => {
        const s = manualScheduler();
        const interp = interpolator(0, 100);
        const seen = [];
        const t = new Tween({
            target: { setAttribute() {} },
            property: 'x', from: 0, to: 100, duration: 1000,
            apply: (v) => seen.push(v),
            scheduler: s,
        });
        t.play();
        s.tick(0);      // raw 0
        s.tick(500);    // raw 0.5
        s.tick(1000);   // raw 1
        expect(seen[0]).toBe(interp(0));
        expect(seen[1]).toBe(interp(0.5));
        expect(seen[2]).toBe(interp(1));
        expect(t.done).toBe(true);
    });

    test('applies the named easing curve', () => {
        const s = manualScheduler();
        const seen = [];
        const t = new Tween({
            target: { setAttribute() {} },
            property: 'x', from: 0, to: 100, duration: 1000,
            easing: 'easeInQuad',
            apply: (v) => seen.push(v),
            scheduler: s,
        });
        t.play();
        s.tick(0);
        s.tick(500);
        // eased(0.5) for easeInQuad = 0.25 → value 25.
        expect(seen[1]).toBeCloseTo(100 * easing.easeInQuad(0.5), 9);
    });

    test('an unknown easing name throws at construction', () => {
        expect(() => new Tween({
            target: { setAttribute() {} },
            property: 'x', from: 0, to: 1, duration: 1, easing: 'nope',
        })).toThrow('Tween: unknown easing "nope"');
    });

    test('an absent easing is linear', () => {
        const t = new Tween({ target: { setAttribute() {} }, property: 'x', from: 0, to: 1, duration: 1 });
        expect(t.ease).toBe(easing.linear);
    });

    test('accepts an easing function directly', () => {
        const fn = (x) => x;
        const t = new Tween({
            target: { setAttribute() {} },
            property: 'x', from: 0, to: 1, duration: 1, easing: fn,
        });
        expect(t.ease).toBe(fn);
    });

    test('default svgApply writer hits a Happy-DOM <rect>', () => {
        const s = manualScheduler();
        const rect = document.createElementNS(SVG_NS, 'rect');
        const t = new Tween({
            target: rect, property: 'width', from: 0, to: 100, duration: 1000,
            scheduler: s,
        });
        t.play();
        s.tick(0);
        expect(rect.getAttribute('width')).toBe('0');
        s.tick(1000);
        expect(rect.getAttribute('width')).toBe('100');
    });

    test('default writer routes through the injected svgApply.svgAttr', () => {
        // A bespoke runtime whose graphic.svgApply records every write — proves
        // the default writer goes through the INJECTED svgApply, not a captured one.
        const calls = [];
        const r = new ModuleRuntime();
        r.registerDeep(tweenModule);
        // Override svgApply with a spying stub (same name/type/shape).
        r.register({
            name: 'graphic.svgApply',
            type: 'fw.dom.graphic',
            version: '0.1.0',
            dependencies: [],
            deps: [],
            factory: () => ({
                SVG_NS: 'http://www.w3.org/2000/svg',
                svgAttr: (target, name, value) => calls.push({ target, name, value }),
            }),
        });
        const spied = r.resolve('graphic.tween');
        const s = manualScheduler();
        const target = { setAttribute() {} };
        const t = new spied.Tween({
            target, property: 'width', from: 0, to: 100, duration: 1000, scheduler: s,
        });
        t.play();
        s.tick(0);
        expect(calls).toHaveLength(1);
        expect(calls[0].target).toBe(target);
        expect(calls[0].name).toBe('width');
        expect(calls[0].value).toBe(0); // the interpolated value at t=0
    });

    test('onUpdate fires every tick; onComplete fires once at the end', () => {
        const s = manualScheduler();
        let updates = 0;
        let completes = 0;
        const t = new Tween({
            target: { setAttribute() {} },
            property: 'x', from: 0, to: 1, duration: 1000,
            onUpdate: () => { updates += 1; },
            onComplete: () => { completes += 1; },
            scheduler: s,
        });
        t.play();
        s.tick(0);
        s.tick(500);
        s.tick(1000);
        s.tick(1500); // already done — must not re-fire
        expect(updates).toBe(3);
        expect(completes).toBe(1);
    });

    test('clamps progress to [0,1] (overshoot timestamp yields the end value)', () => {
        const s = manualScheduler();
        const rect = document.createElementNS(SVG_NS, 'rect');
        const t = new Tween({
            target: rect, property: 'width', from: 0, to: 100, duration: 1000,
            scheduler: s,
        });
        t.play();
        s.tick(0);
        s.tick(5000); // way past duration
        expect(rect.getAttribute('width')).toBe('100');
        expect(t.done).toBe(true);
    });

    test('no per-tick DOM lookup: writer receives the bound target', () => {
        const s = manualScheduler();
        const target = { setAttribute() {} };
        let applyTarget = null;
        const t = new Tween({
            target, property: 'x', from: 0, to: 1, duration: 1000,
            apply: (_v, tgt) => { applyTarget = tgt; },
            scheduler: s,
        });
        t.play();
        s.tick(0);
        expect(applyTarget).toBe(target);
    });

    test('removes itself from the scheduler on completion', () => {
        const s = manualScheduler();
        const t = new Tween({
            target: { setAttribute() {} },
            property: 'x', from: 0, to: 1, duration: 1000, scheduler: s,
        });
        t.play();
        expect(s.active.has(t)).toBe(true);
        s.tick(0);
        s.tick(1000);
        expect(s.active.has(t)).toBe(false);
    });
});

describe('tween() convenience', () => {
    test('builds and plays on the given scheduler', () => {
        const s = manualScheduler();
        const t = tween({
            target: { setAttribute() {} },
            property: 'x', from: 0, to: 1, duration: 1000, scheduler: s,
        });
        expect(t).toBeInstanceOf(Tween);
        expect(s.active.has(t)).toBe(true);
    });

    test('without an explicit scheduler plays on the shared scheduler', () => {
        const { scheduler: shared } = runtime.resolve('graphic.scheduler');
        const t = tween({
            target: { setAttribute() {} },
            property: 'x', from: 0, to: 1, duration: 1000,
        });
        expect(t).toBeInstanceOf(Tween);
        expect(shared.active.has(t)).toBe(true);
        shared.remove(t); // teardown so the shared loop self-stops
    });
});
