// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Unit tests for `pageflip.fold` — the aJSFlip curl geometry
 * kernel. Covers the three edge-case classes the plan calls out (SHALLOW /
 * DIAGONAL / STEEP), the degenerate rest state, finite coordinates, the salvage
 * kernel constants (margin, pattern counter-transform), and capture-freedom (no
 * shared mutable state across factory instances).
 */

import { describe, test, expect } from 'bun:test';
import { foldModule } from './fold.js';

const { fold, clampCorner, margin, EDGE_CASES } = foldModule.factory();

const PAGE = { width: 320, height: 480 };

// ── Descriptor shape ─────────────────────────────────────────────────────────

describe('foldModule descriptor', () => {
    test('name / type / version and no deps (pure kernel)', () => {
        expect(foldModule.name).toBe('pageflip.fold');
        expect(foldModule.type).toBe('lib.graphic.pageflip');
        expect(foldModule.version).toBe('0.1.0');
        expect(foldModule.dependencies).toEqual([]);
        expect(foldModule.deps).toEqual([]);
    });

    test('factory returns the kernel surface', () => {
        const api = foldModule.factory();
        expect(typeof api.fold).toBe('function');
        expect(typeof api.clampCorner).toBe('function');
        expect(typeof api.margin).toBe('function');
        expect(typeof api.EDGE_CASES).toBe('object');
    });
});

// ── Degenerate rest ──────────────────────────────────────────────────────────

describe('degenerate rest (fold param 0)', () => {
    test('corner at the outer top-right collapses the turn polygon to the origin', () => {
        const r = fold({ x: PAGE.width, y: 0 }, PAGE);
        expect(r.degenerate).toBe(true);
        expect(r.turn.length).toBe(4);
        for (const p of r.turn) {
            expect(p.x).toBeCloseTo(0, 6);
            expect(p.y).toBeCloseTo(0, 6);
            expect(Number.isFinite(p.x)).toBe(true);
            expect(Number.isFinite(p.y)).toBe(true);
        }
        // No pattern shear at rest — and no NaN / negative-radius artifact.
        expect(r.pattern).toEqual({ x: 0, y: 0, rotate: 0 });
    });

    test('the under polygon has 5 vertices, all finite, even at rest', () => {
        const r = fold({ x: PAGE.width, y: 0 }, PAGE);
        expect(r.under.length).toBe(5);
        for (const p of r.under) {
            expect(Number.isFinite(p.x)).toBe(true);
            expect(Number.isFinite(p.y)).toBe(true);
        }
    });
});

// ── The three edge-case classes ──────────────────────────────────────────────

describe('edge-case classes (SHALLOW > -45 / DIAGONAL = -45 / STEEP < -45)', () => {
    /** @type {Array<{label:string, corner:{x:number,y:number}, edgeCase:string, band:(a:number)=>boolean}>} */
    const cases = [
        {
            label: 'SHALLOW (angle > -45)',
            corner: { x: PAGE.width * 0.6, y: PAGE.height * 0.05 },
            edgeCase: EDGE_CASES.SHALLOW,
            band: (a) => a > -45 && a < 0,
        },
        {
            label: 'DIAGONAL (angle = -45)',
            corner: { x: PAGE.width * 0.5, y: 0 },
            edgeCase: EDGE_CASES.DIAGONAL,
            band: (a) => a === -45,
        },
        {
            label: 'STEEP (angle < -45)',
            corner: { x: PAGE.width * 0.3, y: -PAGE.height * 0.1 },
            edgeCase: EDGE_CASES.STEEP,
            band: (a) => a < -45,
        },
    ];

    for (const c of cases) {
        test(`${c.label}: 4-vertex turn + 5-vertex under, finite coords`, () => {
            const r = fold(c.corner, PAGE);
            expect(r.degenerate).toBe(false);
            expect(c.band(r.angle)).toBe(true);
            expect(r.edgeCase).toBe(c.edgeCase);
            expect(r.turn.length).toBe(4);
            expect(r.under.length).toBe(5);
            for (const p of [...r.turn, ...r.under]) {
                expect(Number.isFinite(p.x)).toBe(true);
                expect(Number.isFinite(p.y)).toBe(true);
            }
        });
    }
});

// ── Salvage kernel constants ─────────────────────────────────────────────────

describe('salvage kernel constants', () => {
    test('margin term = sqrt(w² + h²) − h (spine-circle radius)', () => {
        expect(margin(320, 480)).toBeCloseTo(Math.sqrt(320 * 320 + 480 * 480) - 480, 6);
        expect(margin(3, 4)).toBeCloseTo(5 - 4, 6); // 3-4-5 triangle
    });

    test('pattern counter-transform rotate = -2*(angle + 45)', () => {
        const r = fold({ x: PAGE.width * 0.3, y: PAGE.height * 0.2 }, PAGE);
        expect(r.pattern.rotate).toBeCloseTo(-2 * (r.angle + 45), 6);
    });

    test('corner-clamp keeps a far drag on / inside the spine circle (no negative radius)', () => {
        const marg = margin(PAGE.width, PAGE.height);
        const clamped = clampCorner(PAGE.width * 2, PAGE.height * 0.3, PAGE.width, PAGE.height, marg);
        const radius = Math.hypot(clamped.x, clamped.y);
        expect(radius).toBeLessThanOrEqual(PAGE.width + 1e-6);
        expect(Number.isFinite(radius)).toBe(true);
    });

    test('corner clamped to the spine (0,0) is a real non-degenerate turn', () => {
        const r = fold({ x: 0, y: 0 }, PAGE);
        expect(r.degenerate).toBe(false);
        expect(r.corner.x).toBeCloseTo(0, 6);
        const xs = r.turn.map((p) => p.x);
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0);
    });
});

// ── Capture-freedom / no shared mutable state ────────────────────────────────

describe('capture-free (no shared mutable table across factory instances)', () => {
    test('two factory instances have independent closures + tables', () => {
        const a = foldModule.factory();
        const b = foldModule.factory();
        expect(a.fold).not.toBe(b.fold);
        expect(a.EDGE_CASES).not.toBe(b.EDGE_CASES);
    });

    test('the same input yields identical output across instances (deterministic, no leak)', () => {
        const a = foldModule.factory();
        const b = foldModule.factory();
        const corner = { x: PAGE.width * 0.4, y: PAGE.height * 0.1 };
        const ra = a.fold(corner, PAGE);
        // Mutate ra's output; it must not affect a fresh solve on the other instance.
        ra.turn[0].x = 99999;
        const rb = b.fold(corner, PAGE);
        const ra2 = a.fold(corner, PAGE);
        expect(rb.turn).toEqual(ra2.turn);
    });
});

// ── Clip geometry along the old turn path ───────────────────────────────────
// `graphic.pageflip` clips the current page to `under` and draws the leaf from
// `turn`. Along the old aJSFlip corner path, (w,0) → (0,0.1h) → (−w,0), the leaf
// is the lifted part reflected about the crease: the two areas always add up
// to the page, and the unlifted part only ever shrinks.

describe('clip geometry along the turn path', () => {
    /** Shoelace area of a closed polygon. */
    const area = (pts) => {
        let s = 0;
        for (let i = 0; i < pts.length; i += 1) {
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            s += a.x * b.y - b.x * a.y;
        }
        return Math.abs(s) / 2;
    };
    /** The old two-leg corner path at `p ∈ [0,1]`. */
    const cornerAt = (p, w, h) => (p <= 0.5
        ? { x: w * (1 - 2 * p), y: 0.1 * h * 2 * p }
        : { x: -w * (2 * p - 1), y: 0.1 * h * (2 - 2 * p) });

    for (const page of [{ width: 400, height: 560 }, PAGE, { width: 600, height: 400 }]) {
        test(`under + leaf = page, under never grows (${page.width}×${page.height})`, () => {
            const wh = page.width * page.height;
            let prev = Infinity;
            for (let k = 0; k <= 40; k += 1) {
                const p = k / 40;
                const r = fold(cornerAt(p, page.width, page.height), page);
                const au = area(r.under);
                const at = area(r.turn);
                expect(Math.abs(au + at - wh) / wh).toBeLessThan(1e-6);
                expect(au).toBeLessThanOrEqual(prev + 1e-6);
                prev = au;
            }
            expect(area(fold(cornerAt(0, page.width, page.height), page).under)).toBeCloseTo(wh, 6);
            expect(area(fold(cornerAt(1, page.width, page.height), page).under)).toBeCloseTo(0, 6);
        });
    }
});

// ── The FLAT case (angle exactly 0) ─────────────────────────────────────────
// A corner moved along the diagonal (dx = dy, the hover peel) gives an angle of
// exactly 0. The legacy FLAT branch took the reflected point itself as the
// leaf's top vertex, so the leaf reached far above the page; the crease meets
// the top edge at (w − d, 0).

describe('FLAT case: a corner on the diagonal', () => {
    const area = (pts) => {
        let s = 0;
        for (let i = 0; i < pts.length; i += 1) {
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            s += a.x * b.y - b.x * a.y;
        }
        return Math.abs(s) / 2;
    };

    for (const d of [10, 40, 80, 120]) {
        test(`d = ${d}: a triangle inside the page, under + leaf = page`, () => {
            const r = fold({ x: PAGE.width - d, y: d }, PAGE);
            expect(r.edgeCase).toBe(EDGE_CASES.FLAT);
            for (const q of r.turn) expect(q.y).toBeGreaterThanOrEqual(-1e-9);
            expect(r.turn[1].x).toBeCloseTo(PAGE.width - d, 9);
            expect(r.turn[1].y).toBeCloseTo(0, 9);
            const wh = PAGE.width * PAGE.height;
            expect(Math.abs(area(r.under) + area(r.turn) - wh) / wh).toBeLessThan(1e-9);
        });
    }
});
