// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Unit tests for `pdfFontEmbed`.
 *
 * BL-952 — the previous revision of this file stubbed `subsetForPdf` with a
 * shape (`font`/`subtype`/`baseFont`/`firstChar`/`lastChar`/`fontFile`) the
 * real `@awacloud/fonts` package has never produced, so the suite stayed
 * green over a permanently broken adapter. The stub below returns EXACTLY
 * the eight keys the real subsetter returns, and `describe('contract-shape
 * guard')` pins that claim against the REAL module resolved through a
 * `ModuleRuntime` seeded with `@awacloud/fonts`' own manifest — the stub can
 * no longer drift from the package it stands in for.
 *
 * The guard needs a real parsed `Font`; it builds one with the fonts
 * package's own test helper via a relative path (test-only import,
 * precedent: `src/crypto/standardV4.paths.test.js` reaching into
 * `../../../../fw/src/...`).
 *
 * @module pdf/font/embed.test
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { pdfFontEmbed } from './embed.js';
import { pdfErrors } from '../errors.js';
import * as fontsPkg from '@awacloud/fonts';
import { embedClosure } from '@awacloud/fonts/embed-pdf/subsetForPdf/closure';
import { embedCmapBuilder } from '@awacloud/fonts/embed-pdf/subsetForPdf/cmap-builder';
import { embedGlyphRewriter } from '@awacloud/fonts/embed-pdf/subsetForPdf/glyph-rewriter';
import { embedHash } from '@awacloud/fonts/embed-pdf/subsetForPdf/hash';
import { buildTtf, buildSimpleGlyph } from '../../../fonts/tests/_helpers/build.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const errors = _pdfErrors_TD1;
const { ContractError } = errors;

// --- the MEASURED contract of `@awacloud/fonts`' subsetForPdf ------------
// packages/front/office/fonts/src/embed-pdf/subsetForPdf.js:196-205
const REAL_SUBSET_KEYS = [
    'encoding', 'fontDescriptor', 'gidMap', 'glyphMap',
    'postScriptName', 'subsetBytes', 'toUnicodeCmap', 'widths'
];

const STUB_SUBSET_BYTES = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x42]);

/**
 * Stub subsetter: same key set, same value KINDS as the real one.
 * `widths` is indexed by NEW gid and expressed in FONT UNITS (never in
 * 1000/em) — that rescaling is the adapter's job.
 */
function stubSubsetForPdf(font, cps) {
    const list = [...cps];
    const glyphMap = new Map();      // cp → newGid (gid 0 stays .notdef)
    const gidMap = new Map([[0, 0]]);
    const widths = [0];
    list.forEach((cp, i) => {
        glyphMap.set(cp, i + 1);
        gidMap.set(100 + i, i + 1);
        widths.push(500 + i);
    });
    return {
        subsetBytes: STUB_SUBSET_BYTES,
        gidMap,
        glyphMap,
        encoding: null,
        widths,
        toUnicodeCmap: '/CIDInit /ProcSet findresource begin\nendcmap',
        postScriptName: 'AAAAAA+Stub',
        fontDescriptor: {
            FontName: 'AAAAAA+Stub',
            Flags: 32,
            ItalicAngle: 0,
            FontBBox: [0, 0, 1000, 1000],
            FontFile2: STUB_SUBSET_BYTES
        }
    };
}

const stubModules = {
    subsetForPdf: { subsetForPdf: stubSubsetForPdf },
    fontDescriptor: {
        buildFontDescriptor(font, opts) {
            return {
                FontName: 'AAAAAA+Stub', Flags: 32, ItalicAngle: 0,
                FontBBox: [0, 0, 1000, 1000],
                FontFile2: (opts && opts.subsetBytes) || STUB_SUBSET_BYTES
            };
        }
    },
    cidSystemInfo: {
        buildCidSystemInfo() {
            return { Registry: 'Adobe', Ordering: 'Identity', Supplement: 0 };
        }
    },
    toUnicodeBuilder: {
        embedBuildToUnicode() { return '/CIDInit built-by-fallback endcmap'; }
    }
};

function createEmbed(overrides) {
    const m = { ...stubModules, ...(overrides || {}) };
    return pdfFontEmbed.factory(errors, m.subsetForPdf, m.fontDescriptor, m.cidSystemInfo, m.toUnicodeBuilder);
}

/** Minimal parsed-Font duck typing accepted by `assertFont`. */
function stubFont(over) {
    return {
        unitsPerEm: 1000,
        unicodeMap: new Map([[0x41, 1], [0x42, 2]]),
        glyphIndexForCodePoint: () => 1,
        advanceWidth: () => 400,
        ...(over || {})
    };
}

const dec = (u8) => new TextDecoder().decode(u8);

describe('createEmbed — wiring', () => {
    test('rejects malformed input', () => {
        expect(() => pdfFontEmbed.factory(errors, {}, {}, {}, {})).toThrow(ContractError);
        expect(() => createEmbed({ subsetForPdf: {} })).toThrow(ContractError);
        expect(() => createEmbed({ fontDescriptor: {} })).toThrow(ContractError);
        expect(() => createEmbed({ cidSystemInfo: {} })).toThrow(ContractError);
        expect(() => createEmbed({ toUnicodeBuilder: {} })).toThrow(ContractError);
    });

    test('the missing-helper error carries code pdf/embed/missing-fonts-embed', () => {
        try {
            pdfFontEmbed.factory(errors, {}, {}, {}, {});
            throw new Error('should have thrown');
        } catch (e) {
            expect(e.code).toBe('pdf/embed/missing-fonts-embed');
        }
    });
});

describe('embedSimple', () => {
    test('builds a WinAnsi TrueType font dict', () => {
        const em = createEmbed();
        const r  = em.embedSimple(stubFont(), [0x43, 0x41, 0x42, 0x41]);

        expect(r.subtype).toBe('TrueType');
        expect(r.codePoints).toEqual([0x41, 0x42, 0x43]);          // deduped + sorted
        expect(r.fontDict.entries.Type.value).toBe('Font');
        expect(r.fontDict.entries.Subtype.value).toBe('TrueType');
        expect(r.fontDict.entries.BaseFont.value).toBe('AAAAAA+Stub');
        expect(r.fontDict.entries.Encoding.value).toBe('WinAnsiEncoding');
        expect(r.fontDict.entries.FirstChar.value).toBe(0x41);
        expect(r.fontDict.entries.LastChar.value).toBe(0x43);
        expect(r.fontDict.entries.Widths.items.map(w => w.value)).toEqual([500, 501, 502]);
        expect(r.fontDict.entries.FontDescriptor).toBe(r.descriptor);
        expect(r.toUnicodeStream.type).toBe('stream');
    });

    test('descriptor keeps its dict keys but NOT the font program', () => {
        const em = createEmbed();
        const r  = em.embedSimple(stubFont(), [0x41]);
        expect(Object.keys(r.descriptor.entries).sort())
            .toEqual(['Flags', 'FontBBox', 'FontName', 'ItalicAngle', 'Type']);
        expect(r.descriptor.entries.FontFile2).toBeUndefined();
        expect(r.descriptor.entries.FontName.type).toBe('name');    // 'ABCDEF+X' is a name, not a string
        expect(r.fontFileKey).toBe('FontFile2');
        expect(r.fontFile).toBe(STUB_SUBSET_BYTES);
    });

    test('builds a BYTE-keyed ToUnicode CMap, never the subset gid-keyed one', () => {
        const em = createEmbed({
            toUnicodeBuilder: {
                embedBuildToUnicode(map) {
                    // The simple route must key the CMap by WinAnsi byte.
                    return `built-by-fallback ${[...map.keys()].join(',')}`;
                }
            }
        });
        const r = em.embedSimple(stubFont(), [0x41, 0xE9]);
        expect(dec(r.toUnicodeStream.raw)).toBe('built-by-fallback 65,233');
        expect(dec(r.toUnicodeStream.raw)).not.toContain('/CIDInit /ProcSet');
    });

    test('builds the ToUnicode CMap with a one-byte codespace ({ codeBytes: 1 })', () => {
        const seen = [];
        const em = createEmbed({
            toUnicodeBuilder: {
                embedBuildToUnicode(map, opts) {
                    seen.push(opts);
                    return 'built-by-fallback';
                }
            }
        });
        em.embedSimple(stubFont(), [0x41, 0xE9]);
        expect(seen).toHaveLength(1);
        expect(seen[0]).toEqual({ codeBytes: 1 });
    });

    test('rescales widths from font units to 1000/em', () => {
        const em = createEmbed();
        const r  = em.embedSimple(stubFont({ unitsPerEm: 2048 }), [0x41]);
        expect(r.widthOf(0x41)).toBe(Math.round((500 * 1000) / 2048));   // 244
    });

    test('derives widths from the font when the subsetter omits them', () => {
        const em = createEmbed({
            subsetForPdf: {
                subsetForPdf(font, cps) {
                    const s = stubSubsetForPdf(font, cps);
                    delete s.widths;
                    return s;
                }
            }
        });
        const r = em.embedSimple(stubFont(), [0x41]);
        expect(r.widthOf(0x41)).toBe(400);
    });

    test('encode maps each code point to its WinAnsi byte', () => {
        const em = createEmbed();
        const r  = em.embedSimple(stubFont(), [0x41, 0x42, 0xE9, 0x20AC]);
        expect(Array.from(r.encode('ABé€'))).toEqual([0x41, 0x42, 0xE9, 0x80]);
    });

    test('encode rejects a code point outside the embedding', () => {
        const em = createEmbed();
        const r  = em.embedSimple(stubFont(), [0x41]);
        expect(() => r.encode('B')).toThrow(ContractError);
        try { r.encode('B'); } catch (e) { expect(e.code).toBe('pdf/embed/not-winansi'); }
    });

    test('widthOf returns 0 for an absent code point', () => {
        const em = createEmbed();
        const r  = em.embedSimple(stubFont(), [0x41]);
        expect(r.widthOf(0x5A)).toBe(0);
    });

    test('rejects a non-WinAnsi code point', () => {
        const em = createEmbed();
        try {
            em.embedSimple(stubFont(), [0x41, 0x4E00]);
            throw new Error('should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(ContractError);
            expect(e.code).toBe('pdf/embed/not-winansi');
            expect(e.context.cp).toBe(0x4E00);
        }
    });

    test('rejects a non-Font input', () => {
        const em = createEmbed();
        for (const bad of [null, undefined, {}, { unitsPerEm: 1000 }]) {
            try {
                em.embedSimple(bad, [0x41]);
                throw new Error('should have thrown');
            } catch (e) {
                expect(e).toBeInstanceOf(ContractError);
                expect(e.code).toBe('pdf/embed/bad-font');
            }
        }
    });

    test('rejects malformed codePoints', () => {
        const em = createEmbed();
        for (const bad of [null, 42, [1.5], [-1], []]) {
            try {
                em.embedSimple(stubFont(), bad);
                throw new Error('should have thrown');
            } catch (e) {
                expect(e).toBeInstanceOf(ContractError);
                expect(e.code).toBe('pdf/embed/bad-codepoints');
            }
        }
    });
});

describe('embedCid', () => {
    test('builds Type0 + CIDFontType2 descendant', () => {
        const em = createEmbed();
        const r  = em.embedCid(stubFont(), [0x4E00, 0x4E01]);

        expect(r.type0Dict.entries.Type.value).toBe('Font');
        expect(r.type0Dict.entries.Subtype.value).toBe('Type0');
        expect(r.type0Dict.entries.Encoding.value).toBe('Identity-H');
        expect(r.type0Dict.entries.BaseFont.value).toBe('AAAAAA+Stub');
        expect(r.type0Dict.entries.DescendantFonts.type).toBe('array');
        expect(r.type0Dict.entries.DescendantFonts.items[0]).toBe(r.cidFontDict);
        expect(r.cidFontDict.entries.Subtype.value).toBe('CIDFontType2');
        expect(r.cidFontDict.entries.CIDSystemInfo.entries.Registry.value).toBe('Adobe');
        expect(r.cidFontDict.entries.DW.value).toBe(1000);
        expect(r.cidFontDict.entries.CIDToGIDMap.value).toBe('Identity');
        expect(r.cidFontDict.entries.FontDescriptor).toBe(r.descriptor);
        expect(r.descriptor.entries.FontFile2).toBeUndefined();
        expect(r.fontFileKey).toBe('FontFile2');
        expect(r.codePoints).toEqual([0x4E00, 0x4E01]);
    });

    test('W is the compact form and covers exactly the subset CIDs', () => {
        const em = createEmbed();
        const r  = em.embedCid(stubFont(), [0x4E00, 0x4E01]);
        const w  = r.cidFontDict.entries.W;
        expect(w.type).toBe('array');
        expect(w.items.length).toBe(2);                     // one [start, [w…]] run
        expect(w.items[0].value).toBe(0);
        expect(w.items[1].items.map(x => x.value)).toEqual([0, 500, 501]);
        // CID === new gid: every glyphMap value is written into the run.
        const subset = stubSubsetForPdf(stubFont(), r.codePoints);
        for (const cid of subset.glyphMap.values()) {
            expect(cid).toBeGreaterThanOrEqual(w.items[0].value);
            expect(cid).toBeLessThan(w.items[0].value + w.items[1].items.length);
        }
    });

    test('uses the subset gid-keyed ToUnicode CMap rather than rebuilding one', () => {
        const em = createEmbed();
        const r  = em.embedCid(stubFont(), [0x4E00]);
        expect(dec(r.toUnicodeStream.raw)).toContain('/CIDInit /ProcSet');
        expect(dec(r.toUnicodeStream.raw)).not.toContain('built-by-fallback');
    });

    test('falls back to embedBuildToUnicode when the subsetter supplies no CMap', () => {
        const em = createEmbed({
            subsetForPdf: {
                subsetForPdf(font, cps) {
                    const s = stubSubsetForPdf(font, cps);
                    s.toUnicodeCmap = null;
                    return s;
                }
            }
        });
        const r = em.embedCid(stubFont(), [0x4E00]);
        expect(dec(r.toUnicodeStream.raw)).toContain('built-by-fallback');
    });

    test('the embedCid fallback keeps the 2-byte default (empty options)', () => {
        const seen = [];
        const em = createEmbed({
            subsetForPdf: {
                subsetForPdf(font, cps) {
                    const s = stubSubsetForPdf(font, cps);
                    s.toUnicodeCmap = null;
                    return s;
                }
            },
            toUnicodeBuilder: {
                embedBuildToUnicode(map, opts) {
                    seen.push(opts);
                    return 'built-by-fallback';
                }
            }
        });
        em.embedCid(stubFont(), [0x4E00]);
        expect(seen).toHaveLength(1);
        expect(seen[0]).toEqual({});
    });

    test('encode emits 2 big-endian bytes per code point', () => {
        const em = createEmbed();
        const r  = em.embedCid(stubFont(), [0x4E00, 0x4E01]);
        expect(Array.from(r.encode('一丁'))).toEqual([0x00, 0x01, 0x00, 0x02]);
        expect(r.encode.missing).toBe(0);
    });

    test('encode maps an unknown code point to .notdef and counts it', () => {
        const em = createEmbed();
        const r  = em.embedCid(stubFont(), [0x4E00]);
        expect(Array.from(r.encode('一Z'))).toEqual([0x00, 0x01, 0x00, 0x00]);
        expect(r.encode.missing).toBe(1);
    });

    test('accepts code points no WinAnsi byte can carry', () => {
        const em = createEmbed();
        expect(() => em.embedCid(stubFont(), [0x2192, 0x1F600])).not.toThrow();
    });

    test('rejects a non-Font input', () => {
        const em = createEmbed();
        try {
            em.embedCid(null, [0x41]);
            throw new Error('should have thrown');
        } catch (e) {
            expect(e.code).toBe('pdf/embed/bad-font');
        }
    });
});

describe('contract-shape guard — the stub matches the REAL @awacloud/fonts (BL-952)', () => {
    function fontsRuntime() {
        const rt = new ModuleRuntime();
        for (const m of [
            ...fontsPkg.fw_require, ...fontsPkg.modules,
            embedClosure, embedCmapBuilder, embedGlyphRewriter, embedHash
        ]) rt.register(m);
        return rt;
    }

    function realFont(rt) {
        const tri = buildSimpleGlyph(
            [{ x: 0, y: 0, onCurve: true }, { x: 100, y: 0, onCurve: true },
             { x: 50, y: 100, onCurve: true }],
            { xMin: 0, yMin: 0, xMax: 100, yMax: 100 });
        const square = buildSimpleGlyph(
            [{ x: 0, y: 0, onCurve: true }, { x: 200, y: 0, onCurve: true },
             { x: 200, y: 200, onCurve: true }, { x: 0, y: 200, onCurve: true }],
            { xMin: 0, yMin: 0, xMax: 200, yMax: 200 });
        const ttf = buildTtf({ glyphs: [new Uint8Array(0), tri, square], advances: [500, 700, 800] });
        return rt.resolve('fonts').read(ttf);
    }

    test('the real subsetForPdf returns exactly the key set the stub returns', () => {
        const rt = fontsRuntime();
        const { subsetForPdf } = rt.resolve('embedSubsetForPdf');
        const real = subsetForPdf(realFont(rt), [0x41, 0x42]);

        expect(Object.keys(real).sort()).toEqual(REAL_SUBSET_KEYS);
        expect(Object.keys(stubSubsetForPdf(stubFont(), [0x41, 0x42])).sort())
            .toEqual(Object.keys(real).sort());
    });

    test('the value kinds the adapter reads match too', () => {
        const rt = fontsRuntime();
        const { subsetForPdf } = rt.resolve('embedSubsetForPdf');
        const real = subsetForPdf(realFont(rt), [0x41, 0x42]);

        expect(real.subsetBytes).toBeInstanceOf(Uint8Array);
        expect(real.gidMap).toBeInstanceOf(Map);
        expect(real.glyphMap).toBeInstanceOf(Map);
        expect(Array.isArray(real.widths)).toBe(true);
        expect(typeof real.toUnicodeCmap).toBe('string');
        expect(typeof real.postScriptName).toBe('string');
        expect(real.fontDescriptor.FontFile2).toBeInstanceOf(Uint8Array);
        // …and none of the keys the pre-BL-951 adapter used to read.
        for (const dead of ['font', 'subtype', 'baseFont', 'firstChar', 'lastChar', 'fontFile']) {
            expect(dead in real).toBe(false);
        }
    });

    test('the adapter drives the REAL fonts modules end to end', () => {
        const rt = fontsRuntime();
        const em = pdfFontEmbed.factory(
            errors,
            rt.resolve('embedSubsetForPdf'),
            rt.resolve('embedFontDescriptor'),
            rt.resolve('embedCidSystemInfo'),
            rt.resolve('embedToUnicodeBuilder')
        );
        const font = realFont(rt);
        const simple = em.embedSimple(font, [0x41, 0x42]);
        expect(simple.fontFile).toBeInstanceOf(Uint8Array);
        expect(simple.fontDict.entries.BaseFont.value).toMatch(/^[A-Z]{6}\+/);
        expect(simple.widthOf(0x41)).toBeGreaterThan(0);

        const cid = em.embedCid(font, [0x41, 0x42]);
        expect(cid.fontFile).toBeInstanceOf(Uint8Array);
        expect(Array.from(cid.encode('A')).length).toBe(2);
    });
});

describe('pdfFontEmbed module', () => {
    test('module shape', () => {
        expect(pdfFontEmbed.name).toBe('pdfFontEmbed');
        expect(pdfFontEmbed.dependencies).toEqual([
            'pdfErrors',
            'embedSubsetForPdf', 'embedFontDescriptor',
            'embedCidSystemInfo', 'embedToUnicodeBuilder'
        ]);
        expect(pdfFontEmbed.factory.toString()).toContain('function');
        const m = createEmbed();
        expect(Object.keys(m).sort()).toEqual(['embedCid', 'embedSimple']);
    });
});
