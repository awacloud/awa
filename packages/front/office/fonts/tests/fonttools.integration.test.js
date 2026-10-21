// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse outcome of the vendored fonttools test fonts
 * (`_fixtures/fonttools/`: the AOTS fonts and the fontTools-made fonts
 * of fonttools 4.66.1 `Tests/`), through the shared helper
 * `_helpers/fonttools.js`.
 *
 * Three layers:
 *   1. Integrity — every `MANIFEST.json` entry is on disk with its byte
 *      count and SHA-256, nothing unlisted; the excluded files are named
 *      with their reasons.
 *   2. The measure's own rules — classification by magic bytes, the
 *      failure detail (typed code, or an untyped error named as such), a
 *      corrupt table caught per table and per file.
 *   3. The measure over the vendored files, pinned: per-file outcome (the
 *      two refusals by code), per-table counts, skipped cases.
 *
 * Only committed bytes are read; the fetched archive is never needed here.
 *
 * @module fonts/tests/fonttools.integration
 */

import { describe, test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../src/main.js';
import { classify, errorDetail, fontsRuntime, listBinaryFiles, measure } from './_helpers/fonttools.js';

const DIR = fileURLToPath(new URL('_fixtures/fonttools/', import.meta.url));
const VENDOR = join(DIR, 'vendor');
const manifest = JSON.parse(readFileSync(join(DIR, 'MANIFEST.json'), 'utf8'));
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const rt = fontsRuntime();
const files = listBinaryFiles(VENDOR);
const result = measure(files, rt);
const passes = (s) => s.cases.filter((c) => c.ok).length;

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

describe('integrity of the vendored fonttools files', () => {
    test('MANIFEST.json lists exactly the files on disk, each with its bytes and SHA-256', () => {
        expect(manifest.files.map((f) => f.path).sort()).toEqual(allFiles(VENDOR));
        expect(manifest.files).toHaveLength(213);
        for (const f of manifest.files) {
            const b = readFileSync(join(VENDOR, f.path));
            expect([f.path, b.length, sha256(b)]).toEqual([f.path, f.bytes, f.sha256]);
        }
    });

    test('licences: 206 AOTS fonts and their README under Apache-2.0, six fontTools-made fonts under MIT', () => {
        const by = {};
        for (const f of manifest.files) by[f.licence] = (by[f.licence] || 0) + 1;
        expect(by).toEqual({ 'Apache-2.0': 207, MIT: 6 });
        expect(manifest.files.filter((f) => f.licence === 'MIT').map((f) => f.path)).toEqual([
            'Tests/ttx/data/TestOTF.otf', 'Tests/ttx/data/TestTTC.ttc', 'Tests/ttx/data/TestTTCv2.ttc',
            'Tests/ttx/data/TestTTF.ttf', 'Tests/ttx/data/TestWOFF.woff', 'Tests/ttx/data/TestWOFF2.woff2'
        ]);
    });

    test('the upstream licence copies match the manifest, and nothing else sits beside them', () => {
        for (const f of manifest.upstreamNotices) {
            const b = readFileSync(join(DIR, f.path));
            expect([f.path, b.length, sha256(b)]).toEqual([f.path, f.bytes, f.sha256]);
        }
        const docs = ['.gitattributes', 'MANIFEST.json', 'PROVENANCE.md', 'README.md'];
        expect(readdirSync(DIR).sort()).toEqual([...docs, ...manifest.upstreamNotices.map((f) => f.path), 'vendor'].sort());
    });

    test('the manifest names the pinned tag, its commit and archive; every other binary file is excluded with a reason', () => {
        expect([manifest.tag, manifest.ref, manifest.archiveSha256]).toEqual([
            '4.66.1', '9e95795b745a10a1462d56339e70189480f6545a',
            'dcb2ff59d87e63a9c0f0d618210cbac976540b348c04fbcf5b45497561fa8015'
        ]);
        const reasons = {};
        for (const e of manifest.excluded) {
            const k = e.reason.startsWith('third-party') ? 'third-party' : e.reason.startsWith('Type 1') ? 'not claimed' : 'no origin';
            reasons[k] = (reasons[k] || 0) + 1;
        }
        expect(reasons).toEqual({ 'third-party': 11, 'no origin': 19, 'not claimed': 6 });
        const vendored = new Set(manifest.files.map((f) => f.path));
        expect(manifest.excluded.filter((e) => vendored.has(e.path))).toEqual([]);
    });
});

describe('the measure’s own rules', () => {
    test('containers are told by their magic bytes, not their names', () => {
        const head = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
        expect(classify(head('OTTO'))).toBe('sfnt');
        expect(classify(head('true'))).toBe('sfnt');
        expect(classify(Uint8Array.of(0, 1, 0, 0))).toBe('sfnt');
        expect(classify(head('ttcf'))).toBe('ttc');
        expect(classify(head('wOFF'))).toBe('woff');
        expect(classify(head('wOF2'))).toBe('woff2');
        expect(classify(Uint8Array.of(1, 0, 4, 2))).toBe('cff');
        expect(classify(head('%!Fo'))).toBe('other');
        expect(classify(Uint8Array.of(0, 1))).toBe('other');
    });

    test('a failure is the typed code, or an untyped error named as such with its code', () => {
        const { ParseError } = rt.resolve('fontErrors');
        expect(errorDetail(new ParseError('fonts/x', 'm'))).toBe('fonts/x');
        expect(errorDetail(new TypeError('boom'))).toBe('untyped TypeError: boom');
        expect(errorDetail(Object.assign(new Error('brotli: m'), { code: 'EBADSTREAM' }))).toBe('untyped Error (code EBADSTREAM): brotli: m');
    });

    test('a corrupt table fails its table case and its file case; the other tables still count', () => {
        const src = files.find((f) => f.path === 'Tests/ttx/data/TestTTF.ttf');
        const bytes = src.bytes.slice();
        const { parseSfnt } = rt.resolve('fontSfnt');
        const name = parseSfnt(bytes).tables.name;
        bytes.fill(0xff, name.offset + 2, name.offset + 4);     // name record count 0xFFFF (cap 32,768)
        const m = measure([{ path: 'x.ttf', bytes }], rt);
        expect(m.fonts.cases).toEqual([{ case: 'x.ttf', ok: false, detail: 'read: fonts/name-too-many; name: fonts/name-too-many' }]);
        expect(m.tables.cases.filter((c) => !c.ok)).toEqual([{ case: 'x.ttf :: name', ok: false, detail: 'fonts/name-too-many' }]);
        expect(passes(m.tables)).toBe(m.tables.cases.length - 1);
        expect(m.tables.cases.length).toBeGreaterThan(5);
    });

    test('Type 1 and resource-fork files are skipped as not claimed; raw table files go to the tables suite', () => {
        const ttf = files.find((f) => f.path === 'Tests/ttx/data/TestTTF.ttf').bytes;
        const { parseSfnt } = rt.resolve('fontSfnt');
        const headBytes = parseSfnt(ttf).tables.head.bytes.slice();
        const m = measure([
            { path: 'a.pfa', bytes: Uint8Array.from([0x25, 0x21, 0x46, 0x6f]) },
            { path: 'b.dfont', bytes: Uint8Array.of(0, 0, 1, 0) },
            { path: 'c.head.bin', bytes: headBytes }
        ], rt);
        expect(m.fonts.cases).toEqual([]);
        const reason = 'Type 1 or Mac resource-fork font: not a format the package claims';
        expect(m.fonts.skipped).toEqual([{ case: 'a.pfa', reason }, { case: 'b.dfont', reason }]);
        expect(m.tables.cases).toEqual([{ case: 'c.{head}.bin :: head', ok: true }]);
    });

    /** The package runtime with one module replaced by a stand-in. */
    const standIn = (name, mod) => ({ resolve: (n) => (n === name ? mod : rt.resolve(n)) });

    test('every glyph of a glyf font is resolved: a glyph that cannot be fails the file', () => {
        const api = rt.resolve('fonts');
        const fake = {
            read(b) {
                const font = api.read(b);
                return { ...font, getGlyphByIndex(gid) { if (gid === 2) throw new TypeError('stand-in'); return font.getGlyphByIndex(gid); } };
            }
        };
        const ttf = files.find((f) => f.path === 'Tests/ttx/data/TestTTF.ttf');
        const m = measure([ttf], standIn('fonts', fake));
        expect(m.fonts.cases).toEqual([{ case: ttf.path, ok: false, detail: 'glyph 2: untyped TypeError: stand-in' }]);
    });

    test('every CharString of a name-keyed CFF font is decoded: one that cannot be fails the file', () => {
        const cff = rt.resolve('tableCff');
        const { ParseError } = rt.resolve('fontErrors');
        let calls = 0;
        const fake = {
            ...cff,
            decodeCharstring(b, ctx) {
                if (++calls === 3) throw new ParseError('fonts/stand-in', 'stand-in');
                return cff.decodeCharstring(b, ctx);
            }
        };
        const otf = files.find((f) => f.path === 'Tests/ttx/data/TestOTF.otf');
        const m = measure([otf], standIn('tableCff', fake));
        expect(m.fonts.cases).toEqual([{ case: otf.path, ok: false, detail: 'charstring 2: fonts/stand-in' }]);
        expect(calls).toBe(3);
    });
});

describe('the vendored fonttools fonts', () => {
    test('fonttools-fonts: 210 of 212 files; the two refusals are AOTS cmaps mapping past numGlyphs', () => {
        expect(result.fonts.cases).toHaveLength(212);
        expect(passes(result.fonts)).toBe(210);
        expect(result.fonts.skipped).toEqual([]);
        expect(result.fonts.cases.filter((c) => !c.ok)).toEqual([
            // No 0xFFFF terminal segment: the last segment maps U+00C8..U+00D2 to glyphs 256..266 (numGlyphs 100).
            { case: 'Tests/ttLib/tables/data/aots/cmap4_font1.otf', ok: false, detail: 'read: fonts/inconsistent-tables' },
            // Modular idDelta: U+0064.. maps to glyph 65136.. (numGlyphs 100).
            { case: 'Tests/ttLib/tables/data/aots/cmap4_font4.otf', ok: false, detail: 'read: fonts/inconsistent-tables' }
        ]);
    });

    test('fonttools-tables: every one of the 2,278 table instances parses; per-tag counts', () => {
        expect(result.tables.cases).toHaveLength(2278);
        expect(passes(result.tables)).toBe(2278);
        const byTag = {};
        for (const c of result.tables.cases) {
            const tag = c.case.split(' :: ')[1];
            byTag[tag] = (byTag[tag] || 0) + 1;
        }
        expect(byTag).toEqual({
            'CFF ': 208, DSIG: 7, GDEF: 148, GPOS: 93, GSUB: 94, 'OS/2': 214, cmap: 214, gasp: 6,
            glyf: 5, head: 214, hhea: 214, hmtx: 214, loca: 5, maxp: 214, name: 214, post: 214
        });
    });

    test('skipped: the transformed glyf and loca of the WOFF2, and the hinting tables no parser reads', () => {
        expect(result.tables.skipped).toEqual([
            { case: 'Tests/ttx/data/TestWOFF2.woff2 :: glyf', reason: 'WOFF2-transformed table: the transform is not reversed (documented limit)' },
            { case: 'Tests/ttx/data/TestWOFF2.woff2 :: loca', reason: 'WOFF2-transformed table: the transform is not reversed (documented limit)' },
            { case: 'table "cvt "', reason: 'no parser in the package (6 instances)' },
            { case: 'table "fpgm"', reason: 'no parser in the package (6 instances)' },
            { case: 'table "prep"', reason: 'no parser in the package (6 instances)' }
        ]);
    });

    test('each of the two TrueType collections counts once, its fonts measured one by one', () => {
        for (const ttc of ['Tests/ttx/data/TestTTC.ttc', 'Tests/ttx/data/TestTTCv2.ttc']) {
            expect(result.fonts.cases.find((c) => c.case === ttc)).toEqual({ case: ttc, ok: true });
            const fontsSeen = new Set(result.tables.cases.filter((c) => c.case.startsWith(`${ttc}#`)).map((c) => c.case.split(' :: ')[0]));
            expect([...fontsSeen].sort()).toEqual([`${ttc}#0`, `${ttc}#1`]);
        }
    });

    test('the WOFF2 body needs the Brotli static dictionary: without it, a typed contract error names the step', () => {
        const bare = new ModuleRuntime();
        for (const m of [...fw_require, ...modules]) bare.register(m);
        const woff2 = files.find((f) => f.path === 'Tests/ttx/data/TestWOFF2.woff2').bytes;
        const { ContractError } = bare.resolve('fontErrors');
        let err;
        try { bare.resolve('fontWoff2').decode(woff2); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(ContractError);
        expect([err.code, err.cause.code]).toEqual(['fonts/woff2-no-dictionary', 'ENEEDDICT']);
        expect(err.message).toContain('brotliDictWords.setBlob');
        expect(Object.keys(rt.resolve('fontWoff2').decode(woff2).tables)).toContain('name');
    });
});
