// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Unit tests for the pure `hypertree.layout` kernel — even-sector
 * subdivision, the `R/2^n` ring series, quadratic-bezier link controls,
 * determinism / edge cases, and the `focusMove` focus reallocation (recenter,
 * ancestor injection, per-depth 2^k angle scaling). No DOM, no scheduler.
 */

import { describe, test, expect } from 'bun:test';
import { hypertreeLayoutModule } from './layout.js';

const { layout, focusMove, ringRadius, TWO_PI, DEFAULT_RADIUS } = hypertreeLayoutModule.factory();

const R = 500;

/** A 3-level sample tree: root(3) → a(2), b(1), c(leaf). */
function sampleTree() {
    return {
        id: 'root',
        children: [
            { id: 'a', children: [{ id: 'a1' }, { id: 'a2' }] },
            { id: 'b', children: [{ id: 'b1' }] },
            { id: 'c' },
        ],
    };
}

const width = (n) => n.sector.end - n.sector.start;
const byId = (res) => new Map(res.nodes.map((n) => [n.id, n]));

// ── Descriptor shape ─────────────────────────────────────────────────────────

describe('hypertreeLayoutModule descriptor', () => {
    test('is a pure, Worker-safe leaf descriptor', () => {
        expect(hypertreeLayoutModule.name).toBe('hypertree.layout');
        expect(hypertreeLayoutModule.type).toBe('lib.graphic.hypertree');
        expect(hypertreeLayoutModule.version).toBe('0.1.0');
        expect(hypertreeLayoutModule.dependencies).toEqual([]);
        expect(hypertreeLayoutModule.deps).toEqual([]);
    });

    test('factory returns the kernel surface', () => {
        const api = hypertreeLayoutModule.factory();
        expect(typeof api.layout).toBe('function');
        expect(typeof api.focusMove).toBe('function');
        expect(typeof api.ringRadius).toBe('function');
        expect(api.TWO_PI).toBeCloseTo(Math.PI * 2, 10);
        expect(api.DEFAULT_RADIUS).toBe(500);
    });

    test('layout.js references no window/document (Worker-safe by contract)', async () => {
        const src = await Bun.file(new URL('./layout.js', import.meta.url)).text();
        const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        expect(/\bwindow\b/.test(body)).toBe(false);
        expect(/\bdocument\b/.test(body)).toBe(false);
    });
});

// ── ringRadius — the R/2^n series ─────────────────────────────────────────────

describe('ringRadius — R/2^n series', () => {
    test('depth 0 is the centre (0)', () => {
        expect(ringRadius(0, R)).toBe(0);
        expect(ringRadius(-3, R)).toBe(0);
    });

    test('increments halve each depth: ringRadius(d) − ringRadius(d−1) = R/2^d', () => {
        for (let d = 1; d <= 8; d += 1) {
            const inc = ringRadius(d, R) - ringRadius(d - 1, R);
            expect(inc).toBeCloseTo(R / Math.pow(2, d), 9);
        }
    });

    test('the series converges toward the boundary R', () => {
        expect(ringRadius(1, R)).toBeCloseTo(R / 2, 9);
        expect(ringRadius(2, R)).toBeCloseTo((3 * R) / 4, 9);
        expect(ringRadius(20, R)).toBeLessThan(R);
        expect(ringRadius(20, R)).toBeGreaterThan(R * 0.999);
    });
});

// ── layout — sectors, rings, positions, links ─────────────────────────────────

describe('layout — sector subdivision', () => {
    test('root sits at the centre (R, R), depth 0, over the full circle', () => {
        const res = layout(sampleTree(), { radius: R });
        const root = byId(res).get('root');
        expect(root.x).toBe(R);
        expect(root.y).toBe(R);
        expect(root.depth).toBe(0);
        expect(width(root)).toBeCloseTo(TWO_PI, 9);
    });

    test('the root children sectors partition the full circle', () => {
        const res = layout(sampleTree(), { radius: R });
        const m = byId(res);
        const kids = ['a', 'b', 'c'].map((id) => m.get(id));
        const total = kids.reduce((s, n) => s + width(n), 0);
        expect(total).toBeCloseTo(TWO_PI, 9);
        // three equal thirds
        for (const k of kids) expect(width(k)).toBeCloseTo(TWO_PI / 3, 9);
    });

    test("each node's children sectors partition that node's sector", () => {
        const res = layout(sampleTree(), { radius: R });
        const m = byId(res);
        const a = m.get('a');
        const a1 = m.get('a1');
        const a2 = m.get('a2');
        expect(width(a1) + width(a2)).toBeCloseTo(width(a), 9);
        expect(a1.sector.start).toBeCloseTo(a.sector.start, 9);
        expect(a2.sector.end).toBeCloseTo(a.sector.end, 9);
    });

    test('nodes sit on the ring for their depth', () => {
        const res = layout(sampleTree(), { radius: R });
        const m = byId(res);
        const dist = (n) => Math.hypot(n.x - R, n.y - R);
        expect(dist(m.get('a'))).toBeCloseTo(ringRadius(1, R), 6);
        expect(dist(m.get('a1'))).toBeCloseTo(ringRadius(2, R), 6);
    });
});

describe('layout — links (quadratic-bezier controls)', () => {
    test('one link per parent→child edge, each with a finite control point', () => {
        const res = layout(sampleTree(), { radius: R });
        expect(res.links.length).toBe(res.nodes.length - 1);
        for (const l of res.links) {
            expect(typeof l.from).toBe('string');
            expect(typeof l.to).toBe('string');
            expect(Number.isFinite(l.cx)).toBe(true);
            expect(Number.isFinite(l.cy)).toBe(true);
        }
    });

    test('the control point lies at the mean ring radius along the child angle', () => {
        const res = layout(sampleTree(), { radius: R });
        const m = byId(res);
        const a = m.get('a');
        const link = res.links.find((l) => l.from === 'root' && l.to === 'a');
        const midR = (ringRadius(0, R) + ringRadius(1, R)) / 2;
        expect(link.cx).toBeCloseTo(R + midR * Math.cos(a.angle), 6);
        expect(link.cy).toBeCloseTo(R + midR * Math.sin(a.angle), 6);
    });
});

describe('layout — edge cases + determinism', () => {
    test('single-node tree: one centred node, no links', () => {
        const res = layout({ id: 'solo' });
        expect(res.nodes.length).toBe(1);
        expect(res.links.length).toBe(0);
        expect(res.nodes[0].x).toBe(DEFAULT_RADIUS);
        expect(res.nodes[0].y).toBe(DEFAULT_RADIUS);
    });

    test('deep chain: single-child nodes inherit the full sector, one per ring', () => {
        const chain = { id: 'r', children: [{ id: 'x', children: [{ id: 'y', children: [{ id: 'z' }] }] }] };
        const res = layout(chain, { radius: R });
        const m = byId(res);
        expect(res.nodes.length).toBe(4);
        expect(m.get('z').depth).toBe(3);
        // a lone child keeps its parent's full sector width
        expect(width(m.get('x'))).toBeCloseTo(TWO_PI, 9);
        expect(width(m.get('z'))).toBeCloseTo(TWO_PI, 9);
    });

    test('wide fan: 8 children each get an eighth of the circle', () => {
        const fan = { id: 'r', children: Array.from({ length: 8 }, (_, i) => ({ id: `n${i}` })) };
        const res = layout(fan, { radius: R });
        for (const n of res.nodes) {
            if (n.depth === 1) expect(width(n)).toBeCloseTo(TWO_PI / 8, 9);
        }
    });

    test('deterministic for a fixed tree', () => {
        expect(layout(sampleTree(), { radius: R })).toEqual(layout(sampleTree(), { radius: R }));
    });

    test('throws on a tree with no id', () => {
        expect(() => layout({ children: [] })).toThrow('must be an object with an id');
        expect(() => layout(null)).toThrow();
    });

    test('throws on a cycle / duplicate id', () => {
        const dup = { id: 'root', children: [{ id: 'a' }, { id: 'a' }] };
        expect(() => layout(dup)).toThrow('cycle or duplicate id');
    });
});

// ── focusMove — re-rooting at the focus ─────────────────────────────────────
// The old `computeMove` re-roots the tree at the focus: the focus at the
// centre, its own children over `zoom` (270°) around its base angle, the rest
// of the tree, reached through the parent, over the remaining sector opposite.
// Rings follow the graph distance from the focus.

describe('focusMove — re-rooting at the focus', () => {
    /** Normalise an angle to (−π, π]. */
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    /** A wider tree: root(6) → each 3 leaves, one branch one level deeper. */
    function wideTree() {
        const branches = [];
        for (let b = 0; b < 6; b += 1) {
            const leaves = [];
            for (let l = 0; l < 3; l += 1) {
                const leaf = { id: `l${b}${l}` };
                if (b === 2) leaf.children = [{ id: `d${b}${l}a` }, { id: `d${b}${l}b` }];
                leaves.push(leaf);
            }
            branches.push({ id: `b${b}`, children: leaves });
        }
        return { id: 'root', children: branches };
    }

    test('focusing the root is a no-op (returns the input unchanged)', () => {
        const base = layout(sampleTree(), { radius: R });
        expect(focusMove(base, 'root')).toBe(base);
    });

    test('focusing a leaf recenters it at the centre, depth 0', () => {
        const base = layout(sampleTree(), { radius: R });
        const a1 = byId(focusMove(base, 'a1')).get('a1');
        expect(a1.depth).toBe(0);
        expect(a1.x).toBeCloseTo(R, 9);
        expect(a1.y).toBeCloseTo(R, 9);
    });

    test('every node of the original tree appears exactly once', () => {
        const base = layout(sampleTree(), { radius: R });
        const ids = focusMove(base, 'a1').nodes.map((n) => n.id).sort();
        expect(ids).toEqual(['a', 'a1', 'a2', 'b', 'b1', 'c', 'root']);
    });

    test('depth is the graph distance from the focus, on its ring', () => {
        const base = layout(sampleTree(), { radius: R });
        const m = byId(focusMove(base, 'a1'));
        const want = { a1: 0, a: 1, a2: 2, root: 2, b: 3, c: 3, b1: 4 };
        for (const [id, d] of Object.entries(want)) {
            const n = m.get(id);
            expect(n.depth).toBe(d);
            expect(Math.hypot(n.x - R, n.y - R)).toBeCloseTo(ringRadius(d, R), 6);
        }
    });

    test('the focus children share `zoom` (default 3π/2) around the focus base angle', () => {
        const base = layout(sampleTree(), { radius: R });
        const theta = byId(base).get('a').angle;
        const m = byId(focusMove(base, 'a'));
        const a1 = m.get('a1');
        const a2 = m.get('a2');
        expect(width(a1) + width(a2)).toBeCloseTo(1.5 * Math.PI, 9);
        expect(wrap((a1.sector.start + a2.sector.end) / 2 - theta)).toBeCloseTo(0, 9);
        // The rest of the tree, through the parent, takes the opposite quarter.
        const root = m.get('root');
        expect(width(root)).toBeCloseTo(0.5 * Math.PI, 9);
        expect(wrap(root.angle - (theta + Math.PI))).toBeCloseTo(0, 9);
    });

    test('opts.zoom sets the focus fan', () => {
        const base = layout(sampleTree(), { radius: R });
        const m = byId(focusMove(base, 'a', { zoom: Math.PI }));
        expect(width(m.get('a1')) + width(m.get('a2'))).toBeCloseTo(Math.PI, 9);
        expect(width(m.get('root'))).toBeCloseTo(Math.PI, 9);
    });

    test('a focus with no children gives the parent branch the whole circle', () => {
        const base = layout(sampleTree(), { radius: R });
        expect(width(byId(focusMove(base, 'a1')).get('a'))).toBeCloseTo(TWO_PI, 9);
    });

    test('re-rooted children keep the old cyclic order: after, ancestor, before', () => {
        const base = layout(sampleTree(), { radius: R });
        // Focus b (root's 2nd child): root's re-rooted children are [c, a].
        const mb = byId(focusMove(base, 'b'));
        expect(mb.get('c').sector.start).toBeLessThan(mb.get('a').sector.start);
        // Focus a1 (a's 1st child): a's re-rooted children are [a2, root].
        const ma = byId(focusMove(base, 'a1'));
        expect(ma.get('a2').sector.start).toBeLessThan(ma.get('root').sector.start);
    });

    test('for every focus, nodes at the same depth have disjoint sectors', () => {
        const base = layout(wideTree(), { radius: R });
        for (const f of base.nodes) {
            const res = focusMove(base, f.id);
            const byDepth = new Map();
            for (const n of res.nodes) {
                if (!byDepth.has(n.depth)) byDepth.set(n.depth, []);
                byDepth.get(n.depth).push(n);
            }
            for (const [depth, list] of byDepth) {
                if (depth === 0) continue;
                const sorted = [...list].sort((p, q) => p.sector.start - q.sector.start);
                for (let i = 1; i < sorted.length; i += 1) {
                    expect(sorted[i].sector.start).toBeGreaterThanOrEqual(sorted[i - 1].sector.end - 1e-9);
                }
            }
        }
    });

    test('throws on an unknown focus id', () => {
        const base = layout(sampleTree(), { radius: R });
        expect(() => focusMove(base, 'nope')).toThrow('unknown node');
    });
});
