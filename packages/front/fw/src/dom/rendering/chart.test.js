// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Unit tests for `chart` (extended BATCH_28/13 — restoration II).
 *
 * happy-dom ownership: `GlobalRegistrator.register()` leaks DOM globals into
 * every sibling file of the same bun process (memory/types/fw, 2026-07-28), so
 * this file registers ONLY when no document exists yet and unregisters in
 * `afterAll` under that same ownership flag — never tearing down a realm a
 * sibling installed. Verbatim idiom reused from devtools-ui.test.js.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';

let _ownsDom = false;
if (typeof globalThis.document === 'undefined') {
    GlobalRegistrator.register();
    _ownsDom = true;
}

import { describe, test, expect, beforeEach, afterAll } from 'bun:test';

import { chart } from './chart.js';
import { dom } from '../query/dom.js';
import { secPolicy } from './secPolicy.js';
import { animate } from '../display/animate.js';
import { stats } from '../../io/math/stats.js';
import { linalg } from '../../io/math/linalg.js';
import { easing } from '../../io/calc/easing.js';

afterAll(async () => {
    if (_ownsDom) {
        _ownsDom = false;
        await GlobalRegistrator.unregister();
    }
});

// Instances wiring manuel
const domInst     = dom.factory(secPolicy.factory());
const easingInst  = easing.factory();
const animateInst = animate.factory(easingInst);
const statsInst   = stats.factory();
const linalgInst  = linalg.factory();
const inst        = chart.factory(domInst, animateInst, statsInst, linalgInst);

// Helper : canvas happy-dom
function makeCanvas(w = 300, h = 150) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    // happy-dom ne fournit pas de vraie 2D mais getContext retourne un objet
    return canvas;
}

/**
 * A recording stand-in for `CanvasRenderingContext2D`.
 *
 * happy-dom's `getContext('2d')` returns `null` (measured, BATCH_28/13
 * probe), which makes chart.js's `_setupContext` bail via `if (!ctx) return;`
 * — so under plain happy-dom NONE of the actual drawing code (`_drawAxes`,
 * `_renderLine`, `_renderBar`, sparkline's own draw, `_drawAnimated`) ever
 * runs. This mock is installed via `canvas.getContext = () => mock` so those
 * branches execute for real and every drawing call (with its exact pixel
 * arguments) can be asserted against independently hand-computed fixtures.
 */
class MockCtx2D {
    constructor() {
        this.calls = [];
        this.strokeStyle = '';
        this.fillStyle = '';
        this.lineWidth = 1;
        this.font = '';
        this.textAlign = '';
        this.textBaseline = '';
        this.globalAlpha = 1;
    }
    save() { this.calls.push(['save']); }
    restore() { this.calls.push(['restore']); }
    beginPath() { this.calls.push(['beginPath']); }
    closePath() { this.calls.push(['closePath']); }
    moveTo(x, y) { this.calls.push(['moveTo', x, y]); }
    lineTo(x, y) { this.calls.push(['lineTo', x, y]); }
    bezierCurveTo(...a) { this.calls.push(['bezierCurveTo', ...a]); }
    stroke() { this.calls.push(['stroke', this.strokeStyle, this.lineWidth]); }
    fill() { this.calls.push(['fill', this.fillStyle]); }
    fillRect(...a) { this.calls.push(['fillRect', ...a, this.fillStyle]); }
    strokeRect(...a) { this.calls.push(['strokeRect', ...a, this.strokeStyle]); }
    clearRect(...a) { this.calls.push(['clearRect', ...a]); }
    scale(...a) { this.calls.push(['scale', ...a]); }
    fillText(text, x, y) { this.calls.push(['fillText', text, x, y]); }
}

/**
 * @param {number} [w]
 * @param {number} [h]
 * @returns {{canvas: HTMLCanvasElement, ctx: MockCtx2D}}
 */
function makeMockedCanvas(w = 300, h = 150) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = new MockCtx2D();
    canvas.getContext = () => ctx;
    return { canvas, ctx };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('chart module', () => {

    // 1 - Metadata
    test('has correct metadata', () => {
        expect(chart.name).toBe('chart');
        expect(chart.version).toBe('1.0.0');
        expect(chart.type).toBe('fw.dom.rendering');
        expect(chart.dependencies).toEqual(['dom', 'animate', 'stats', 'linalg']);
        expect(typeof chart.factory).toBe('function');
    });

    // 2 - API factory
    describe('factory', () => {
        test('returns all public methods', () => {
            expect(typeof inst.line).toBe('function');
            expect(typeof inst.area).toBe('function');
            expect(typeof inst.bar).toBe('function');
            expect(typeof inst.sparkline).toBe('function');
        });
    });

    // 3a - chart.line
    describe('line', () => {
        let handle;

        beforeEach(() => {
            handle = inst.line({ el: makeCanvas(), data: [1, 2, 3, 4] });
        });

        test('returns handle with expected API', () => {
            expect(typeof handle.update).toBe('function');
            expect(typeof handle.resize).toBe('function');
            expect(typeof handle.setOpts).toBe('function');
            expect(typeof handle.dispose).toBe('function');
        });

        test('update modifies internal state data', () => {
            handle.update([10, 20, 30]);
            expect(handle._state.data.length).toBe(3);
            expect(handle._state.data[0]).toEqual({ x: 0, y: 10 });
            expect(handle._state.data[2]).toEqual({ x: 2, y: 30 });
        });

        test('accepts {x,y}[] data', () => {
            handle.update([{ x: 0, y: 5 }, { x: 1, y: 10 }]);
            expect(handle._state.data[1].y).toBe(10);
        });

        test('auto-fit yDomain from data [1,5]', () => {
            const h2 = inst.line({
                el: makeCanvas(),
                data: [{ x: 0, y: 1 }, { x: 1, y: 5 }],
            });
            const [yMin, yMax] = h2._state.yDomain;
            // Domain doit couvrir [1..5] avec padding 5%
            expect(yMin).toBeLessThanOrEqual(1);
            expect(yMax).toBeGreaterThanOrEqual(5);
            h2.dispose();
        });

        test('setOpts updates color and triggers redraw', () => {
            // Ne doit pas throw
            expect(() => handle.setOpts({ color: '#ff0000' })).not.toThrow();
        });

        test('dispose does not throw and disconnects observer', () => {
            expect(() => handle.dispose()).not.toThrow();
        });

        test('dispose is idempotent', () => {
            handle.dispose();
            expect(() => handle.dispose()).not.toThrow();
        });
    });

    // 3b - chart.area
    describe('area', () => {
        test('returns handle with expected API', () => {
            const h = inst.area({ el: makeCanvas(), data: [1, 2, 3] });
            expect(typeof h.update).toBe('function');
            expect(typeof h.dispose).toBe('function');
            h.dispose();
        });

        test('auto-fit domain matches data range', () => {
            const h = inst.area({
                el: makeCanvas(),
                data: [{ x: 0, y: 1 }, { x: 1, y: 5 }],
            });
            const [yMin, yMax] = h._state.yDomain;
            expect(yMin).toBeLessThanOrEqual(1);
            expect(yMax).toBeGreaterThanOrEqual(5);
            h.dispose();
        });
    });

    // 3c - chart.bar
    describe('bar', () => {
        test('returns handle with expected API', () => {
            const h = inst.bar({ el: makeCanvas(), data: [5, 10, 7] });
            expect(typeof h.update).toBe('function');
            expect(typeof h.resize).toBe('function');
            h.dispose();
        });

        test('update modifies state', () => {
            const h = inst.bar({ el: makeCanvas(), data: [1, 2, 3] });
            h.update([4, 5]);
            expect(h._state.data.length).toBe(2);
            h.dispose();
        });
    });

    // 3d - chart.sparkline
    describe('sparkline', () => {
        test('returns handle with expected API', () => {
            const h = inst.sparkline({ el: makeCanvas(), data: [1, 2, 3] });
            expect(typeof h.update).toBe('function');
            expect(typeof h.resize).toBe('function');
            expect(typeof h.setOpts).toBe('function');
            expect(typeof h.dispose).toBe('function');
        });

        test('update modifies state', () => {
            const h = inst.sparkline({ el: makeCanvas(), data: [1, 2, 3] });
            h.update([10, 20]);
            expect(h._state.data.length).toBe(2);
            h.dispose();
        });

        test('dispose detaches ResizeObserver if present', () => {
            const container = document.createElement('div');
            document.body.appendChild(container);
            const h = inst.sparkline({ el: container, data: [1, 2] });
            expect(() => h.dispose()).not.toThrow();
            document.body.removeChild(container);
        });
    });

    // 4 - Auto-fit domain
    describe('domain auto-fit', () => {
        test('line: data [{x:0,y:1},{x:1,y:5}] → yDomain covers [1,5]', () => {
            const h = inst.line({
                el: makeCanvas(),
                data: [{ x: 0, y: 1 }, { x: 1, y: 5 }],
            });
            const [yMin, yMax] = h._state.yDomain;
            expect(yMin).toBeLessThanOrEqual(1);
            expect(yMax).toBeGreaterThanOrEqual(5);
            h.dispose();
        });

        test('explicit domain is respected', () => {
            const h = inst.line({
                el: makeCanvas(),
                data: [{ x: 0, y: 1 }, { x: 1, y: 5 }],
                yAxis: { domain: [0, 100] },
            });
            const [yMin, yMax] = h._state.yDomain;
            expect(yMin).toBe(0);
            expect(yMax).toBe(100);
            h.dispose();
        });
    });

    // 5 - dispose detaches ResizeObserver
    describe('dispose', () => {
        test('detaches ResizeObserver on container el', () => {
            const container = document.createElement('div');
            document.body.appendChild(container);
            const h = inst.line({ el: container, data: [1, 2, 3] });
            expect(() => h.dispose()).not.toThrow();
            document.body.removeChild(container);
        });

        test('multiple dispose calls are safe', () => {
            const h = inst.bar({ el: makeCanvas(), data: [1] });
            h.dispose();
            h.dispose();
        });
    });

    // Cas limites
    describe('edge cases', () => {
        test('empty data does not throw', () => {
            expect(() => inst.line({ el: makeCanvas(), data: [] })).not.toThrow();
        });

        test('single point data', () => {
            const h = inst.line({ el: makeCanvas(), data: [42] });
            expect(h._state.data.length).toBe(1);
            h.dispose();
        });

        test('flat data (all same value)', () => {
            const h = inst.line({ el: makeCanvas(), data: [5, 5, 5] });
            const [yMin, yMax] = h._state.yDomain;
            expect(yMax).toBeGreaterThan(yMin);
            h.dispose();
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    // 6 - Real canvas drawing (mocked 2D context) — restoration II
    //
    // PAD = { top: 10, right: 10, bottom: 30, left: 40 }. For the default
    // 300x150 canvas: cw = 300-40-10 = 250, ch = 150-10-30 = 110.
    // ─────────────────────────────────────────────────────────────────────
    describe('axis rendering (mocked context)', () => {
        test('draws Y and X tick labels/positions matching hand-computed pixels for an explicit domain', () => {
            const { canvas, ctx } = makeMockedCanvas(300, 150);
            const h = inst.line({
                el: canvas,
                data: [{ x: 0, y: 0 }, { x: 10, y: 100 }],
                xAxis: { domain: [0, 10] },
                yAxis: { domain: [0, 100] },
            });

            // _ticks(min,max,5): step = (max-min)/4
            // yTicks = [0,25,50,75,100]; py = pt+ch - scale(t,0,100,110) = 120 - 1.1*t
            const yTickCalls = ctx.calls.filter(c => c[0] === 'fillText' && c[2] === 34);
            expect(yTickCalls.map(c => c[1])).toEqual(['0', '25', '50', '75', '100']);
            expect(yTickCalls.map(c => Math.round(c[3] * 100) / 100)).toEqual([120, 92.5, 65, 37.5, 10]);

            // xTicks = [0,2.5,5,7.5,10]; px = pl + scale(t,0,10,250) = 40 + 25*t; label baseline y = pt+ch+6 = 126
            const xTickCalls = ctx.calls.filter(c => c[0] === 'fillText' && c[3] === 126);
            expect(xTickCalls.map(c => c[1])).toEqual(['0', '2.5', '5', '7.5', '10']);
            expect(xTickCalls.map(c => Math.round(c[2] * 100) / 100)).toEqual([40, 102.5, 165, 227.5, 290]);

            // Baseline axes: moveTo(pl,pt) -> lineTo(pl,pt+ch) -> lineTo(pl+cw,pt+ch)
            expect(ctx.calls).toContainEqual(['moveTo', 40, 10]);
            expect(ctx.calls).toContainEqual(['lineTo', 40, 120]);
            expect(ctx.calls).toContainEqual(['lineTo', 290, 120]);

            h.dispose();
        });

        test('bar chart also draws axes (both branches of _draw share _drawAxes)', () => {
            const { canvas, ctx } = makeMockedCanvas(300, 150);
            const h = inst.bar({
                el: canvas,
                data: [{ x: 0, y: 0 }, { x: 10, y: 100 }],
                xAxis: { domain: [0, 10] },
                yAxis: { domain: [0, 100] },
            });
            expect(ctx.calls).toContainEqual(['moveTo', 40, 10]);
            expect(ctx.calls.some(c => c[0] === 'fillText' && c[1] === '50')).toBe(true);
            h.dispose();
        });
    });

    describe('line rendering — monotone smoothing (mocked context)', () => {
        test('perfectly linear data: bezier control points degenerate to the straight-line positions', () => {
            const { canvas, ctx } = makeMockedCanvas(300, 150);
            const h = inst.line({
                el: canvas,
                data: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }],
                xAxis: { domain: [0, 2] },
                yAxis: { domain: [0, 2] },
                smoothing: 'monotone',
            });

            const bez = ctx.calls.filter(c => c[0] === 'bezierCurveTo');
            expect(bez.length).toBe(2); // pts.length - 1

            // cw=250 over domain span 2 -> toX(v) = 40 + v*125; ch=110 over span 2 -> toY(v) = 120 - v*55
            const toX = v => 40 + v * 125;
            const toY = v => 120 - v * 55;
            const close = (a, b) => Math.abs(a - b) < 1e-6;

            const [cp1x, cp1y, cp2x, cp2y, ex, ey] = bez[0].slice(1);
            expect(close(cp1x, toX(1 / 3))).toBe(true);
            expect(close(cp1y, toY(1 / 3))).toBe(true);
            expect(close(cp2x, toX(2 / 3))).toBe(true);
            expect(close(cp2y, toY(2 / 3))).toBe(true);
            expect(close(ex, toX(1))).toBe(true);
            expect(close(ey, toY(1))).toBe(true);

            h.dispose();
        });

        test('a direction reversal at the middle point flattens its tangent (d0*d1<=0 branch)', () => {
            const { canvas, ctx } = makeMockedCanvas(300, 150);
            const h = inst.line({
                el: canvas,
                data: [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 0 }],
                xAxis: { domain: [0, 2] },
                yAxis: { domain: [0, 2] },
                smoothing: 'monotone',
            });

            const toX = v => 40 + v * 125;
            const toY = v => 120 - v * 55;
            const close = (a, b) => Math.abs(a - b) < 1e-6;

            const bez = ctx.calls.filter(c => c[0] === 'bezierCurveTo');
            expect(bez.length).toBe(2);
            // Segment 0 (i=0 -> i=1): slope at the peak (i=1) is flattened to 0, so cp2's y
            // sits exactly at the peak height instead of drifting past it.
            const [, , cp2x0, cp2y0] = bez[0].slice(1);
            expect(close(cp2x0, toX(2 / 3))).toBe(true);
            expect(close(cp2y0, toY(2))).toBe(true);

            h.dispose();
        });

        test('area chart fills under the curve with a low-alpha color then re-strokes on top', () => {
            const { canvas, ctx } = makeMockedCanvas(300, 150);
            const h = inst.area({
                el: canvas,
                data: [1, 2, 3],
                color: '#112233',
                xAxis: { domain: [0, 2] },
                yAxis: { domain: [0, 3] },
            });

            const fillCalls = ctx.calls.filter(c => c[0] === 'fill');
            expect(fillCalls).toEqual([['fill', '#11223333']]);

            const strokeCalls = ctx.calls.filter(c => c[0] === 'stroke');
            expect(strokeCalls.length).toBeGreaterThanOrEqual(1);
            expect(strokeCalls[strokeCalls.length - 1]).toEqual(['stroke', '#112233', 1.5]);

            h.dispose();
        });

        test('area + monotone smoothing re-emits the bezier curve inside the fill re-stroke path', () => {
            const { canvas, ctx } = makeMockedCanvas(300, 150);
            const h = inst.area({
                el: canvas,
                data: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }],
                smoothing: 'monotone',
                xAxis: { domain: [0, 2] },
                yAxis: { domain: [0, 2] },
            });
            // 2 segments drawn once for the fill path, then re-drawn once more for the stroke-on-top pass.
            const bez = ctx.calls.filter(c => c[0] === 'bezierCurveTo');
            expect(bez.length).toBe(4);
            h.dispose();
        });
    });

    describe('bar rendering (mocked context)', () => {
        test('draws one fillRect/strokeRect per positive-height bar, skipping a zero-height bar', () => {
            const { canvas, ctx } = makeMockedCanvas(300, 150);
            const h = inst.bar({
                el: canvas,
                data: [{ x: 0, y: 5 }, { x: 1, y: 0 }, { x: 2, y: 5 }],
                xAxis: { domain: [0, 2] },
                yAxis: { domain: [0, 5] },
                color: '#ff0000',
            });

            const fillRects = ctx.calls.filter(c => c[0] === 'fillRect');
            const strokeRects = ctx.calls.filter(c => c[0] === 'strokeRect');
            // Middle bar (y=0) lands exactly on the baseline: bh = 0, which fails `bh > 0`.
            expect(fillRects.length).toBe(2);
            expect(strokeRects.length).toBe(2);

            // barW = max(2, cw/3*0.7) = 250/3*0.7; toX(0) = 40 (pl + scale(0,0,2,250))
            const barW = (250 / 3) * 0.7;
            const [bx, by, bw, bh] = fillRects[0].slice(1);
            expect(Math.abs(bx - (40 - barW / 2))).toBeLessThan(1e-6);
            expect(by).toBeCloseTo(10, 5); // toY(5) = pt+ch - scale(5,0,5,110) = 10
            expect(bw).toBeCloseTo(barW, 5);
            expect(bh).toBeCloseTo(110, 5); // baseline(120) - by(10)

            h.dispose();
        });
    });

    describe('resize / setOpts redraw (mocked context)', () => {
        test('resize triggers a redraw while live, and is a no-op after dispose', () => {
            const { canvas, ctx } = makeMockedCanvas();
            const h = inst.line({ el: canvas, data: [1, 2, 3] });
            const before = ctx.calls.filter(c => c[0] === 'clearRect').length;

            h.resize();
            expect(ctx.calls.filter(c => c[0] === 'clearRect').length).toBe(before + 1);

            h.dispose();
            const afterDispose = ctx.calls.filter(c => c[0] === 'clearRect').length;
            h.resize();
            expect(ctx.calls.filter(c => c[0] === 'clearRect').length).toBe(afterDispose);
        });

        test('setOpts with new data replaces _state.data and triggers a redraw', () => {
            const { canvas, ctx } = makeMockedCanvas();
            const h = inst.line({ el: canvas, data: [1, 2] });
            const before = ctx.calls.filter(c => c[0] === 'clearRect').length;

            h.setOpts({ data: [9, 8, 7] });

            expect(h._state.data.length).toBe(3);
            expect(h._state.data[0]).toEqual({ x: 0, y: 9 });
            expect(ctx.calls.filter(c => c[0] === 'clearRect').length).toBe(before + 1);
            h.dispose();
        });
    });

    describe('animate option (RAF-driven progressive redraw)', () => {
        test('schedules multiple redraws via requestAnimationFrame and settles', async () => {
            const { canvas, ctx } = makeMockedCanvas();
            const h = inst.line({ el: canvas, data: [1, 2, 3], animate: 1 });

            await new Promise(resolve => setTimeout(resolve, 150));

            const clears = ctx.calls.filter(c => c[0] === 'clearRect').length;
            // The synchronous initial render draws once; a short `animate` duration
            // still requires at least one more RAF-driven frame to reach t>=1.
            expect(clears).toBeGreaterThan(1);

            h.dispose();
        });
    });

    describe('sparkline rendering (mocked context)', () => {
        test('draws no axes and fits a padded domain to the full canvas', () => {
            const { canvas, ctx } = makeMockedCanvas(100, 50);
            const h = inst.sparkline({ el: canvas, data: [0, 10, 5] });

            const [xMin, xMax] = h._state.xDomain;
            const [yMin, yMax] = h._state.yDomain;
            expect(xMin).toBeLessThanOrEqual(0);
            expect(xMax).toBeGreaterThanOrEqual(2);
            expect(yMin).toBeLessThanOrEqual(0);
            expect(yMax).toBeGreaterThanOrEqual(10);

            expect(ctx.calls.filter(c => c[0] === 'moveTo').length).toBe(1);
            expect(ctx.calls.filter(c => c[0] === 'lineTo').length).toBe(2);
            // No axis fillText: sparkline never calls _drawAxes.
            expect(ctx.calls.some(c => c[0] === 'fillText')).toBe(false);

            h.dispose();
        });

        test('empty data clears the canvas and draws nothing else', () => {
            const { canvas, ctx } = makeMockedCanvas();
            const h = inst.sparkline({ el: canvas, data: [] });
            expect(ctx.calls.filter(c => c[0] === 'clearRect').length).toBe(1);
            expect(ctx.calls.some(c => c[0] === 'moveTo')).toBe(false);
            h.dispose();
        });

        test('setOpts with new data redraws with the updated point count', () => {
            const { canvas, ctx } = makeMockedCanvas();
            const h = inst.sparkline({ el: canvas, data: [1, 2] });
            const before = ctx.calls.filter(c => c[0] === 'lineTo').length;

            h.setOpts({ data: [1, 2, 3, 4] });

            const after = ctx.calls.filter(c => c[0] === 'lineTo').length;
            expect(after).toBeGreaterThan(before);
            expect(h._state.data.length).toBe(4);
            h.dispose();
        });
    });
});
