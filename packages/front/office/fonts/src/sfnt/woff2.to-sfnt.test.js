// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// `fontWoff2.toSfnt`: a WOFF2 reassembled into an SFNT, its glyf / loca and
// hmtx transforms reversed (W3C WOFF2 § 5). The transformed fixtures are
// built here by a small forward encoder of the same section.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../main.js';

const rt = new ModuleRuntime();
rt.registerAll([...fw_require, ...modules]);
const woff2 = rt.resolve('fontWoff2');
const { parseSfnt } = rt.resolve('fontSfnt');
const { parseGlyf } = rt.resolve('tableGlyf');
const { parseLoca } = rt.resolve('tableLoca');
const { parseHmtx } = rt.resolve('tableHmtx');
const { calcTableChecksum } = rt.resolve('fontChecksum');
const { ContractError, ParseError } = rt.resolve('fontErrors');
const brotliMod = rt.resolve('brotli');

/** Growable big-endian byte sink. */
function sink() {
    const a = [];
    return {
        a,
        u8(v) { a.push(v & 0xFF); return this; },
        u16(v) { a.push((v >>> 8) & 0xFF, v & 0xFF); return this; },
        i16(v) { return this.u16(v & 0xFFFF); },
        u32(v) { a.push((v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF); return this; },
        bytes(b) { for (const x of b) a.push(x); return this; },
        u255(v) {
            if (v < 253) return this.u8(v);
            if (v < 506) return this.u8(255).u8(v - 253);
            if (v < 762) return this.u8(254).u8(v - 506);
            return this.u8(253).u16(v);
        },
        out() { return Uint8Array.from(a); }
    };
}

/** One point's triplet (W3C WOFF2 § 5.2), the smallest form that holds it. */
function triplet(dx, dy, onCurve) {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    const sx = dx >= 0 ? 1 : 0, sy = dy >= 0 ? 1 : 0;
    let flag, data;
    if (dx === 0 && ay < 1280) {
        flag = ((ay >> 8) << 1) + sy; data = [ay & 0xFF];
    } else if (dy === 0 && ax < 1280) {
        flag = 10 + ((ax >> 8) << 1) + sx; data = [ax & 0xFF];
    } else if (ax >= 1 && ax <= 64 && ay >= 1 && ay <= 64) {
        flag = 20 + (((ax - 1) >> 4) << 4) + (((ay - 1) >> 4) << 2) + (sy << 1) + sx;
        data = [(((ax - 1) & 15) << 4) | ((ay - 1) & 15)];
    } else if (ax >= 1 && ax <= 768 && ay >= 1 && ay <= 768) {
        flag = 84 + 12 * ((ax - 1) >> 8) + (((ay - 1) >> 8) << 2) + (sy << 1) + sx;
        data = [(ax - 1) & 0xFF, (ay - 1) & 0xFF];
    } else if (ax < 4096 && ay < 4096) {
        flag = 120 + (sy << 1) + sx; data = [ax >> 4, ((ax & 15) << 4) | (ay >> 8), ay & 0xFF];
    } else {
        flag = 124 + (sy << 1) + sx; data = [ax >> 8, ax & 0xFF, ay >> 8, ay & 0xFF];
    }
    return { flag: flag | (onCurve ? 0 : 0x80), data };
}

/**
 * Forward transform of a glyph list (§ 5.1). A glyph: `null` (empty),
 * `{ endPts, points, instructions, bbox? }` (simple; `bbox` written
 * explicitly) or `{ composite: Uint8Array, bbox, instructions? }`.
 */
function transformGlyf(glyphs, { indexFormat = 0, overlap = new Set() } = {}) {
    const nContour = sink(), nPoints = sink(), flagS = sink(), glyphS = sink();
    const compS = sink(), bboxVals = sink(), instrS = sink();
    const bitmap = new Uint8Array(4 * Math.floor((glyphs.length + 31) / 32));
    glyphs.forEach((g, i) => {
        if (!g) { nContour.i16(0); return; }
        const setBbox = (b) => { bitmap[i >> 3] |= 0x80 >> (i & 7); bboxVals.i16(b[0]).i16(b[1]).i16(b[2]).i16(b[3]); };
        if (g.composite) {
            nContour.i16(-1);
            compS.bytes(g.composite);
            setBbox(g.bbox);
            if (g.instructions) { glyphS.u255(g.instructions.length); instrS.bytes(g.instructions); }
            return;
        }
        nContour.i16(g.endPts.length);
        let prev = -1;
        for (const e of g.endPts) { nPoints.u255(e - prev); prev = e; }
        let x = 0, y = 0;
        for (const p of g.points) {
            const t = triplet(p.x - x, p.y - y, p.onCurve);
            flagS.u8(t.flag); glyphS.bytes(t.data);
            x = p.x; y = p.y;
        }
        glyphS.u255(g.instructions.length); instrS.bytes(g.instructions);
        if (g.bbox) setBbox(g.bbox);
    });
    const bboxStream = Uint8Array.from([...bitmap, ...bboxVals.a]);
    const streams = [nContour.out(), nPoints.out(), flagS.out(), glyphS.out(), compS.out(), bboxStream, instrS.out()];
    const out = sink().u16(0).u16(overlap.size ? 1 : 0).u16(glyphs.length).u16(indexFormat);
    for (const st of streams) out.u32(st.length);
    for (const st of streams) out.bytes(st);
    if (overlap.size) {
        const ov = new Uint8Array(Math.floor((glyphs.length + 7) / 8));
        for (const i of overlap) ov[i >> 3] |= 0x80 >> (i & 7);
        out.bytes(ov);
    }
    return out.out();
}

const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca'];

/** A WOFF2 of `entries` `{ tag, bytes, version?, origLength? }`, in order. */
function buildWoff2(entries, flavor = 0x00010000) {
    const body = Uint8Array.from(entries.flatMap((e) => [...e.bytes]));
    const compressed = brotliMod.brotliCompressSync(body);
    const w = sink().u32(0x774F4632).u32(flavor).u32(0).u16(entries.length).u16(0)
        .u32(body.length).u32(compressed.length).u16(1).u16(0).u32(0).u32(0).u32(0).u32(0).u32(0);
    const base128 = (v) => {
        const b = [];
        do { b.unshift(v & 0x7F); v >>>= 7; } while (v);
        b.forEach((x, k) => w.u8(k < b.length - 1 ? x | 0x80 : x));
    };
    for (const e of entries) {
        const idx = KNOWN.indexOf(e.tag);
        const version = e.version ?? ((e.tag === 'glyf' || e.tag === 'loca') ? 3 : 0);
        w.u8((idx < 0 ? 0x3F : idx) | (version << 6));
        if (idx < 0) w.bytes([...e.tag].map((c) => c.charCodeAt(0)));
        base128(e.origLength ?? e.bytes.length);
        const nullVersion = (e.tag === 'glyf' || e.tag === 'loca') ? 3 : 0;
        if (version !== nullVersion) base128(e.bytes.length);
    }
    w.bytes(compressed);
    const out = w.out();
    new DataView(out.buffer).setUint32(8, out.length);
    return out;
}

const head = (indexToLocFormat) => {
    const s = sink().u32(0x00010000).u32(0x00010000).u32(0).u32(0x5F0F3CF5).u16(0).u16(1000);
    s.u32(0).u32(0).u32(0).u32(0).i16(0).i16(0).i16(0).i16(0).u16(0).u16(8).i16(2);
    return s.i16(indexToLocFormat).i16(0).out();
};
const maxp = (n) => sink().u32(0x00005000).u16(n).out();
const hhea = (numberOfHMetrics) => {
    const s = sink().u32(0x00010000);
    for (let k = 0; k < 15; k++) s.i16(0);
    return s.u16(numberOfHMetrics).out();
};

const SQUARE = { endPts: [3], instructions: Uint8Array.of(0xB0, 0x01), points: [
    { x: 10, y: 0, onCurve: true }, { x: 10, y: 700, onCurve: true },
    { x: 510, y: 700, onCurve: false }, { x: 510, y: 0, onCurve: true }] };
// Every triplet range: dx 0 / dy 0 (one byte), both small, both under 769,
// under 4096, and the four-byte form; negative moves too.
const RANGES = { endPts: [5, 9], instructions: new Uint8Array(0), points: [
    { x: 0, y: 300, onCurve: true }, { x: -900, y: 300, onCurve: true }, { x: -880, y: 270, onCurve: false },
    { x: -100, y: -400, onCurve: true }, { x: 2900, y: 100, onCurve: true }, { x: -9000, y: 12000, onCurve: true },
    { x: -9000, y: 11000, onCurve: true }, { x: -8000, y: 11000, onCurve: false },
    { x: -8040, y: 11060, onCurve: true }, { x: -7400, y: 10500, onCurve: true }] };
// Component: ARG_1_AND_2_ARE_WORDS | ARGS_ARE_XY_VALUES | WE_HAVE_INSTRUCTIONS, glyph 1 at (20, -30).
const COMPOSITE = { composite: Uint8Array.of(0x01, 0x03, 0x00, 0x01, 0x00, 0x14, 0xFF, 0xE2), bbox: [30, -30, 530, 670], instructions: Uint8Array.of(0x40, 0x01, 0x02) };
const GLYPHS = [null, { ...SQUARE, bbox: [10, 0, 510, 700] }, RANGES, COMPOSITE];

/** The SFNT tables of a reassembled font, glyphs parsed. */
function readBack(sfnt) {
    const f = parseSfnt(sfnt);
    const n = new DataView(f.tables.maxp.bytes.buffer, f.tables.maxp.bytes.byteOffset).getUint16(4);
    const fmt = new DataView(f.tables.head.bytes.buffer, f.tables.head.bytes.byteOffset).getInt16(50);
    const loca = parseLoca(f.tables.loca.bytes, n, fmt);
    return { f, loca, glyphs: parseGlyf(f.tables.glyf.bytes, loca) };
}

const bboxOf = (pts) => [Math.min(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.y))];

function fontEntries({ indexFormat = 0, overlap, hmtxEntry } = {}) {
    return [
        { tag: 'head', bytes: head(indexFormat) },
        { tag: 'maxp', bytes: maxp(GLYPHS.length) },
        { tag: 'hhea', bytes: hhea(2) },
        hmtxEntry || { tag: 'hmtx', bytes: sink().u16(500).i16(0).u16(600).i16(10).i16(-9000).i16(30).out() },
        { tag: 'glyf', bytes: transformGlyf(GLYPHS, { indexFormat, overlap }), version: 0, origLength: 400 },
        { tag: 'loca', bytes: new Uint8Array(0), version: 0, origLength: (GLYPHS.length + 1) * (indexFormat ? 4 : 2) }
    ];
}

describe('fontWoff2.toSfnt — the glyf / loca transform reversed (A15)', () => {
    test('every glyph comes back: empty, simple over each triplet range, composite with instructions', () => {
        for (const indexFormat of [0, 1]) {
            const { glyphs, loca, f } = readBack(woff2.toSfnt(buildWoff2(fontEntries({ indexFormat }))));
            expect(f.tables.loca.bytes.length).toBe((GLYPHS.length + 1) * (indexFormat ? 4 : 2));
            expect(loca[1] - loca[0]).toBe(0);
            expect(glyphs[0]).toBeNull();
            for (const k of [1, 2]) {
                const src = GLYPHS[k];
                expect(glyphs[k].kind).toBe('simple');
                expect(glyphs[k].endPtsOfContours).toEqual(src.endPts);
                expect(glyphs[k].points).toEqual(src.points);
                expect([...glyphs[k].instructions]).toEqual([...src.instructions]);
                const b = glyphs[k].bbox;
                expect([b.xMin, b.yMin, b.xMax, b.yMax]).toEqual(src.bbox || bboxOf(src.points));
            }
            expect(glyphs[3].kind).toBe('composite');
            expect(glyphs[3].components).toHaveLength(1);
            expect(glyphs[3].components[0]).toMatchObject({ glyphIndex: 1, arg1: 20, arg2: -30, xy: true });
            expect([...glyphs[3].instructions]).toEqual([0x40, 0x01, 0x02]);
            expect(glyphs[3].bbox).toEqual({ xMin: 30, yMin: -30, xMax: 530, yMax: 670 });
            for (let i = 0; i < loca.length; i++) expect(loca[i] % 4).toBe(0);
        }
    });

    test('the SFNT is well formed: directory sorted, tables aligned, checksums and checkSumAdjustment right', () => {
        const sfnt = woff2.toSfnt(buildWoff2(fontEntries()));
        const f = parseSfnt(sfnt);
        const tags = Object.keys(f.tables);
        expect(tags).toEqual([...tags].sort());
        for (const t of tags) {
            expect(f.tables[t].offset % 4).toBe(0);
            if (t !== 'head') expect(f.tables[t].checksum).toBe(calcTableChecksum(f.tables[t].bytes));
        }
        expect(calcTableChecksum(sfnt)).toBe(0xB1B0AFBA);
    });

    test('the overlap bit sets OVERLAP_SIMPLE on the first flag of its glyph', () => {
        const { f, loca } = readBack(woff2.toSfnt(buildWoff2(fontEntries({ overlap: new Set([2]) }))));
        const firstFlag = (gid) => {
            const g = f.tables.glyf.bytes.subarray(loca[gid]);
            const nc = (g[0] << 8) | g[1];
            const at = 10 + 2 * nc;
            return g[at + 2 + ((g[at] << 8) | g[at + 1])];
        };
        expect(firstFlag(2) & 0x40).toBe(0x40);
        expect(firstFlag(1) & 0x40).toBe(0);
    });

    test('a transformed hmtx gets its left side bearings back from the glyphs', () => {
        // flags 0x03: both lsb arrays omitted; advances 500, 600 (numberOfHMetrics 2).
        const hmtxEntry = { tag: 'hmtx', bytes: sink().u8(3).u16(500).u16(600).out(), version: 1, origLength: 12 };
        const { f } = readBack(woff2.toSfnt(buildWoff2(fontEntries({ hmtxEntry }))));
        const { metrics } = parseHmtx(f.tables.hmtx.bytes, 2, GLYPHS.length);
        expect(metrics).toEqual([
            { advanceWidth: 500, lsb: 0 }, { advanceWidth: 600, lsb: 10 },
            { advanceWidth: 600, lsb: -9000 }, { advanceWidth: 600, lsb: 30 }
        ]);
    });

    test('untransformed tables pass through byte for byte; decode is unchanged', () => {
        const entries = fontEntries();
        const bytes = buildWoff2(entries);
        const f = parseSfnt(woff2.toSfnt(bytes));
        for (const t of ['head', 'maxp', 'hhea', 'hmtx']) {
            const src = entries.find((e) => e.tag === t).bytes;
            if (t === 'head') expect([...f.tables.head.bytes.subarray(12)]).toEqual([...src.subarray(12)]);
            else expect([...f.tables[t].bytes]).toEqual([...src]);
        }
        const d = woff2.decode(bytes);
        expect(d.tables.glyf.transformed).toBe(true);
        expect(d.inverseGlyfTransform).toBe(false);
    });
});

describe('fontWoff2.toSfnt — typed errors (A15)', () => {
    const codeOf = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code, e instanceof ParseError || e instanceof ContractError]; } return null; };

    test('a transformed glyf without a transformed loca', () => {
        const entries = fontEntries();
        entries[5] = { tag: 'loca', bytes: new Uint8Array(10) };
        expect(codeOf(() => woff2.toSfnt(buildWoff2(entries)))).toEqual(['ParseError', 'fonts/woff2-bad-transform', true]);
    });

    test('an unknown transform version', () => {
        const entries = fontEntries();
        entries[1] = { tag: 'maxp', bytes: maxp(GLYPHS.length), version: 2 };
        expect(codeOf(() => woff2.toSfnt(buildWoff2(entries)))).toEqual(['ParseError', 'fonts/woff2-bad-transform', true]);
    });

    test('a glyph stream shorter than its glyphs need', () => {
        const entries = fontEntries();
        const g = transformGlyf(GLYPHS);
        const cut = g.slice(0, g.length - 3);
        entries[4] = { tag: 'glyf', bytes: cut, version: 0, origLength: 400 };
        expect(codeOf(() => woff2.toSfnt(buildWoff2(entries)))).toEqual(['ParseError', 'fonts/woff2-bad-transform', true]);
    });

    test('a composite without its bounding box', () => {
        const entries = fontEntries();
        const g = transformGlyf(GLYPHS);
        const dv = new DataView(g.buffer);
        // Clear glyph 3's bit in the bbox bitmap (the bbox stream starts after the
        // header and the first five streams).
        let at = 36;
        for (let k = 0; k < 5; k++) at += dv.getUint32(8 + 4 * k);
        g[at] &= ~(0x80 >> 3);
        entries[4] = { tag: 'glyf', bytes: g, version: 0, origLength: 400 };
        expect(codeOf(() => woff2.toSfnt(buildWoff2(entries)))).toEqual(['ParseError', 'fonts/woff2-bad-transform', true]);
    });

    test('a collection is not reassembled', () => {
        expect(codeOf(() => woff2.toSfnt(buildWoff2(fontEntries(), 0x74746366)))).toEqual(['ContractError', 'fonts/woff2-collection', true]);
    });
});
