// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview A few OFL faces — one per font technology the package
 * claims — parsed, their COLR v1 paint graphs decoded and their `glyf`
 * outlines subset and read back, through the shared helper
 * `_helpers/ofl-faces.js`.
 *
 * Three layers:
 *   1. Integrity — every `MANIFEST.json` file is on disk with its byte
 *      count and SHA-256, nothing unlisted; the reused Liberation face
 *      equals its `oconv-fonts` provenance record.
 *   2. The measure's own rules, on stand-ins: a changed advance, a changed
 *      outline, an unmapped code point, a paint cycle.
 *   3. The measure over the faces, pinned: every case, the skipped CFF
 *      subsets and their typed refusal, the counts behind each case.
 *
 * Only committed bytes are read; the fetched files are never needed here.
 *
 * @module fonts/tests/ofl-faces.integration
 */

import { describe, test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fontsRuntime } from './_helpers/fonttools.js';
import { FIXTURE_DIR, SUBSET_SKIP, loadFaces, measureFaces, paintGraphs, subsetRoundTrip } from './_helpers/ofl-faces.js';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const rt = fontsRuntime();
const { manifest, faces } = loadFaces();
const face = (id) => faces.find((f) => f.id === id);
const result = measureFaces(faces, rt);
const tablesOf = (bytes) => rt.resolve('fontSfnt').parseSfnt(bytes).tables;

/** Every file under `dir`, as POSIX paths relative to `dir`. */
function allFiles(dir) {
    const out = [];
    const walk = (d) => {
        for (const n of readdirSync(d)) {
            const p = join(d, n);
            if (statSync(p).isDirectory()) walk(p); else out.push(relative(dir, p).replace(/\\/g, '/'));
        }
    };
    walk(dir);
    return out.sort();
}

describe('integrity of the OFL faces', () => {
    test('MANIFEST.json lists exactly the vendored files, each with its bytes and SHA-256', () => {
        const listed = [...manifest.faces.map((f) => f.path), ...manifest.licences.map((f) => f.path)]
            .filter((p) => p.startsWith('vendor/')).map((p) => p.slice('vendor/'.length)).sort();
        expect(listed).toEqual(allFiles(join(FIXTURE_DIR, 'vendor')));
        for (const f of manifest.licences) {
            const b = readFileSync(join(FIXTURE_DIR, f.path));
            expect([f.path, b.length, sha256(b)]).toEqual([f.path, f.bytes, f.sha256]);
        }
        expect(readdirSync(FIXTURE_DIR).sort()).toEqual(['.gitattributes', 'MANIFEST.json', 'PROVENANCE.md', 'README.md', 'vendor']);
    });

    test('four faces, one per technology; every vendored face pinned by an OFFICE-CORPUS entry', () => {
        expect(manifest.faces.map((f) => [f.id, f.technology])).toEqual([
            ['liberation-sans-regular', 'static TrueType (hinted)'],
            ['source-sans-3-regular', 'static CFF'],
            ['source-sans-3-vf-upright', 'variable CFF2'],
            ['kalnia-glaze', 'COLR v1 colour, variable TrueType']
        ]);
        for (const f of manifest.faces.slice(1)) expect(f.corpusEntry).toMatch(/^office-ofl-/);
        expect(manifest.faces.every((f) => f.licence === 'OFL-1.1')).toBe(true);
    });

    test('the reused Liberation face equals its oconv-fonts provenance record', () => {
        const prov = JSON.parse(readFileSync(join(FIXTURE_DIR, '../../../../oconv-fonts/vendor/PROVENANCE.json'), 'utf8'));
        const rec = prov.trees[0].files.find((f) => f.path === 'liberation/LiberationSans-Regular.ttf');
        const lib = manifest.faces[0];
        expect([lib.bytes, lib.sha256]).toEqual([rec.bytes, rec.sha256]);
        expect(lib.corpusEntry).toBeNull();
    });

    test('the font technologies are what the manifest says', () => {
        const t = (id) => Object.keys(tablesOf(face(id).bytes));
        expect(t('liberation-sans-regular')).toEqual(expect.arrayContaining(['glyf', 'fpgm', 'kern']));
        expect(t('source-sans-3-regular')).toContain('CFF ');
        expect(t('source-sans-3-vf-upright')).toEqual(expect.arrayContaining(['CFF2', 'fvar', 'avar', 'HVAR']));
        expect(t('kalnia-glaze')).toEqual(expect.arrayContaining(['COLR', 'CPAL', 'glyf', 'gvar', 'fvar']));
        expect(rt.resolve('tableColr').parseColr(tablesOf(face('kalnia-glaze').bytes).COLR.bytes).version).toBe(1);
    });
});

describe('the measure’s own rules', () => {
    /** The package runtime with one module replaced by a stand-in. */
    const standIn = (name, mod) => ({ resolve: (n) => (n === name ? mod : rt.resolve(n)) });
    const lib = face('liberation-sans-regular').bytes;

    /** A `fonts` stand-in whose reads of anything but the source face (the subset) are altered by `alter(font)`. */
    function alteredReread(alter) {
        const api = rt.resolve('fonts');
        return { read(b) { const f = api.read(b); return b === lib ? f : alter(f); } };
    }

    test('a changed advance, a changed outline or an unmapped code point fails the round-trip', () => {
        const advance = alteredReread((f) => ({ ...f, getGlyphByIndex: (g) => ({ ...f.getGlyphByIndex(g), advanceWidth: -1 }) }));
        expect(subsetRoundTrip(lib, standIn('fonts', advance))).toMatchObject({ widthDiffs: 2327, pathDiffs: 0, missing: 0 });
        const outline = alteredReread((f) => ({ ...f, getGlyphByIndex: (g) => ({ ...f.getGlyphByIndex(g), path: null }) }));
        expect(subsetRoundTrip(lib, standIn('fonts', outline)).pathDiffs).toBeGreaterThan(2000);
        const unmapped = alteredReread((f) => ({ ...f, glyphIndexForCodePoint: (cp, o) => (cp === 0x41 ? -1 : f.glyphIndexForCodePoint(cp, o)) }));
        const r = subsetRoundTrip(lib, standIn('fonts', unmapped));
        expect([r.missing, r.first]).toEqual([1, 'U+0041 not mapped']);
        const m = measureFaces([{ id: 'x', path: 'x.ttf', bytes: lib }], standIn('fonts', unmapped));
        expect(m.cases.find((c) => c.case === 'x :: subset round-trip')).toEqual({
            case: 'x :: subset round-trip', ok: false, detail: '1 unmapped, 0 advances, 0 outlines differ of 2327; first: U+0041 not mapped'
        });
    });

    test('a parse failure, or a CharStrings count other than numGlyphs, fails the parse case', () => {
        const bad = lib.slice();
        const name = tablesOf(bad).name;
        bad.fill(0xff, name.offset + 2, name.offset + 4);      // name record count 0xFFFF (cap 32,768)
        expect(measureFaces([{ id: 'x', path: 'x.ttf', bytes: bad }], rt).cases[0]).toEqual({
            case: 'x :: parse', ok: false, detail: 'read: fonts/name-too-many; name: fonts/name-too-many'
        });
        const maxp = rt.resolve('tableMaxp');
        const offByOne = { ...maxp, parseMaxp: (b) => { const m = maxp.parseMaxp(b); return { ...m, numGlyphs: m.numGlyphs + 1 }; } };
        const cff = face('source-sans-3-regular');
        const n = maxp.parseMaxp(tablesOf(cff.bytes).maxp.bytes).numGlyphs;
        const c = measureFaces([cff], standIn('tableMaxp', offByOne)).cases[0];
        expect(c.ok).toBe(false);
        expect(c.detail).toContain(`CharStrings count ${n} vs numGlyphs ${n + 1}`);
    });

    test('a paint graph with a cycle, a truncation or a throw fails the paints case', () => {
        const colr = rt.resolve('tableColr');
        let n = 0;
        const fake = {
            ...colr,
            decodePaintGraph(b, off) {
                n++;
                if (n === 1) return { cycle: true, offset: off };
                if (n === 2) return { truncated: true, offset: off };
                if (n === 3) throw new TypeError('stand-in');
                return colr.decodePaintGraph(b, off);
            }
        };
        const k = face('kalnia-glaze');
        const s = paintGraphs(tablesOf(k.bytes).COLR.bytes, standIn('tableColr', fake));
        expect([s.cycles, s.truncated, s.errors, s.firstError]).toEqual([1, 1, 1, 'untyped TypeError: stand-in']);
        n = 0;
        const m = measureFaces([k], standIn('tableColr', fake));
        expect(m.cases.find((c) => c.case === 'kalnia-glaze :: colr-v1 paints').ok).toBe(false);
    });
});

describe('the OFL faces', () => {
    test('ofl-faces: 7 of 7 cases; the two CFF subsets skipped', () => {
        expect(result.cases).toEqual([
            { case: 'liberation-sans-regular :: parse', ok: true },
            { case: 'liberation-sans-regular :: subset round-trip', ok: true },
            { case: 'source-sans-3-regular :: parse', ok: true },
            { case: 'source-sans-3-vf-upright :: parse', ok: true },
            { case: 'kalnia-glaze :: parse', ok: true },
            { case: 'kalnia-glaze :: colr-v1 paints', ok: true },
            { case: 'kalnia-glaze :: subset round-trip', ok: true }
        ]);
        expect(result.skipped).toEqual([
            { case: 'source-sans-3-regular :: subset round-trip', reason: SUBSET_SKIP },
            { case: 'source-sans-3-vf-upright :: subset round-trip', reason: SUBSET_SKIP }
        ]);
    });

    test('the CFF and CFF2 faces are refused by subsetForPdf with the typed fonts/subset-bad-font', () => {
        const { subsetForPdf } = rt.resolve('embedSubsetForPdf');
        const { ContractError } = rt.resolve('fontErrors');
        for (const id of ['source-sans-3-regular', 'source-sans-3-vf-upright']) {
            const font = rt.resolve('fonts').read(face(id).bytes);
            let err;
            try { subsetForPdf(font, new Set([0x41])); } catch (e) { err = e; }
            expect([id, err instanceof ContractError, err && err.code]).toEqual([id, true, 'fonts/subset-bad-font']);
        }
    });

    test('the counts behind the cases', () => {
        expect(subsetRoundTrip(face('liberation-sans-regular').bytes, rt)).toEqual({
            codePoints: 2327, glyphs: 2620, subsetGlyphs: 2372, missing: 0, widthDiffs: 0, pathDiffs: 0, first: null
        });
        expect(subsetRoundTrip(face('kalnia-glaze').bytes, rt)).toEqual({
            codePoints: 380, glyphs: 1138, subsetGlyphs: 385, missing: 0, widthDiffs: 0, pathDiffs: 0, first: null
        });
        expect(paintGraphs(tablesOf(face('kalnia-glaze').bytes).COLR.bytes, rt)).toEqual({
            roots: 387, layers: 714, nodes: 1845, cycles: 0, truncated: 0, errors: 0, firstError: null
        });
    });
});
