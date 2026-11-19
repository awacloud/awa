// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// T13 (a), D37: the generic OpenType layout engine fontShaper, GSUB. The
// GSUB and GDEF tables are built here byte by byte, on a minimal font
// object (the cmap, hmtx advances and the raw tables are all the engine
// reads).

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras } from '../main.js';
import { fontShaper } from './shaper.js';
import { be32 as be32x, kerx, lookup6, morx, stx, substitutionList } from './apple-aat/_test-aat.js';

let shape;
let ContractError;
beforeAll(() => {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    rt.registerAll(modules);
    rt.registerAll(extras);
    ({ shape } = rt.resolve('fontShaper'));
    ({ ContractError } = rt.resolve('fontErrors'));
});

// ---------------------------------------------------------------- builder

const be16 = (v) => [(v >> 8) & 0xFF, v & 0xFF];
const be32 = (v) => [(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];
const tag = (t) => [...t].map((c) => c.charCodeAt(0));

/** A table made of a fixed head and offset-addressed blobs: `parts` are [placeholderIndex, bytes] appended in order. */
function assemble(head, blobs, width = 2) {
    // `head` is an array whose entries may be { blob: k }; those become offsets (from the table start) of blobs[k].
    const headLen = head.reduce((n, x) => n + (typeof x === 'object' ? width : 1), 0);
    const offsets = [];
    let at = headLen;
    for (const b of blobs) { offsets.push(at); at += b.length; }
    const out = [];
    for (const x of head) {
        if (typeof x === 'object') out.push(...(width === 4 ? be32(offsets[x.blob]) : be16(offsets[x.blob])));
        else out.push(x);
    }
    for (const b of blobs) out.push(...b);
    return out;
}

/** Coverage format 1 of sorted glyphs. */
const coverage = (glyphs) => [...be16(1), ...be16(glyphs.length), ...glyphs.flatMap(be16)];
/** ClassDef format 2 from { glyph: class }. */
function classDef(map) {
    const recs = Object.entries(map).map(([g, c]) => [Number(g), c]).sort((a, b) => a[0] - b[0]);
    return [...be16(2), ...be16(recs.length), ...recs.flatMap(([g, c]) => [...be16(g), ...be16(g), ...be16(c)])];
}

/** Single substitution format 2: { from: to }. */
function single(map) {
    const from = Object.keys(map).map(Number).sort((a, b) => a - b);
    return assemble([...be16(2), { blob: 0 }, ...be16(from.length), ...from.flatMap((g) => be16(map[g]))], [coverage(from)]);
}
/** Multiple substitution: { from: [to…] }. */
function multiple(map) {
    const from = Object.keys(map).map(Number).sort((a, b) => a - b);
    const seqs = from.map((g) => [...be16(map[g].length), ...map[g].flatMap(be16)]);
    return assemble([...be16(1), { blob: 0 }, ...be16(from.length), ...seqs.map((_, k) => ({ blob: k + 1 }))], [coverage(from), ...seqs]);
}
/** Alternate substitution: { from: [alt…] }. */
function alternate(map) {
    const from = Object.keys(map).map(Number).sort((a, b) => a - b);
    const sets = from.map((g) => [...be16(map[g].length), ...map[g].flatMap(be16)]);
    return assemble([...be16(1), { blob: 0 }, ...be16(from.length), ...sets.map((_, k) => ({ blob: k + 1 }))], [coverage(from), ...sets]);
}
/** Ligature substitution: [[first, [components…], ligature], …] (one ligature per first glyph). */
function ligature(ligs) {
    const sorted = [...ligs].sort((a, b) => a[0] - b[0]);
    const sets = sorted.map(([, comps, lig]) => {
        const l = [...be16(lig), ...be16(comps.length + 1), ...comps.flatMap(be16)];
        return assemble([...be16(1), { blob: 0 }], [l]);
    });
    return assemble([...be16(1), { blob: 0 }, ...be16(sorted.length), ...sets.map((_, k) => ({ blob: k + 1 }))], [coverage(sorted.map((x) => x[0])), ...sets]);
}
/** Chaining context format 3: coverages of glyph lists, and [sequenceIndex, lookupIndex] records. */
function chain3(back, input, ahead, records) {
    const covs = [...back, ...input, ...ahead].map(coverage);
    let k = 0;
    const ref = (list) => [...be16(list.length), ...list.map(() => ({ blob: k++ }))];
    return assemble([...be16(3), ...ref(back), ...ref(input), ...ref(ahead), ...be16(records.length), ...records.flatMap(([s, l]) => [...be16(s), ...be16(l)])], covs);
}
/** Context format 1: [[first, [rest…], records]] (one rule set per first glyph). */
function context1(rules) {
    const sorted = [...rules].sort((a, b) => a[0] - b[0]);
    const sets = sorted.map(([, rest, records]) => {
        const rule = [...be16(rest.length + 1), ...be16(records.length), ...rest.flatMap(be16), ...records.flatMap(([s, l]) => [...be16(s), ...be16(l)])];
        return assemble([...be16(1), { blob: 0 }], [rule]);
    });
    return assemble([...be16(1), { blob: 0 }, ...be16(sorted.length), ...sets.map((_, k) => ({ blob: k + 1 }))], [coverage(sorted.map((x) => x[0])), ...sets]);
}
/** Context format 2: a class def, and per first-glyph class the rules [[restClasses…], records]. */
function context2(classes, first, rulesByClass) {
    const maxClass = Math.max(...Object.keys(rulesByClass).map(Number));
    const sets = [];
    const refs = [];
    for (let c = 0; c <= maxClass; c++) {
        const rules = rulesByClass[c];
        if (!rules) { refs.push(0, 0); continue; }
        const blobs = rules.map(([rest, records]) => [...be16(rest.length + 1), ...be16(records.length), ...rest.flatMap(be16), ...records.flatMap(([s, l]) => [...be16(s), ...be16(l)])]);
        sets.push(assemble([...be16(blobs.length), ...blobs.map((_, k) => ({ blob: k }))], blobs));
        refs.push({ blob: 1 + sets.length });
    }
    return assemble([...be16(2), { blob: 0 }, { blob: 1 }, ...be16(maxClass + 1), ...refs.filter((x) => typeof x === 'object' || x === 0)],
        [coverage(first), classDef(classes), ...sets]);
}
/** Extension format 1 wrapping a subtable of `type`. */
const extension = (type, inner) => assemble([...be16(1), ...be16(type), { blob: 0 }], [inner], 4).length
    && [...be16(1), ...be16(type), ...be32(8), ...inner];
/** Reverse chaining single substitution: back / ahead coverages and { from: to }. */
function reverse(back, ahead, map) {
    const from = Object.keys(map).map(Number).sort((a, b) => a - b);
    const covs = [coverage(from), ...back.map(coverage), ...ahead.map(coverage)];
    let k = 1;
    const ref = (list) => [...be16(list.length), ...list.map(() => ({ blob: k++ }))];
    return assemble([...be16(1), { blob: 0 }, ...ref(back), ...ref(ahead), ...be16(from.length), ...from.flatMap((g) => be16(map[g]))], covs);
}

/**
 * A GSUB table: `scripts` { tag: { features: [i…], required?, langs?: { tag: [i…] } } },
 * `features` [{ tag, lookups: [i…] }], `lookups` [{ type, flag?, markSet?, subtables: [bytes…] }].
 */
function gsubTable({ scripts, features, lookups }) {
    const langSys = (fi, required) => [...be16(0), ...be16(required === undefined ? 0xFFFF : required), ...be16(fi.length), ...fi.flatMap(be16)];
    const scriptTables = Object.entries(scripts).map(([, s]) => {
        const langs = Object.entries(s.langs || {});
        const blobs = [langSys(s.features, s.required), ...langs.map(([, fi]) => langSys(fi))];
        return assemble([{ blob: 0 }, ...be16(langs.length), ...langs.flatMap(([t], k) => [...tag(t), { blob: k + 1 }])], blobs);
    });
    const scriptList = assemble([...be16(scriptTables.length), ...Object.keys(scripts).flatMap((t, k) => [...tag(t), { blob: k }])], scriptTables);
    const featTables = features.map((f) => [...be16(0), ...be16(f.lookups.length), ...f.lookups.flatMap(be16)]);
    const featureList = assemble([...be16(features.length), ...features.flatMap((f, k) => [...tag(f.tag), { blob: k }])], featTables);
    const lookupTables = lookups.map((l) => {
        const flag = l.flag || 0;
        const tail = flag & 0x10 ? be16(l.markSet || 0) : [];
        const headLen = 6 + 2 * l.subtables.length + tail.length;
        const offs = [];
        let at = headLen;
        for (const s of l.subtables) { offs.push(at); at += s.length; }
        return [...be16(l.type), ...be16(flag), ...be16(l.subtables.length), ...offs.flatMap(be16), ...tail, ...l.subtables.flat()];
    });
    const lookupList = assemble([...be16(lookups.length), ...lookups.map((_, k) => ({ blob: k }))], lookupTables);
    return new Uint8Array(assemble([...be16(1), ...be16(0), { blob: 0 }, { blob: 1 }, { blob: 2 }], [scriptList, featureList, lookupList]));
}

/** A GDEF table (version 1.2): glyph classes, mark attachment classes, mark glyph sets. */
function gdefTable({ classes = {}, markAttach = null, markSets = [] }) {
    const blobs = [classDef(classes)];
    const head = [...be16(1), ...be16(2), { blob: 0 }, ...be16(0), ...be16(0)];
    if (markAttach) { blobs.push(classDef(markAttach)); head.push({ blob: 1 }); } else head.push(...be16(0));
    const setsBlob = markSets.length
        ? (() => {
            const covs = markSets.map(coverage);
            let at = 4 + 4 * covs.length;
            const offs = covs.map((c) => { const o = at; at += c.length; return o; });
            return [...be16(1), ...be16(covs.length), ...offs.flatMap(be32), ...covs.flat()];
        })() : null;
    if (setsBlob) { blobs.push(setsBlob); head.push({ blob: blobs.length - 1 }); } else head.push(...be16(0));
    return new Uint8Array(assemble(head, blobs));
}

/** A minimal font: code points to glyphs (`cmap`), advance 100 + glyph, the raw tables. */
function font({ cmap = {}, gsub, gdef, gpos, morx: morxBytes, kerx: kerxBytes, kern: kernBytes } = {}) {
    const tables = {};
    if (morxBytes) tables.morx = { bytes: morxBytes };
    if (kerxBytes) tables.kerx = { bytes: kerxBytes };
    if (kernBytes) tables.kern = { bytes: kernBytes };
    if (gsub) tables.GSUB = { bytes: gsub };
    if (gpos) tables.GPOS = { bytes: gpos };
    if (gdef) tables.GDEF = { bytes: gdef };
    return {
        rawSfnt: { tables }, cmap: null, numGlyphs: 100,
        glyphIndexForCodePoint: (cp) => cmap[String.fromCodePoint(cp)] ?? 0,
        advanceWidth: (g) => 100 + g
    };
}
const CMAP = { a: 1, b: 2, c: 3, f: 4, i: 5, x: 6, '́': 7, ' ': 8, 'α': 9, 'ж': 11 };
const one = (lookup, extra = {}) => font({ cmap: CMAP, gsub: gsubTable({ scripts: { latn: { features: [0] } }, features: [{ tag: 'liga', lookups: [0] }], lookups: [lookup], ...extra }) });
const run = (f, text, opts) => shape(f, text, opts).glyphs.map((g) => [g.glyph, g.cluster]);

// ---------------------------------------------------------------- tests

describe('fontShaper — descriptor and registration', () => {
    test('a strict factory descriptor on the GSUB, GPOS, GDEF, morx, kerx, ankr and kern modules', () => {
        expect(fontShaper.name).toBe('fontShaper');
        expect(fontShaper.dependencies).toEqual(['fontErrors', 'tableGsub', 'tableGpos', 'tableGdef', 'layoutClassDefinitions', 'aatMorx', 'aatMorxEngine',
            'aatKerx', 'aatAnkr', 'aatKerxEngine', 'tableKern', 'varGlyph', 'varItemStore']);
    });
    test('registered in the extras', () => {
        expect(extras).toContain(fontShaper);
    });
});

describe('fontShaper — characters to glyphs, no GSUB', () => {
    test('the cmap glyphs, each with its code-point cluster, hmtx advances and zero offsets; no GPOS table', () => {
        const r = shape(font({ cmap: CMAP }), 'abc');
        expect(r.glyphs).toEqual([
            { glyph: 1, cluster: 0, xAdvance: 101, yAdvance: 0, xOffset: 0, yOffset: 0 },
            { glyph: 2, cluster: 1, xAdvance: 102, yAdvance: 0, xOffset: 0, yOffset: 0 },
            { glyph: 3, cluster: 2, xAdvance: 103, yAdvance: 0, xOffset: 0, yOffset: 0 }
        ]);
        expect([r.script, r.gpos, r.truncated]).toEqual([null, 'none', false]);
    });
    test('a GSUB or GDEF that does not parse is not applied; nothing throws', () => {
        const bad = font({ cmap: CMAP, gsub: new Uint8Array([0, 2, 0, 0]), gdef: new Uint8Array([9]) });
        expect(run(bad, 'ab')).toEqual([[1, 0], [2, 1]]);
    });
    test('bad text or options throw a ContractError', () => {
        const f = font({ cmap: CMAP });
        expect(() => shape(f, 3)).toThrow(ContractError);
        for (const opts of [{ script: 'latin' }, { language: 3 }, { features: { liga: 'yes' } }, { features: [] }, { budget: 0 }, { budget: 1.5 }]) {
            let err = null;
            try { shape(f, 'a', opts); } catch (e) { err = e; }
            expect(err).toBeInstanceOf(ContractError);
            expect(err.code).toBe('fonts/shaper-bad-option');
        }
    });
});

describe('fontShaper — GSUB lookup types', () => {
    test('type 1 single substitution', () => {
        expect(run(one({ type: 1, subtables: [single({ 1: 20 })] }), 'aba')).toEqual([[20, 0], [2, 1], [20, 2]]);
    });
    test('type 2 multiple substitution: one glyph into several, the cluster kept', () => {
        expect(run(one({ type: 2, subtables: [multiple({ 2: [21, 22, 23] })] }), 'ab')).toEqual([[1, 0], [21, 1], [22, 1], [23, 1]]);
    });
    test('type 3 alternate substitution: the first alternate', () => {
        expect(run(one({ type: 3, subtables: [alternate({ 1: [30, 31] })] }), 'a')).toEqual([[30, 0]]);
    });
    test('type 4 ligature substitution: the ligature takes the first component\'s cluster', () => {
        expect(run(one({ type: 4, subtables: [ligature([[4, [5], 40]])] }), 'fia')).toEqual([[40, 0], [1, 2]]);
        expect(run(one({ type: 4, subtables: [ligature([[4, [5], 40]])] }), 'fa')).toEqual([[4, 0], [1, 1]]);
    });
    test('type 5 context, format 1: a nested lookup at a sequence index', () => {
        const f = font({ cmap: CMAP, gsub: gsubTable({
            scripts: { latn: { features: [0] } }, features: [{ tag: 'calt', lookups: [0] }],
            lookups: [{ type: 5, subtables: [context1([[1, [2], [[1, 1]]]])] }, { type: 1, subtables: [single({ 2: 50 })] }]
        }) });
        expect(run(f, 'abb')).toEqual([[1, 0], [50, 1], [2, 2]]);
    });
    test('type 5 context, format 2: classes', () => {
        const f = font({ cmap: CMAP, gsub: gsubTable({
            scripts: { latn: { features: [0] } }, features: [{ tag: 'calt', lookups: [0] }],
            lookups: [{ type: 5, subtables: [context2({ 1: 1, 2: 2, 3: 2 }, [1], { 1: [[[2], [[0, 1]]]] })] }, { type: 1, subtables: [single({ 1: 60 })] }]
        }) });
        expect(run(f, 'ac')).toEqual([[60, 0], [3, 1]]);
        expect(run(f, 'aa')).toEqual([[1, 0], [1, 1]]);
    });
    test('type 6 chaining context, format 3: backtrack, input, lookahead', () => {
        const f = font({ cmap: CMAP, gsub: gsubTable({
            scripts: { latn: { features: [0] } }, features: [{ tag: 'calt', lookups: [0] }],
            lookups: [{ type: 6, subtables: [chain3([[3]], [[1]], [[8]], [[0, 1]])] }, { type: 1, subtables: [single({ 1: 70 })] }]
        }) });
        expect(run(f, 'ca a')).toEqual([[3, 0], [70, 1], [8, 2], [1, 3]]);
        expect(run(f, 'ba ')).toEqual([[2, 0], [1, 1], [8, 2]]);
    });
    test('type 7 extension: the wrapped subtable applies', () => {
        expect(run(one({ type: 7, subtables: [extension(1, single({ 1: 80 }))] }), 'a')).toEqual([[80, 0]]);
    });
    test('type 8 reverse chaining: right to left, with its context', () => {
        const f = one({ type: 8, subtables: [reverse([], [[1, 90]], { 1: 90 })] });
        expect(run(f, 'aaa')).toEqual([[90, 0], [90, 1], [1, 2]]);
    });
});

describe('fontShaper — lookup flags and GDEF', () => {
    const MARK = 7;
    const liga = (flag, extra = {}) => font({
        cmap: CMAP,
        gsub: gsubTable({ scripts: { latn: { features: [0] } }, features: [{ tag: 'liga', lookups: [0] }], lookups: [{ type: 4, flag, subtables: [ligature([[4, [5], 40]])], ...extra }] }),
        gdef: gdefTable({ classes: { 4: 1, 5: 1, [MARK]: 3 }, markAttach: { [MARK]: 2 }, markSets: [[MARK], [99]] })
    });
    test('ignore marks: a mark between the components is skipped and kept', () => {
        expect(run(liga(0x08), 'f́i')).toEqual([[40, 0], [MARK, 1]]);
        expect(run(liga(0), 'f́i')).toEqual([[4, 0], [MARK, 1], [5, 2]]);
    });
    test('the mark attachment class: a mark of another class is skipped', () => {
        expect(run(liga(0x0300), 'f́i')).toEqual([[40, 0], [MARK, 1]]);
        expect(run(liga(0x0200), 'f́i')).toEqual([[4, 0], [MARK, 1], [5, 2]]);
    });
    test('the mark filtering set: a mark outside the set is skipped, one inside is not', () => {
        expect(run(liga(0x10, { markSet: 1 }), 'f́i')).toEqual([[40, 0], [MARK, 1]]);
        expect(run(liga(0x10, { markSet: 0 }), 'f́i')).toEqual([[4, 0], [MARK, 1], [5, 2]]);
    });
    test('ignore base glyphs: a base is neither substituted nor matched', () => {
        expect(run(liga(0x02), 'fi')).toEqual([[4, 0], [5, 1]]);
    });
});

describe('fontShaper — script, language and features', () => {
    const multi = () => font({ cmap: CMAP, gsub: gsubTable({
        scripts: { DFLT: { features: [2] }, grek: { features: [1], langs: { 'ELL ': [3] } }, latn: { features: [0] } },
        features: [{ tag: 'liga', lookups: [0] }, { tag: 'liga', lookups: [1] }, { tag: 'liga', lookups: [2] }, { tag: 'liga', lookups: [3] }],
        lookups: [{ type: 1, subtables: [single({ 1: 101, 9: 101, 11: 101 })] }, { type: 1, subtables: [single({ 1: 102, 9: 102 })] },
            { type: 1, subtables: [single({ 1: 103, 9: 103, 11: 103 })] }, { type: 1, subtables: [single({ 9: 104 })] }]
    }) });
    test('the script of the first character that has one; then DFLT; opts.script wins', () => {
        expect(shape(multi(), 'α').script).toBe('grek');
        expect(run(multi(), 'α')).toEqual([[102, 0]]);
        expect(run(multi(), ' a')).toEqual([[8, 0], [101, 1]]);
        expect(shape(multi(), 'ж').script).toBe('DFLT');
        expect(run(multi(), 'ж')).toEqual([[103, 0]]);
        expect(run(multi(), 'α', { script: 'latn' })).toEqual([[101, 0]]);
    });
    test('opts.language picks its language system; an unknown one keeps the default', () => {
        const r = shape(multi(), 'α', { language: 'ELL ' });
        expect([r.language, r.glyphs[0].glyph]).toEqual(['ELL ', 104]);
        expect(shape(multi(), 'α', { language: 'XXX ' }).language).toBe(null);
    });
    test('no DFLT: latn; opts.features turns a feature off or adds one; the required feature always applies', () => {
        const f = font({ cmap: CMAP, gsub: gsubTable({
            scripts: { latn: { features: [0, 1], required: 2 } },
            features: [{ tag: 'liga', lookups: [0] }, { tag: 'smcp', lookups: [1] }, { tag: 'rqd ', lookups: [2] }],
            lookups: [{ type: 1, subtables: [single({ 1: 110 })] }, { type: 1, subtables: [single({ 2: 111 })] }, { type: 1, subtables: [single({ 3: 112 })] }]
        }) });
        expect(shape(f, 'ж').script).toBe('latn');
        expect(run(f, 'abc')).toEqual([[110, 0], [2, 1], [112, 2]]);
        expect(run(f, 'abc', { features: { liga: false, smcp: true } })).toEqual([[1, 0], [111, 1], [112, 2]]);
        expect(shape(f, 'abc').features.sort()).toEqual(['liga', 'rqd ']);
    });
});

describe('fontShaper — guards', () => {
    test('the budget: past it, no lookup applies and the result is truncated', () => {
        const f = one({ type: 1, subtables: [single({ 1: 20 })] });
        const r = shape(f, 'aaa', { budget: 2 });
        expect(r.glyphs.map((g) => g.glyph)).toEqual([20, 20, 1]);
        expect(r.truncated).toBe(true);
        expect(shape(f, 'aaa').truncated).toBe(false);
    });
    test('nested lookups stop 16 deep: a context lookup that calls itself ends, truncated', () => {
        const f = font({ cmap: CMAP, gsub: gsubTable({
            scripts: { latn: { features: [0] } }, features: [{ tag: 'calt', lookups: [0] }],
            lookups: [{ type: 5, subtables: [context1([[1, [], [[0, 0]]]])] }]
        }) });
        const r = shape(f, 'a');
        expect(r.truncated).toBe(true);
        expect(r.glyphs.map((g) => g.glyph)).toEqual([1]);
    });
});

// ---------------------------------------------------------------- T13 (b): GPOS

/** A value record of `format` (x / y placement, x / y advance). */
function valueRecord(format, v = {}) {
    const out = [];
    if (format & 0x01) out.push(...be16(v.xPlacement || 0));
    if (format & 0x02) out.push(...be16(v.yPlacement || 0));
    if (format & 0x04) out.push(...be16(v.xAdvance || 0));
    if (format & 0x08) out.push(...be16(v.yAdvance || 0));
    return out;
}
/** An anchor: format 1, or format 3 with an x VariationIndex device `[outer, inner]`. */
const anchor = (x, y, xv) => (xv
    ? [...be16(3), ...be16(x), ...be16(y), ...be16(10), ...be16(0), ...be16(xv[0]), ...be16(xv[1]), ...be16(0x8000)]
    : [...be16(1), ...be16(x), ...be16(y)]);
/** Single adjustment format 1: one value for `glyphs`. */
const singlePos = (glyphs, format, v) => assemble([...be16(1), { blob: 0 }, ...be16(format), ...valueRecord(format, v)], [coverage(glyphs)]);
/** Pair adjustment format 1: [[first, second, value1, value2]] (one pair set per first glyph). */
function pairPos(pairs, vf1, vf2) {
    const firsts = [...new Set(pairs.map((p) => p[0]))].sort((a, b) => a - b);
    const sets = firsts.map((f) => {
        const recs = pairs.filter((p) => p[0] === f);
        return [...be16(recs.length), ...recs.flatMap(([, s, v1, v2]) => [...be16(s), ...valueRecord(vf1, v1), ...valueRecord(vf2, v2)])];
    });
    return assemble([...be16(1), { blob: 0 }, ...be16(vf1), ...be16(vf2), ...be16(sets.length), ...sets.map((_, k) => ({ blob: k + 1 }))], [coverage(firsts), ...sets]);
}
/** Cursive attachment: { glyph: [entry|null, exit|null] } with anchors [x, y]. */
function cursive(map) {
    const gs = Object.keys(map).map(Number).sort((a, b) => a - b);
    const blobs = [coverage(gs)];
    const head = [...be16(1), { blob: 0 }, ...be16(gs.length)];
    for (const g of gs) {
        for (const a of map[g]) {
            if (a) { blobs.push(anchor(...a)); head.push({ blob: blobs.length - 1 }); } else head.push(...be16(0));
        }
    }
    return assemble(head, blobs);
}
/** An anchor array (marks: [class, [x, y]]; bases: per class [x, y] or null), offsets from its own start. */
function markArray(marks) {
    const anchors = marks.map(([, a]) => anchor(...a));
    let at = 2 + 4 * marks.length;
    const recs = marks.flatMap(([c], k) => { const o = at; at += anchors[k].length; return [...be16(c), ...be16(o)]; });
    return [...be16(marks.length), ...recs, ...anchors.flat()];
}
function baseArray(bases) {
    const classCount = bases[0].length;
    const anchors = [];
    let at = 2 + 2 * classCount * bases.length;
    const offs = bases.flatMap((row) => row.map((a) => { if (!a) return 0; const o = at; const b = anchor(...a); anchors.push(b); at += b.length; return o; }));
    return [...be16(bases.length), ...offs.flatMap(be16), ...anchors.flat()];
}
/** Mark to base (type 4) or mark to mark (type 6): marks { glyph: [class, [x, y]] }, bases { glyph: [anchor per class] }. */
function markAttach(marks, bases) {
    const mg = Object.keys(marks).map(Number).sort((a, b) => a - b);
    const bg = Object.keys(bases).map(Number).sort((a, b) => a - b);
    const classCount = bases[bg[0]].length;
    return assemble([...be16(1), { blob: 0 }, { blob: 1 }, ...be16(classCount), { blob: 2 }, { blob: 3 }],
        [coverage(mg), coverage(bg), markArray(mg.map((g) => marks[g])), baseArray(bg.map((g) => bases[g]))]);
}
/** Mark to ligature (type 5): ligatures { glyph: [component: [anchor per class]] }. */
function markLig(marks, ligs) {
    const mg = Object.keys(marks).map(Number).sort((a, b) => a - b);
    const lg = Object.keys(ligs).map(Number).sort((a, b) => a - b);
    const classCount = ligs[lg[0]][0].length;
    const attachments = lg.map((g) => baseArray(ligs[g]));
    let at = 2 + 2 * attachments.length;
    const offs = attachments.map((a) => { const o = at; at += a.length; return o; });
    const ligArray = [...be16(attachments.length), ...offs.flatMap(be16), ...attachments.flat()];
    return assemble([...be16(1), { blob: 0 }, { blob: 1 }, ...be16(classCount), { blob: 2 }, { blob: 3 }],
        [coverage(mg), coverage(lg), markArray(mg.map((g) => marks[g])), ligArray]);
}
/** A GPOS table: the same layout as GSUB's (`gsubTable` writes the common header and lists). */
const gposTable = (spec) => gsubTable(spec);
const posFont = (lookups, { gdef, gsub, features = 'kern' } = {}) => font({
    cmap: CMAP, gsub,
    gdef: gdef || gdefTable({ classes: { 1: 1, 2: 1, 3: 1, 7: 3, 4: 2 } }),
    gpos: gposTable({ scripts: { latn: { features: lookups.map((_, k) => k) } }, features: lookups.map((_, k) => ({ tag: Array.isArray(features) ? features[k] : features, lookups: [k] })), lookups })
});
const pos = (f, text, opts) => shape(f, text, opts).glyphs.map((g) => [g.glyph, g.xAdvance, g.xOffset, g.yOffset]);

describe('fontShaper — GPOS (T13 b)', () => {
    test('the result says whether GPOS applied: none without the table, applied with it', () => {
        expect(shape(font({ cmap: CMAP }), 'a').gpos).toBe('none');
        expect(shape(posFont([{ type: 1, subtables: [singlePos([9], 0x04, { xAdvance: 1 })] }]), 'a').gpos).toBe('applied');
    });
    test('type 1 single adjustment: placements to the offsets, advances to the advance', () => {
        const f = posFont([{ type: 1, subtables: [singlePos([1], 0x0F, { xPlacement: 5, yPlacement: -7, xAdvance: 20, yAdvance: 3 })] }]);
        const r = shape(f, 'ab');
        expect(r.glyphs.map((g) => [g.glyph, g.xAdvance, g.yAdvance, g.xOffset, g.yOffset])).toEqual([[1, 121, 3, 5, -7], [2, 102, 0, 0, 0]]);
    });
    test('type 2 pair adjustment: the first value on the first glyph, the second on the next; a pair with a second value skips it', () => {
        const kern = posFont([{ type: 2, subtables: [pairPos([[1, 2, { xAdvance: -30 }, null], [2, 3, { xAdvance: -10 }, null]], 0x04, 0)] }]);
        expect(pos(kern, 'abc')).toEqual([[1, 71, 0, 0], [2, 92, 0, 0], [3, 103, 0, 0]]);
        const both = posFont([{ type: 2, subtables: [pairPos([[1, 2, { xAdvance: -30 }, { xPlacement: 4 }], [2, 3, { xAdvance: -10 }, { xPlacement: 4 }]], 0x04, 0x01)] }]);
        expect(pos(both, 'abc')).toEqual([[1, 71, 0, 0], [2, 102, 4, 0], [3, 103, 0, 0]]);
    });
    test('type 2 skips a mark the lookup ignores, between the pair', () => {
        const f = posFont([{ type: 2, flag: 0x08, subtables: [pairPos([[1, 2, { xAdvance: -30 }, null]], 0x04, 0)] }]);
        expect(pos(f, 'áb').map((g) => g.slice(0, 2))).toEqual([[1, 71], [7, 0], [2, 102]]);
    });
    test('type 3 cursive attachment: the exit anchor joined to the next glyph\'s entry', () => {
        const f = posFont([{ type: 3, subtables: [cursive({ 1: [null, [80, 50]], 2: [[10, 20], null] })] }], { features: 'curs' });
        expect(pos(f, 'ab')).toEqual([[1, 80, 0, 0], [2, 92, -10, 30]]);
    });
    test('type 4 mark to base: the anchor difference, the base advance taken back, the mark takes no advance', () => {
        const f = posFont([{ type: 4, subtables: [markAttach({ 7: [0, [30, 0]] }, { 1: [[60, 500]] })] }], { features: 'mark' });
        expect(pos(f, 'áb')).toEqual([[1, 101, 0, 0], [7, 0, 60 - 30 - 101, 500], [2, 102, 0, 0]]);
    });
    test('type 5 mark to ligature: the last component\'s anchor', () => {
        const f = posFont([{ type: 5, subtables: [markLig({ 7: [0, [0, 0]] }, { 4: [[[10, 100]], [[90, 200]]] })] }], { features: 'mark' });
        expect(pos(f, 'f́')).toEqual([[4, 104, 0, 0], [7, 0, 90 - 104, 200]]);
    });
    test('type 6 mark to mark: stacked on the preceding mark, which keeps its own attachment', () => {
        const f = posFont([
            { type: 4, subtables: [markAttach({ 7: [0, [0, 0]] }, { 1: [[50, 500]] })] },
            { type: 6, subtables: [markAttach({ 7: [0, [0, 0]] }, { 7: [[0, 300]] })] }
        ], { features: ['mark', 'mkmk'] });
        expect(pos(f, 'á́')).toEqual([[1, 101, 0, 0], [7, 0, 50 - 101, 500], [7, 0, 50 - 101, 800]]);
    });
    test('types 7 and 8 context positioning, type 9 extension', () => {
        const ctxF = posFont([
            { type: 8, subtables: [chain3([[3]], [[1]], [], [[0, 1]])] },
            { type: 1, subtables: [singlePos([1], 0x04, { xAdvance: 40 })] }
        ], { features: ['kern', 'zzzz'] });
        expect(pos(ctxF, 'cab').map((g) => g.slice(0, 2))).toEqual([[3, 103], [1, 141], [2, 102]]);
        expect(pos(ctxF, 'ab').map((g) => g.slice(0, 2))).toEqual([[1, 101], [2, 102]]);
        const ctx7 = posFont([
            { type: 7, subtables: [context1([[1, [2], [[1, 1]]]])] },
            { type: 1, subtables: [singlePos([2], 0x01, { xPlacement: 9 })] }
        ], { features: ['kern', 'zzzz'] });
        expect(pos(ctx7, 'ab')).toEqual([[1, 101, 0, 0], [2, 102, 9, 0]]);
        const ext = posFont([{ type: 9, subtables: [extension(1, singlePos([1], 0x04, { xAdvance: 7 }))] }]);
        expect(pos(ext, 'a').map((g) => g.slice(0, 2))).toEqual([[1, 108]]);
    });
    test('GPOS runs after GSUB, on the substituted glyphs; its own features and the options', () => {
        const gsub = gsubTable({ scripts: { latn: { features: [0] } }, features: [{ tag: 'liga', lookups: [0] }], lookups: [{ type: 1, subtables: [single({ 2: 3 })] }] });
        const f = posFont([{ type: 2, subtables: [pairPos([[1, 3, { xAdvance: -50 }, null]], 0x04, 0)] }], { gsub });
        expect(pos(f, 'ab')).toEqual([[1, 51, 0, 0], [3, 103, 0, 0]]);
        expect(pos(f, 'ab', { features: { kern: false } })).toEqual([[1, 101, 0, 0], [3, 103, 0, 0]]);
        expect(shape(f, 'ab').features.sort()).toEqual(['kern', 'liga']);
    });
});

// T15 (a), D38: AAT, the morx chains instead of GSUB.
describe('fontShaper — morx (T15 a)', () => {
    const HCMAP = { ...CMAP, 'א': 12, 'ב': 13 };
    /** A noncontextual subtable under `flags`, mapping { from: to }. */
    const nc = (map, flags = 1, chain = {}) => morx([{ ...chain, subtables: [{ type: 4, flags, body: lookup6(map) }] }]);
    const gsubA = () => gsubTable({ scripts: { latn: { features: [0] } }, features: [{ tag: 'liga', lookups: [0] }], lookups: [{ type: 1, subtables: [single({ 1: 50 })] }] });

    test('a font with morx and no GSUB runs its chains; the result says so', () => {
        const r = shape(font({ cmap: CMAP, morx: nc({ 1: 20 }) }), 'ab');
        expect(r.glyphs.map((g) => [g.glyph, g.cluster, g.xAdvance])).toEqual([[20, 0, 120], [2, 1, 102]]);
        expect([r.morx, r.gpos, r.features, r.script, r.direction]).toEqual(['applied', 'none', [], null, 'ltr']);
        expect(shape(font({ cmap: CMAP }), 'a').morx).toBe('none');
    });
    test('GSUB wins over morx unless opts.aat is true; opts.aat false never runs morx', () => {
        const f = font({ cmap: CMAP, gsub: gsubA(), morx: nc({ 1: 20 }) });
        expect([run(f, 'a'), shape(f, 'a').morx]).toEqual([[[50, 0]], 'none']);
        expect([run(f, 'a', { aat: true }), shape(f, 'a', { aat: true }).features]).toEqual([[[20, 0]], []]);
        expect(run(font({ cmap: CMAP, morx: nc({ 1: 20 }) }), 'a', { aat: false })).toEqual([[1, 0]]);
    });
    test('GPOS runs after morx (HarfBuzz chooses the positioning apart from morx; T15 c corrects T15 a)', () => {
        const gposF = posFont([{ type: 1, subtables: [singlePos([1], 0x04, { xAdvance: 40 })] }]);
        const both = font({ cmap: CMAP, morx: nc({ 2: 3 }), gpos: gposF.rawSfnt.tables.GPOS.bytes });
        const r = shape(both, 'ab');
        expect([r.glyphs.map((g) => [g.glyph, g.xAdvance]), r.gpos, r.morx]).toEqual([[[1, 141], [3, 103]], 'applied', 'applied']);
        expect(shape(both, 'ab', { aat: false }).glyphs.map((g) => [g.glyph, g.xAdvance])).toEqual([[1, 141], [2, 102]]);
    });
    test('a morx that does not parse, or has no chain, is not run; nothing throws', () => {
        expect(shape(font({ cmap: CMAP, morx: new Uint8Array([0, 9, 0, 0, 0, 0, 0, 0]) }), 'a').morx).toBe('none');
        expect(shape(font({ cmap: CMAP, morx: morx([]) }), 'a').morx).toBe('none');
    });
    test('opts.features maps to AAT feature settings: on and off, exclusive types keep the last, unknown tags do nothing', () => {
        // Ligatures (type 1): common on (2) enables flag 2, common off (3) clears it.
        const liga = { defaultFlags: 1, features: [{ type: 1, setting: 2, enable: 2, disable: 0xFFFFFFFF }, { type: 1, setting: 3, enable: 0, disable: 0xFFFFFFFD }] };
        const f = font({ cmap: CMAP, morx: nc({ 1: 20 }, 2, liga) });
        expect(run(f, 'a')).toEqual([[1, 0]]);
        expect(run(f, 'a', { features: { liga: true } })).toEqual([[20, 0]]);
        expect(run(f, 'a', { features: { liga: true, zzzz: true } })).toEqual([[20, 0]]);
        const off = font({ cmap: CMAP, morx: nc({ 1: 20 }, 2, { ...liga, defaultFlags: 3 }) });
        expect([run(off, 'a'), run(off, 'a', { features: { liga: false } })]).toEqual([[[20, 0]], [[1, 0]]]);
        // Vertical position (type 10) is exclusive: sups (1) then subs (2) keeps subs only.
        const vpos = { defaultFlags: 1, features: [{ type: 10, setting: 1, enable: 2, disable: 0xFFFFFFFF }, { type: 10, setting: 2, enable: 4, disable: 0xFFFFFFFD }] };
        const g = font({ cmap: CMAP, morx: nc({ 1: 20 }, 2, vpos) });
        expect(run(g, 'a', { features: { sups: true } })).toEqual([[20, 0]]);
        expect(run(g, 'a', { features: { sups: true, subs: true } })).toEqual([[1, 0]]);
        // Number case (type 21) has no off setting: onum off requests nothing.
        const num = { defaultFlags: 1, features: [{ type: 21, setting: 0, enable: 2, disable: 0xFFFFFFFF }] };
        const h = font({ cmap: CMAP, morx: nc({ 1: 20 }, 2, num) });
        expect([run(h, 'a', { features: { onum: true } }), run(h, 'a', { features: { onum: false } })]).toEqual([[[20, 0]], [[1, 0]]]);
    });
    test("the direction: opts.direction, else right to left from the first Hebrew, Arabic, Syriac, Thaana or N'Ko character", () => {
        // Glyph 12 sets the mark; glyph 13 substitutes it: forward only (a layout-order subtable runs reversed on right-to-left text).
        const machine = stx({
            nClasses: 6, classes: lookup6({ 12: 4, 13: 5 }), states: [[0, 0, 0, 0, 1, 2]],
            entries: [{ newState: 0, flags: 0, data: [0xFFFF, 0xFFFF] }, { newState: 0, flags: 0x8000, data: [0xFFFF, 0xFFFF] }, { newState: 0, flags: 0, data: [0, 0xFFFF] }],
            extras: [substitutionList([lookup6({ 12: 30 })])]
        });
        const f = font({ cmap: HCMAP, morx: morx([{ subtables: [{ type: 1, body: machine }] }]) });
        expect([shape(f, 'אב').direction, run(f, 'אב')]).toEqual(['rtl', [[12, 0], [13, 1]]]);
        expect([shape(f, 'אב', { direction: 'ltr' }).direction, run(f, 'אב', { direction: 'ltr' })]).toEqual(['ltr', [[30, 0], [13, 1]]]);
        expect(shape(f, 'aא').direction).toBe('ltr');
        expect(shape(f, '1א').direction).toBe('rtl');
        expect(shape(f, '12').direction).toBe('ltr');
        expect(shape(f, 'ܐ').direction).toBe('rtl');
    });
    test('opts.aat and opts.direction are typed', () => {
        const f = font({ cmap: CMAP });
        for (const opts of [{ aat: 1 }, { aat: 'yes' }, { direction: 'ttb' }, { direction: true }]) {
            let err = null;
            try { shape(f, 'a', opts); } catch (e) { err = e; }
            expect(err && err.code).toBe('fonts/shaper-bad-option');
        }
    });
});

// T15 (c), D38: kerx and kern, chosen as HarfBuzz chooses the positioning.
describe('fontShaper — kerx and kern (T15 c)', () => {
    /** A kerx format 0 table kerning (1, 2) by `v`. */
    const kerx0 = (v) => kerx([{ format: 0, body: [...be32x(1), ...be32x(0), ...be32x(0), ...be32x(0), ...be16(1), ...be16(2), ...be16(v & 0xFFFF)] }]);
    /** An OpenType kern table, one horizontal format 0 subtable kerning (1, 2) by `v`. */
    const kern0 = (v) => new Uint8Array([...be16(0), ...be16(1), ...be16(0), ...be16(20), ...be16(0x0001), ...be16(1), ...be16(0), ...be16(0), ...be16(0),
        ...be16(1), ...be16(2), ...be16(v & 0xFFFF)]);
    const gposTo = (features) => posFont([{ type: 1, subtables: [singlePos([2], 0x04, { xAdvance: 7 })] }], { features }).rawSfnt.tables.GPOS.bytes;
    const gsubB = () => gsubTable({ scripts: { latn: { features: [0] } }, features: [{ tag: 'liga', lookups: [0] }], lookups: [{ type: 1, subtables: [single({ 9: 10 })] }] });
    const adv = (f, opts) => shape(f, 'ab', opts).glyphs.map((g) => g.xAdvance);
    const fields = (f, opts) => { const r = shape(f, 'ab', opts); return [r.kerx, r.gpos, r.kern]; };

    test('kerx without GSUB applies, and GPOS does not', () => {
        const f = font({ cmap: CMAP, kerx: kerx0(-30), gpos: gposTo('kern') });
        expect([adv(f), fields(f)]).toEqual([[71, 102], ['applied', 'none', 'none']]);
    });
    test('kerx with GSUB and GPOS: GPOS applies, kerx does not (unless opts.aat)', () => {
        const f = font({ cmap: CMAP, kerx: kerx0(-30), gpos: gposTo('kern'), gsub: gsubB() });
        expect([adv(f), fields(f)]).toEqual([[101, 109], ['none', 'applied', 'none']]);
        expect([adv(f, { aat: true }), fields(f, { aat: true })]).toEqual([[71, 102], ['applied', 'none', 'none']]);
        const noKernFeature = font({ cmap: CMAP, kerx: kerx0(-30), gpos: gposTo('mark'), gsub: gsubB() });
        expect(fields(noKernFeature)).toEqual(['none', 'applied', 'none']);
    });
    test('kern: without GPOS; after a GPOS that has no kern feature; not after one that has', () => {
        expect([adv(font({ cmap: CMAP, kern: kern0(-40) })), fields(font({ cmap: CMAP, kern: kern0(-40) }))]).toEqual([[61, 102], ['none', 'none', 'applied']]);
        const noKern = font({ cmap: CMAP, kern: kern0(-40), gpos: gposTo('mark') });
        expect([adv(noKern), fields(noKern)]).toEqual([[61, 109], ['none', 'applied', 'applied']]);
        const withKern = font({ cmap: CMAP, kern: kern0(-40), gpos: gposTo('kern') });
        expect([adv(withKern), fields(withKern)]).toEqual([[101, 109], ['none', 'applied', 'none']]);
    });
    test('kerx wins over kern; opts.aat: false drops kerx, so kern applies', () => {
        const f = font({ cmap: CMAP, kerx: kerx0(-30), kern: kern0(-40) });
        expect([adv(f), fields(f)]).toEqual([[71, 102], ['applied', 'none', 'none']]);
        expect([adv(f, { aat: false }), fields(f, { aat: false })]).toEqual([[61, 102], ['none', 'none', 'applied']]);
    });
    test('features.kern false turns the kerning off', () => {
        expect(adv(font({ cmap: CMAP, kern: kern0(-40) }), { features: { kern: false } })).toEqual([101, 102]);
        expect(adv(font({ cmap: CMAP, kerx: kerx0(-30) }), { features: { kern: false } })).toEqual([101, 102]);
    });
    test('a kerx that does not parse is not applied; nothing throws', () => {
        const f = font({ cmap: CMAP, kerx: new Uint8Array([0, 9, 0, 0, 0, 0, 0, 0]), kern: kern0(-40) });
        expect(fields(f)).toEqual(['none', 'none', 'applied']);
    });
});

// T14 (b), D39: variation coordinates in fontShaper.
describe('fontShaper — variation coordinates (T14 b)', () => {
    const f2v = (v) => be16(Math.round(v * 16384) & 0xFFFF);
    const fixed = (v) => be32(Math.round(v * 65536) >>> 0);
    const FVAR = new Uint8Array([...be16(1), ...be16(0), ...be16(16), ...be16(2), ...be16(1), ...be16(20), ...be16(0), ...be16(0),
        ...tag('wght'), ...fixed(100), ...fixed(400), ...fixed(900), ...be16(0), ...be16(256)]);
    /** A one-axis store: region [0, 1, 1], item variation data 0 with `rows` (one delta each). */
    const ivs = (rows) => {
        const regionList = [...be16(1), ...be16(1), ...f2v(0), ...f2v(1), ...f2v(1)];
        const data = [...be16(rows.length), ...be16(1), ...be16(1), ...be16(0), ...rows.flatMap(be16)];
        return [...be16(1), ...be32(12), ...be16(1), ...be32(12 + regionList.length), ...regionList, ...data];
    };
    /** GDEF 1.3: glyph classes, and an item variation store of `rows`. */
    const gdefVar = (classes, rows) => {
        const cd = classDef(classes);
        return new Uint8Array([...be16(1), ...be16(3), ...be16(18), ...be16(0), ...be16(0), ...be16(0), ...be16(0), ...be32(18 + cd.length), ...cd, ...ivs(rows)]);
    };
    const withFvar = (f) => { f.rawSfnt.tables.fvar = { bytes: FVAR }; return f; };

    test('opts.coords is typed', () => {
        for (const coords of [null, [], { wght: 'x' }, { wght: Infinity }]) {
            let err = null;
            try { shape(font({ cmap: CMAP }), 'a', { coords }); } catch (e) { err = e; }
            expect(err && err.code).toBe('fonts/shaper-bad-option');
        }
    });
    test("a format 3 anchor adds its VariationIndex deltas from GDEF's store; nothing changes without coordinates", () => {
        // Mark 7 on base 1: base anchor (300, 500) with x delta 40 at wght's max; mark anchor (0, 0).
        const f = withFvar(posFont([{ type: 4, subtables: [markAttach({ 7: [0, [0, 0]] }, { 1: [[300, 500, [0, 0]]] })] }],
            { features: ['mark'], gdef: gdefVar({ 1: 1, 7: 3 }, [40]) }));
        expect(pos(f, 'á')).toEqual([[1, 101, 0, 0], [7, 0, 300 - 101, 500]]);
        expect(pos(f, 'á', { coords: { wght: 900 } })).toEqual([[1, 101, 0, 0], [7, 0, 340 - 101, 500]]);
        expect(pos(f, 'á', { coords: { wght: 650 } })).toEqual([[1, 101, 0, 0], [7, 0, 320 - 101, 500]]);
    });
    test("right to left, a mark's offset gains the advances after its base instead of losing its base's", () => {
        const f = posFont([{ type: 4, subtables: [markAttach({ 7: [0, [0, 0]] }, { 1: [[300, 500]] })] }], { features: ['mark'] });
        expect(pos(f, 'á', { direction: 'rtl' })).toEqual([[1, 101, 0, 0], [7, 0, 300, 500]]);
    });
    test('the first FeatureVariations record whose conditions hold replaces its feature tables (rvrn by default)', () => {
        // rvrn: lookup 0 (1 -> 20); at wght >= 650 (normalised 0.5..1) its alternate is lookup 1 (1 -> 30).
        const base = gsubTable({ scripts: { latn: { features: [0] } }, features: [{ tag: 'rvrn', lookups: [0] }],
            lookups: [{ type: 1, subtables: [single({ 1: 20 })] }, { type: 1, subtables: [single({ 1: 30 })] }] });
        const head = [...base.slice(0, 4), ...be16(((base[4] << 8) | base[5]) + 4), ...be16(((base[6] << 8) | base[7]) + 4), ...be16(((base[8] << 8) | base[9]) + 4)];
        head[3] = 1;
        const fvOff = base.length + 4;
        const condition = [...be16(1), ...be16(0), ...f2v(0.5), ...f2v(1)];
        const conditionSet = [...be16(1), ...be32(6)];
        const featureTable = [...be16(0), ...be16(1), ...be16(1)];
        const fts = [...be16(1), ...be16(0), ...be16(1), ...be16(0), ...be32(12), ...featureTable];
        const fvHead = 16;
        const fv = [...be16(1), ...be16(0), ...be32(1), ...be32(fvHead), ...be32(fvHead + conditionSet.length + condition.length), ...conditionSet, ...condition, ...fts];
        const gsub = new Uint8Array([...head, ...be32(fvOff), ...base.slice(10), ...fv]);
        const f = withFvar(font({ cmap: CMAP, gsub }));
        expect(run(f, 'a')).toEqual([[20, 0]]);
        expect(run(f, 'a', { coords: { wght: 400 } })).toEqual([[20, 0]]);
        expect(run(f, 'a', { coords: { wght: 900 } })).toEqual([[30, 0]]);
    });
});
