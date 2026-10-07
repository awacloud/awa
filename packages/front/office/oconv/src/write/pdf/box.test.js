// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { oconvPdfBox } from './box.js';

// `oconvPdfBox` declares no dependencies, but it is resolved through a real
// `ModuleRuntime` anyway: the descriptor shape (name / dependencies /
// factory arity) is part of what this suite pins, since task 07 registers it
// in `src/main.js` by name.
let box;

beforeAll(() => {
    const runtime = new ModuleRuntime();
    runtime.register(oconvPdfBox);
    box = runtime.resolve('oconvPdfBox');
});

/** A4 geometry, in PostScript points. */
const A4_W = 595.276;
const A4_H = 841.89;
/** The default margin (20 mm). */
const M = 56.693;

describe('oconvPdfBox — descriptor', () => {
    test('is a pure, dependency-free module descriptor', () => {
        expect(oconvPdfBox.name).toBe('oconvPdfBox');
        expect(oconvPdfBox.dependencies).toEqual([]);
        expect(typeof oconvPdfBox.factory).toBe('function');
    });

    test('publishes PAGE_SIZES, DEFAULTS and resolveLayout', () => {
        expect(Object.keys(box).sort()).toEqual(['DEFAULTS', 'PAGE_SIZES', 'resolveLayout']);
        expect(box.PAGE_SIZES.A4).toEqual([A4_W, A4_H]);
        expect(box.PAGE_SIZES.Letter).toEqual([612, 792]);
        expect(box.DEFAULTS).toEqual({
            pageSize: 'A4',
            margin: M,
            baseSize: 11,
            leadingRatio: 1.32,
            headingScale: [22, 18, 15, 13, 12, 11],
            codeSize: 9.5,
            pageNumbers: true
        });
    });
});

describe('resolveLayout — defaults', () => {
    test('an absent option block yields the A4 default layout', () => {
        const l = box.resolveLayout();
        expect(l.pageWidth).toBeCloseTo(A4_W, 6);
        expect(l.pageHeight).toBeCloseTo(A4_H, 6);
        expect(l.margin).toBeCloseTo(M, 6);
        expect(l.column).toBeCloseTo(A4_W - 2 * M, 6);
        expect(l.contentHeight).toBeCloseTo(A4_H - 2 * M, 6);
        expect(l.baseSize).toBe(11);
        expect(l.codeSize).toBe(9.5);
        expect(l.pageNumbers).toBe(true);
    });

    test('`null` and `{}` behave exactly like an absent block', () => {
        const a = box.resolveLayout();
        const b = box.resolveLayout(null);
        const c = box.resolveLayout({});
        for (const key of ['pageWidth', 'pageHeight', 'margin', 'column', 'contentHeight',
                           'baseSize', 'codeSize', 'pageNumbers']) {
            expect(b[key]).toBe(a[key]);
            expect(c[key]).toBe(a[key]);
        }
    });

    test('the returned layout is frozen (no stage may mutate the geometry)', () => {
        const l = box.resolveLayout();
        expect(Object.isFrozen(l)).toBe(true);
    });
});

describe('resolveLayout — page sizes', () => {
    test('Letter by name', () => {
        const l = box.resolveLayout({ pageSize: 'Letter' });
        expect(l.pageWidth).toBe(612);
        expect(l.pageHeight).toBe(792);
        expect(l.column).toBeCloseTo(612 - 2 * M, 6);
    });

    test('a custom [w, h] pair in points', () => {
        const l = box.resolveLayout({ pageSize: [300, 500], margin: 10 });
        expect(l.pageWidth).toBe(300);
        expect(l.pageHeight).toBe(500);
        expect(l.column).toBe(280);
        expect(l.contentHeight).toBe(480);
    });

    test('a zero margin is legal', () => {
        const l = box.resolveLayout({ margin: 0 });
        expect(l.margin).toBe(0);
        expect(l.column).toBeCloseTo(A4_W, 6);
        expect(l.contentHeight).toBeCloseTo(A4_H, 6);
    });
});

describe('resolveLayout — validation, one error shape per key', () => {
    /** Every rejection carries the offending key in `oconv: bad pdf option <key>`. */
    const rejects = (opts, key) =>
        expect(() => box.resolveLayout(opts)).toThrow(`oconv: bad pdf option ${key}`);

    test('unknown keys are rejected by name (D-C: the single opts.pdf validator)', () => {
        rejects({ pageSizes: 'A4' }, 'pageSizes');
        rejects({ margins: 10 }, 'margins');
        rejects({ leading: 1.4 }, 'leading');
    });

    test('`fonts` is accepted and ignored — it belongs to createMeasurer (D-A)', () => {
        const l = box.resolveLayout({ fonts: { regular: new Uint8Array([0]) } });
        expect(l.pageWidth).toBeCloseTo(A4_W, 6);
        expect(l.fonts).toBeUndefined();
    });

    test('pageSize', () => {
        rejects({ pageSize: 'A3' }, 'pageSize');
        rejects({ pageSize: [595] }, 'pageSize');
        rejects({ pageSize: [595, 0] }, 'pageSize');
        rejects({ pageSize: [-1, 100] }, 'pageSize');
        rejects({ pageSize: ['595', '842'] }, 'pageSize');
        rejects({ pageSize: 595 }, 'pageSize');
        rejects({ pageSize: [Number.NaN, 100] }, 'pageSize');
    });

    test('margin — non-negative and leaving a positive column on both axes', () => {
        rejects({ margin: -1 }, 'margin');
        rejects({ margin: A4_W / 2 }, 'margin');
        rejects({ margin: 300 }, 'margin');
        rejects({ margin: '10' }, 'margin');
        rejects({ margin: Number.POSITIVE_INFINITY }, 'margin');
        rejects({ pageSize: [200, 200], margin: 100 }, 'margin');
    });

    test('baseSize / leadingRatio / codeSize must be positive numbers', () => {
        rejects({ baseSize: 0 }, 'baseSize');
        rejects({ baseSize: -11 }, 'baseSize');
        rejects({ baseSize: '11' }, 'baseSize');
        rejects({ leadingRatio: 0 }, 'leadingRatio');
        rejects({ leadingRatio: null }, 'leadingRatio');
        rejects({ codeSize: 0 }, 'codeSize');
        rejects({ codeSize: [9.5] }, 'codeSize');
    });

    test('headingScale must be six positive numbers', () => {
        rejects({ headingScale: [22, 18, 15, 13, 12] }, 'headingScale');
        rejects({ headingScale: [22, 18, 15, 13, 12, 11, 10] }, 'headingScale');
        rejects({ headingScale: [22, 18, 15, 13, 12, 0] }, 'headingScale');
        rejects({ headingScale: 22 }, 'headingScale');
    });

    test('pageNumbers must be a boolean', () => {
        rejects({ pageNumbers: 'yes' }, 'pageNumbers');
        rejects({ pageNumbers: 1 }, 'pageNumbers');
        expect(box.resolveLayout({ pageNumbers: false }).pageNumbers).toBe(false);
    });

    test('a non-object option block is rejected as the `pdf` key itself', () => {
        rejects('A4', 'pdf');
        rejects([56.693], 'pdf');
        rejects(11, 'pdf');
    });
});

describe('resolveLayout — sizeFor / leading', () => {
    test('sizeFor("heading", 1..6) walks the default scale', () => {
        const l = box.resolveLayout();
        expect([1, 2, 3, 4, 5, 6].map((n) => l.sizeFor('heading', n)))
            .toEqual([22, 18, 15, 13, 12, 11]);
    });

    test('heading levels outside 1..6 clamp instead of reading off the array', () => {
        const l = box.resolveLayout();
        expect(l.sizeFor('heading', 0)).toBe(22);
        expect(l.sizeFor('heading', 9)).toBe(11);
        expect(l.sizeFor('heading')).toBe(22);
        expect(l.sizeFor('heading', 2.7)).toBe(18);
    });

    test('sizeFor("code") is the monospace size and anything else is the body size', () => {
        const l = box.resolveLayout({ baseSize: 12, codeSize: 10 });
        expect(l.sizeFor('code')).toBe(10);
        expect(l.sizeFor('paragraph')).toBe(12);
        expect(l.sizeFor()).toBe(12);
    });

    test('a custom headingScale is honoured and cannot be mutated afterwards', () => {
        const scale = [30, 26, 22, 18, 16, 14];
        const l = box.resolveLayout({ headingScale: scale });
        scale[0] = 99;
        expect(l.sizeFor('heading', 1)).toBe(30);
        expect(l.sizeFor('heading', 6)).toBe(14);
    });

    test('leading(size) = leadingRatio · size', () => {
        const l = box.resolveLayout();
        expect(l.leading(11)).toBeCloseTo(14.52, 9);
        expect(l.leading(22)).toBeCloseTo(29.04, 9);
        const tight = box.resolveLayout({ leadingRatio: 1 });
        expect(tight.leading(11)).toBe(11);
    });
});
