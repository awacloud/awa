// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The stage: zoom steps and clamping, and the failure path of
 * lazy page drawing (a page whose draw throws is not retried in a loop).
 *
 * @module viewer/ui/stage.test
 */
import '../../tests/setup-dom.js';   // FIRST — registers window/document
import { describe, test, expect } from 'bun:test';
import { clampZoom, createStage, stepZoom, ZOOM_STEPS, MAX_DRAWS } from './stage.js';

describe('zoom', () => {
    test('steps through the presets and clamps', () => {
        expect(stepZoom(1, 1)).toBe(1.1);
        expect(stepZoom(1, -1)).toBe(0.9);
        expect(stepZoom(0.41, 1)).toBe(0.5);
        expect(stepZoom(ZOOM_STEPS[ZOOM_STEPS.length - 1], 1)).toBe(6);
        expect(clampZoom(100)).toBe(6);
        expect(clampZoom(0.001)).toBe(0.1);
        expect(clampZoom(0.4567)).toBe(0.46);
    });
});

describe('fit width', () => {
    test('a spreadsheet fits the width of the sheet shown', () => {
        const scroller = document.createElement('div');
        Object.defineProperty(scroller, 'clientWidth', { value: 1000 });
        document.body.append(scroller);
        const stage = createStage({ scroller, t: (k) => k, onPage() {} });
        const sheet = (w) => ({ name: `s${w}`, element: document.createElement('div'), width: w });
        stage.present(/** @type {any} */ ({
            kind: 'sheets', title: 't', meta: {}, omissions: [], dispose() {}, sheets: [sheet(4000), sheet(500)]
        }), document.createElement('div'), document.createElement('div'));
        const wide = stage.fitWidthZoom();
        expect(wide).toBeLessThan(0.3);
        expect(wide).toBeGreaterThan(0.2);
        stage.destroy();
        scroller.remove();
    });
});

describe('drawing queue', () => {
    test('at most two pages draw at once, every near page is drawn in the end', async () => {
        const scroller = document.createElement('div');
        document.body.append(scroller);
        const original = globalThis.IntersectionObserver;
        globalThis.IntersectionObserver = /** @type {any} */ (class {
            constructor(cb) { this.cb = cb; }
            observe(el) { this.cb([{ target: el, isIntersecting: true }]); }
            disconnect() {}
        });
        let running = 0, most = 0, done = 0;
        const page = () => ({
            width: 100, height: 100,
            draw: async () => {
                running++;
                most = Math.max(most, running);
                await new Promise((r) => setTimeout(r, 5));
                running--;
                done++;
            }
        });
        const stage = createStage({ scroller, t: (k) => k, onPage() {} });
        stage.present(/** @type {any} */ ({
            kind: 'paged', title: 't', meta: {}, omissions: [], dispose() {}, pages: Array.from({ length: 12 }, page)
        }), document.createElement('div'), document.createElement('div'));
        for (let i = 0; i < 60 && done < 12; i++) await new Promise((r) => setTimeout(r, 5));
        expect(done).toBe(12);
        expect(most).toBe(MAX_DRAWS);
        stage.destroy();
        scroller.remove();
        globalThis.IntersectionObserver = original;
    });

    test('a sheet paints its rows when it is first shown', () => {
        const scroller = document.createElement('div');
        document.body.append(scroller);
        const stage = createStage({ scroller, t: (k) => k, onPage() {} });
        const prepared = [];
        const sheet = (n) => ({ name: `s${n}`, element: document.createElement('div'), prepare: () => prepared.push(n) });
        stage.present(/** @type {any} */ ({
            kind: 'sheets', title: 't', meta: {}, omissions: [], dispose() {}, sheets: [sheet(0), sheet(1), sheet(2)]
        }), document.createElement('div'), document.createElement('div'));
        expect(prepared).toEqual([0]);
        stage.go(2);
        expect(prepared).toEqual([0, 2]);
        stage.go(0);
        expect(prepared).toEqual([0, 2, 0]);   // prepare is the sheet's own once-only start
        stage.destroy();
        scroller.remove();
    });
});

describe('lazy drawing', () => {
    test('a page whose draw fails is reported once, not retried in a loop', async () => {
        const scroller = document.createElement('div');
        scroller.id = 'awv-t-stage';
        const host = document.createElement('div');
        const tabs = document.createElement('div');
        document.body.append(scroller);
        let calls = 0;
        const errors = [];
        // Happy-DOM's IntersectionObserver never fires (no layout): report every page as visible.
        const original = globalThis.IntersectionObserver;
        globalThis.IntersectionObserver = /** @type {any} */ (class {
            constructor(cb) { this.cb = cb; }
            observe(el) { this.cb([{ target: el, isIntersecting: true }]); }
            disconnect() {}
        });
        const stage = createStage({ scroller, t: (k) => k, onPage() {}, onDrawError: (e) => errors.push(e) });
        const view = {
            kind: 'paged', title: 't', meta: {}, omissions: [], dispose() {},
            pages: [{ width: 100, height: 100, draw: async () => { calls++; throw new Error('broken page'); } }]
        };
        stage.present(/** @type {any} */ (view), host, tabs);
        await new Promise((r) => setTimeout(r, 50));
        expect(calls).toBe(1);
        expect(errors).toHaveLength(1);
        // Never a silent blank page: said on the page, counted in the omissions.
        expect(host.querySelector('.awv-page-failed')?.textContent).toBe('error.pageFailed');
        expect(view.omissions).toEqual([{ code: 'page/failed', count: 1 }]);
        // A new zoom is a new attempt.
        stage.setZoom(2);
        await new Promise((r) => setTimeout(r, 50));
        expect(calls).toBeLessThanOrEqual(2);
        stage.destroy();
        scroller.remove();
        globalThis.IntersectionObserver = original;
    });

    test('a draw settling after the View is gone reports nothing; one scrolled away is freed', async () => {
        const scroller = document.createElement('div');
        scroller.id = 'awv-t2-stage';
        const host = document.createElement('div');
        document.body.append(scroller);
        /** @type {any} */
        let observer = null;
        const original = globalThis.IntersectionObserver;
        globalThis.IntersectionObserver = /** @type {any} */ (class {
            constructor(cb) { this.cb = cb; observer = this; }
            observe(el) { this.cb([{ target: el, isIntersecting: true }]); }
            disconnect() {}
        });
        const errors = [];
        /** @type {(() => void)[]} */
        const pending = [];
        const page = (fail) => ({
            width: 10, height: 10,
            draw: (el) => new Promise((resolve, reject) => pending.push(() => {
                el.querySelector('.awv-page-surface').append(document.createElement('canvas'));
                if (fail) reject(new Error('late')); else resolve();
            }))
        });
        const stage = createStage({ scroller, t: (k) => k, onPage() {}, onDrawError: (e) => errors.push(e) });
        const view = (fail) => ({ kind: 'paged', title: 't', meta: {}, omissions: [], dispose() {}, pages: [page(fail)] });
        stage.present(view(true), host, document.createElement('div'));
        await new Promise((r) => setTimeout(r, 0));
        stage.clear();
        pending.shift()?.();
        await new Promise((r) => setTimeout(r, 10));
        expect(errors).toHaveLength(0);

        stage.present(view(false), host, document.createElement('div'));
        await new Promise((r) => setTimeout(r, 0));
        const slot = /** @type {HTMLElement} */ (host.querySelector('.awv-page'));
        observer.cb([{ target: slot, isIntersecting: false }]);   // leaves while drawing
        pending.shift()?.();
        await new Promise((r) => setTimeout(r, 10));
        expect(slot.querySelector('canvas')).toBe(null);
        stage.destroy();
        scroller.remove();
        globalThis.IntersectionObserver = original;
    });
});
