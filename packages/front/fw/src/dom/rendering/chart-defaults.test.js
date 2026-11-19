// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// chart defaults: round ticks inside the domain, labelled at their step's
// precision; a plot padding that fits the labels; fills translucent by
// globalAlpha so any CSS colour works.

import { describe, test, expect } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { chart } from './chart.js';
import { dom } from '../query/dom.js';
import { secPolicy } from './secPolicy.js';
import { animate } from '../display/animate.js';
import { stats } from '../../io/math/stats.js';
import { linalg } from '../../io/math/linalg.js';
import { easing } from '../../io/calc/easing.js';

const inst = chart.factory(dom.factory(secPolicy.factory()), animate.factory(easing.factory()), stats.factory(), linalg.factory());

class Ctx {
    constructor(measure) {
        this.calls = []; this.globalAlpha = 1; this.fillStyle = ''; this.strokeStyle = ''; this.font = '';
        if (measure) this.measureText = (t) => ({ width: 6.5 * String(t).length });
    }
    save() {} restore() {} beginPath() {} closePath() {} scale() {} clearRect() {}
    moveTo(x, y) { this.calls.push(['moveTo', x, y]); }
    lineTo(x, y) { this.calls.push(['lineTo', x, y]); }
    bezierCurveTo() {}
    stroke() {}
    fill() { this.calls.push(['fill', this.fillStyle, this.globalAlpha]); }
    fillRect(...a) { this.calls.push(['fillRect', this.fillStyle, this.globalAlpha]); }
    strokeRect() {}
    fillText(text, x, y) { this.calls.push(['fillText', text, x, y]); }
}

function canvas(ctx, w = 300, h = 150) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext = () => ctx;
    return c;
}

/** The y labels (right-aligned at left - 6) and x labels (at the bottom), in draw order. */
function labels(ctx) {
    const t = ctx.calls.filter((c) => c[0] === 'fillText');
    const bottom = Math.max(...t.map((c) => c[3]));
    return { y: t.filter((c) => c[3] !== bottom).map((c) => c[1]), x: t.filter((c) => c[3] === bottom).map((c) => c[1]) };
}

describe('chart default ticks', () => {
    const cases = [
        ['explicit [0, 100]', { yAxis: { domain: [0, 100] }, xAxis: { domain: [0, 10] } }, ['0', '25', '50', '75', '100'], ['0', '2.5', '5', '7.5', '10']],
        ['the examples lane: 300-1000 ms over days', { data: [300, 450, 700, 1000, 820, 610], xAxis: { domain: [0, 5] } }, ['400', '600', '800', '1000'], ['0', '2', '4']],   // 5 intervals of 1 exceed count - 1: step 2
        ['[0, 0.3]: no 0.2999…', { yAxis: { domain: [0, 0.3] }, xAxis: { domain: [0, 1] } }, ['0', '0.1', '0.2', '0.3'], ['0', '0.25', '0.5', '0.75', '1']],
        ['negative [-7, 3]', { yAxis: { domain: [-7, 3] }, xAxis: { domain: [0, 4] } }, ['-5', '-2.5', '0', '2.5'], ['0', '1', '2', '3', '4']],
        ['small [0.001, 0.009]', { yAxis: { domain: [0.001, 0.009] }, xAxis: { domain: [0, 4] } }, ['0.002', '0.004', '0.006', '0.008'], ['0', '1', '2', '3', '4']],
    ];
    for (const [name, opts, wantY, wantX] of cases) {
        test(name, () => {
            const ctx = new Ctx(true);
            const h = inst.line({ el: canvas(ctx), data: opts.data || [0, 1], ...opts });
            const l = labels(ctx);
            expect(l.y).toEqual(wantY);
            expect(l.x).toEqual(wantX);
            h.dispose();
        });
    }

    test('a constant series still gets a tick', () => {
        const ctx = new Ctx(true);
        const h = inst.line({ el: canvas(ctx), data: [5, 5, 5] });
        expect(labels(ctx).y.length).toBeGreaterThan(0);
        expect(labels(ctx).y).toContain('5');
        h.dispose();
    });

    test('given ticks and format are kept as they are', () => {
        const ctx = new Ctx(true);
        const h = inst.line({ el: canvas(ctx), data: [0, 1], yAxis: { domain: [0, 1], ticks: [0, 0.333], format: (v) => 'v' + v } });
        expect(labels(ctx).y).toEqual(['v0', 'v0.333']);
        h.dispose();
    });
});

describe('chart padding fits its labels', () => {
    for (const measure of [true, false]) {
        test(`a "1000 ms" y label (${measure ? 'measureText' : 'estimated width'})`, () => {
            const ctx = new Ctx(measure);
            const h = inst.line({ el: canvas(ctx), data: [0, 1000], yAxis: { domain: [0, 1000], format: (v) => v + ' ms' }, xAxis: { domain: [0, 1] } });
            const w = (measure ? 6.5 : 6) * '1000 ms'.length;
            const left = h._state.pad.left;
            expect(left).toBeGreaterThanOrEqual(Math.ceil(w) + 8);
            expect(ctx.calls).toContainEqual(['moveTo', left, 10]);     // the y axis line at the padding
            const yLabel = ctx.calls.find((c) => c[0] === 'fillText' && c[1] === '1000 ms');
            expect(yLabel[2] - w).toBeGreaterThanOrEqual(0);               // the label's left edge inside the canvas
            h.dispose();
        });
    }

    test('short labels keep the 40 / 10 px padding', () => {
        const ctx = new Ctx(true);
        const h = inst.line({ el: canvas(ctx), data: [0, 1], yAxis: { domain: [0, 100] }, xAxis: { domain: [0, 10] } });
        expect(h._state.pad).toEqual({ top: 10, bottom: 30, left: 40, right: 10 });
        h.dispose();
    });
});

describe('chart colours', () => {
    for (const color of ['rgb(10, 120, 200)', 'rebeccapurple', '#abc', '#11223380', 'hsl(200 80% 50%)']) {
        test(`area and bar fill with ${color} as given, translucent by alpha`, () => {
            const a = new Ctx(true);
            const ha = inst.area({ el: canvas(a), data: [1, 3, 2], color });
            const fill = a.calls.find((c) => c[0] === 'fill');
            expect(fill[1]).toBe(color);
            expect(fill[2]).toBeCloseTo(0x33 / 255, 10);
            ha.dispose();
            const b = new Ctx(true);
            const hb = inst.bar({ el: canvas(b), data: [1, 3, 2], color });
            const rect = b.calls.find((c) => c[0] === 'fillRect');
            expect(rect[1]).toBe(color);
            expect(rect[2]).toBeCloseTo(0xaa / 255, 10);
            hb.dispose();
        });
    }
});
