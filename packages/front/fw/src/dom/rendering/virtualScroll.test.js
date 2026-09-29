// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect, beforeEach } from 'bun:test';
import { virtualScroll } from './virtualScroll.js';

// ── Stubs ────────────────────────────────────────────────────────────────────
// Only `dom` is declared as a dependency. Extra args are tolerated for
// backward compat with callers that still pass `events`.

const domStub = {};   // unused for the direct-Element bridge

// ── Factory helper ────────────────────────────────────────────────────────────

function makeInst() {
    return virtualScroll.factory(domStub);
}

/**
 * Creates a container whose getBoundingClientRect() returns a known height.
 * happy-dom does not compute layout — we mock the method.
 */
function makeContainer(height = 480) {
    const el = document.createElement('div');
    document.body.appendChild(el);
    el.getBoundingClientRect = () => ({ height, width: 800, top: 0, left: 0, right: 800, bottom: height });
    return el;
}

function makeRenderItem() {
    return function(idx) {
        const li = document.createElement('li');
        li.textContent = `item-${idx}`;
        li.dataset.idx = idx;
        return li;
    };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('virtualScroll module', () => {

    // 1. Metadata
    test('has correct module metadata', () => {
        expect(virtualScroll.name).toBe('virtualScroll');
        expect(virtualScroll.version).toBe('1.1.0');
        expect(virtualScroll.type).toBe('fw.dom.rendering');
        expect(virtualScroll.dependencies).toEqual(['dom']);
        expect(typeof virtualScroll.factory).toBe('function');
    });

    test('factory tolerates extra positional args (backwards-compat)', () => {
        expect(() => virtualScroll.factory(domStub, {})).not.toThrow();
    });

    // 2. API factory
    describe('factory', () => {
        test('returns object with expected API', () => {
            const inst = makeInst();
            expect(typeof inst.create).toBe('function');
        });
    });

    // 3. create - fixed height, initial visibleRange
    describe('create', () => {
        let container;
        let inst;
        let list;

        beforeEach(() => {
            container = makeContainer(480);
            inst = makeInst();
            list = inst.create({
                container,
                itemHeight: 24,
                total: 10000,
                renderItem: makeRenderItem()
            });
        });

        test('returns full public API', () => {
            expect(typeof list.refresh).toBe('function');
            expect(typeof list.setTotal).toBe('function');
            expect(typeof list.scrollTo).toBe('function');
            expect(typeof list.visibleRange).toBe('function');
            expect(typeof list.measure).toBe('function');
            expect(typeof list.dispose).toBe('function');
        });

        // Test 2 spec : fixed 24px, total 10000, container 480px → {start:0, end: floor(480/24)+overscan}
        test('fixed 24px / total 10000 / container 480px → initial visibleRange {start:0, end:23}', () => {
            // viewport 480px: indexAtOffset(480) = floor(480/24) = 20, default overscan = 3 → end = 23
            const range = list.visibleRange();
            expect(range.start).toBe(0);
            expect(range.end).toBe(23); // 20 + 3 overscan
        });

        // Test spacer hauteur initiale
        test('spacer height equals total * itemHeight', () => {
            const spacer = container.firstChild;
            expect(spacer.style.height).toBe('240000px'); // 10000 * 24
        });
    });

    // 4. scrollTo
    describe('scrollTo', () => {
        let container;
        let list;

        beforeEach(() => {
            container = makeContainer(480);
            const inst = makeInst();
            list = inst.create({
                container,
                itemHeight: 24,
                total: 10000,
                renderItem: makeRenderItem()
            });
        });

        // Test 3 spec : scrollTo(5000) → range autour de 5000
        test('scrollTo(5000) positions range around index 5000', () => {
            list.scrollTo(5000);
            const range = list.visibleRange();
            expect(range.start).toBeLessThanOrEqual(5000);
            expect(range.end).toBeGreaterThanOrEqual(5000);
        });

        test('scrollTo with align center shifts range', () => {
            list.scrollTo(5000, { align: 'center' });
            const range = list.visibleRange();
            expect(range.start).toBeLessThanOrEqual(5000);
            expect(range.end).toBeGreaterThanOrEqual(5000);
        });

        test('scrollTo clamps to 0 minimum', () => {
            list.scrollTo(0);
            expect(container.scrollTop).toBe(0);
        });
    });

    // 5. setTotal
    describe('setTotal', () => {
        let container;
        let list;

        beforeEach(() => {
            container = makeContainer(480);
            const inst = makeInst();
            list = inst.create({
                container,
                itemHeight: 24,
                total: 10000,
                renderItem: makeRenderItem()
            });
        });

        // Test 4 spec: setTotal(20000) → spacer height doubled
        test('setTotal(20000) doubles spacer height', () => {
            list.setTotal(20000);
            const spacer = container.firstChild;
            expect(spacer.style.height).toBe('480000px'); // 20000 * 24
        });

        test('setTotal updates visibleRange total bound', () => {
            list.setTotal(5);
            const range = list.visibleRange();
            expect(range.end).toBeLessThanOrEqual(4);
        });
    });

    // 6. renderItem — HTMLElement correctly injected
    describe('renderItem', () => {
        test('HTMLElement returned by renderItem is injected in layer', () => {
            const container = makeContainer(480);
            const inst = makeInst();
            const list = inst.create({
                container,
                itemHeight: 24,
                total: 100,
                renderItem(idx) {
                    const el = document.createElement('div');
                    el.id = `item-${idx}`;
                    return el;
                }
            });
            // The layer is the second child of the container
            const layer = container.children[1];
            expect(layer).toBeDefined();
            expect(layer.children.length).toBeGreaterThan(0);
            // The first child must have id item-0
            expect(layer.children[0].id).toBe('item-0');
        });
    });

    // 7. dispose
    describe('dispose', () => {
        test('removes scroll listener and clears DOM', () => {
            const container = makeContainer(480);
            const inst = makeInst();
            const list = inst.create({
                container,
                itemHeight: 24,
                total: 100,
                renderItem: makeRenderItem()
            });

            list.dispose();

            // spacer and layer removed
            expect(container.children.length).toBe(0);
        });

        test('dispose does not throw on re-call', () => {
            const container = makeContainer(480);
            const inst = makeInst();
            const list = inst.create({
                container,
                itemHeight: 24,
                total: 10,
                renderItem: makeRenderItem()
            });
            list.dispose();
            // Second call must not throw
            expect(() => list.dispose()).not.toThrow();
        });
    });

    // 8. measure
    describe('measure', () => {
        test('measure returns itemHeight in fixed mode', () => {
            const container = makeContainer(480);
            const inst = makeInst();
            const list = inst.create({
                container,
                itemHeight: 32,
                total: 100,
                renderItem: makeRenderItem()
            });
            expect(list.measure(0)).toBe(32);
            expect(list.measure(50)).toBe(32);
        });
    });

    // 9. mode variable - cache et invalidation
    describe('variable mode', () => {
        test('creates list in variable mode without throw', () => {
            const container = makeContainer(480);
            const inst = makeInst();
            expect(() => {
                inst.create({
                    container,
                    itemHeight: 40,
                    total: 100,
                    renderItem: makeRenderItem(),
                    mode: 'variable'
                });
            }).not.toThrow();
        });

        test('setTotal in variable mode invalidates cache entries beyond new total', () => {
            const container = makeContainer(480);
            const inst = makeInst();
            const list = inst.create({
                container,
                itemHeight: 40,
                total: 100,
                renderItem: makeRenderItem(),
                mode: 'variable'
            });
            // After setTotal(20), measure for indices >= 20 falls back to default.
            list.setTotal(20);
            expect(list.measure(50)).toBe(40); // fallback = DEFAULT_VARIABLE_HEIGHT = itemHeight
        });

        test('variable mode caches measured heights per index (no re-measure on next render)', () => {
            // Stub each rendered LI with a controlled getBoundingClientRect so we
            // can count how many times the measurement is read.
            let measureCount = 0;
            const container = makeContainer(120);
            const inst = makeInst();
            const list = inst.create({
                container,
                itemHeight: 40,
                total: 5,
                mode: 'variable',
                renderItem(idx) {
                    const li = document.createElement('li');
                    li.textContent = `v-${idx}`;
                    li.getBoundingClientRect = () => {
                        measureCount++;
                        return { height: 40, width: 100, top: 0, left: 0, right: 100, bottom: 40 };
                    };
                    return li;
                }
            });
            const initialCount = measureCount;
            expect(initialCount).toBeGreaterThan(0);
            // Force a second render of the same range : cached heights should
            // mean zero new measurements.
            list.refresh();
            expect(measureCount).toBe(initialCount);
            list.dispose();
        });
    });

    // 11. renderItem elm-array fallback path
    describe('renderItem elm-array path', () => {
        test('uses dom.create when renderItem returns an array and dom.create exists', () => {
            const container = makeContainer(120);
            let createCalls = 0;
            const dm = {
                create(arr) {
                    createCalls++;
                    const el = document.createElement('section');
                    el.dataset.from = 'dom.create';
                    el.dataset.kind = String(arr?.[0]?.tag ?? '');
                    return el;
                }
            };
            const inst = virtualScroll.factory(dm);
            inst.create({
                container,
                itemHeight: 24,
                total: 3,
                renderItem(idx) {
                    return [{ tag: 'div', text: `x-${idx}` }];
                }
            });
            expect(createCalls).toBeGreaterThan(0);
            const layer = container.children[1];
            expect(layer.firstChild.dataset.from).toBe('dom.create');
        });

        test('falls back to first Element in array when dom.create is missing', () => {
            const container = makeContainer(60);
            const inst = virtualScroll.factory({}); // no dom.create
            inst.create({
                container,
                itemHeight: 24,
                total: 2,
                renderItem(idx) {
                    const el = document.createElement('p');
                    el.dataset.idx = String(idx);
                    return [el];
                }
            });
            const layer = container.children[1];
            expect(layer.firstChild.tagName).toBe('P');
            expect(layer.firstChild.dataset.idx).toBe('0');
        });
    });

    // 10. custom overscan
    describe('overscan', () => {
        test('overscan=0 returns exact visible items', () => {
            const container = makeContainer(480);
            const inst = makeInst();
            const list = inst.create({
                container,
                itemHeight: 24,
                total: 10000,
                renderItem: makeRenderItem(),
                overscan: 0
            });
            const range = list.visibleRange();
            // 480/24 = 20 exactement → indexAtOffset(480) = 20, overscan=0 → end=20
            expect(range.start).toBe(0);
            expect(range.end).toBe(20);
        });

        test('custom overscan=5 extends range', () => {
            const container = makeContainer(480);
            const inst = makeInst();
            const list = inst.create({
                container,
                itemHeight: 24,
                total: 10000,
                renderItem: makeRenderItem(),
                overscan: 5
            });
            const range = list.visibleRange();
            expect(range.end).toBe(25); // 20 + 5
        });
    });
});
