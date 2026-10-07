// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `pdfBuilder.addFont({ name, embedded })` against a REAL
 * parsed `@awacloud/fonts` Font — the end-to-end proof BL-953 was missing.
 *
 * Task 01 fixed `pdfFontEmbed` but left every indirect to the consumer, and
 * `pdfBuilder` had no seam to express an embedded font at all. This file
 * drives the whole chain through PUBLISHED surfaces only:
 *
 *     fonts.read(program) → pdfFontEmbed.embedSimple / embedCid
 *         → builder().addPage().addFont({ name, embedded }).addContent(…)
 *         → build() → pdf.read(bytes)
 *
 * and asserts what the builder — not the adapter — owns: the page resource
 * resolves to a font indirect, `/FontDescriptor` and `/ToUnicode` are refs,
 * the `/FontFile2` stream decodes and re-parses with `fonts.read`, and the
 * emitted character codes map back through the written `/ToUnicode` CMap to
 * the exact source string. Both routes, plus a 2-page document sharing one
 * embed result (identity cache).
 *
 * **Cross-package fixture read** — this test reads
 * `packages/front/office/oconv/tests/_fixtures/corpus/pdf/facturx-minimum-sample.pdf`.
 * That is acceptable in the `tests/` tier (not in `src/`): the file is a
 * FIRST-PARTY vendored fixture with provenance recorded in the sibling
 * `PROVENANCE.md`, and no other first-party TrueType program in this repo
 * carries a real Latin subset with accented + symbol coverage. The mining
 * walk below is the spike recipe
 * (`ai/archives/spikes/oconv/w3b-linebreak/apparatus/metrics.js:137-190`),
 * copied rather than imported — the spike ships nothing — and is the same
 * recipe `tests/font-embed-real.integration.test.js` uses.
 *
 * @module pdf/tests/builder-embedded-font.integration
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules, extras, bundle } from '../src/main.js';

const CORPUS_PDF = `${import.meta.dir}/../../oconv/tests/_fixtures/corpus/pdf/facturx-minimum-sample.pdf`;

function buildRuntime() {
    const rt = new ModuleRuntime();
    for (const m of [...fw_require, ...pkg_require, ...modules, ...extras, ...bundle]) rt.register(m);
    return rt;
}

/**
 * Walk page-1 `/Font` resources, decode every `FontFile2` program and parse
 * it with `@awacloud/fonts`. Published surfaces only.
 */
function embeddedFacesFromPdf(rt_, pdfBytes) {
    const pdfApi   = rt_.resolve('pdf');
    const dispatch = rt_.resolve('pdfFilterDispatch');
    const fontsMod = rt_.resolve('fonts');

    const doc = pdfApi.read(pdfBytes);
    const resolveRef = doc._raw.resolve;
    const dref = (o) => (o && o.type === 'ref') ? resolveRef(o) : o;

    const parsed = [];
    const seen = new Set();
    for (const page of doc.pages) {
        const res = dref(page.resources);
        if (!res || !res.entries || !res.entries.Font) continue;
        const fontRes = dref(res.entries.Font);
        for (const key of Object.keys(fontRes.entries)) {
            const fontDict = dref(fontRes.entries[key]);
            let descriptor = fontDict.entries.FontDescriptor
                ? dref(fontDict.entries.FontDescriptor) : null;
            if (!descriptor && fontDict.entries.DescendantFonts) {
                const df = dref(dref(fontDict.entries.DescendantFonts).items[0]);
                descriptor = df.entries.FontDescriptor ? dref(df.entries.FontDescriptor) : null;
            }
            if (!descriptor || !descriptor.entries.FontFile2) continue;
            const program = dispatch.decode(dref(descriptor.entries.FontFile2), resolveRef);
            const font = fontsMod.read(program);
            const psName = font.names.postScriptName;
            if (seen.has(psName)) continue;
            seen.add(psName);
            parsed.push({ psName, font });
        }
    }
    return parsed;
}

const rt = buildRuntime();
let regular = null;
/** ASCII code points the mined face really carries. */
let ASCII = [];

/** Code points present in the face's own cmap, from a candidate list. */
function supported(font, cps) {
    return cps.filter(cp => font.glyphIndexForCodePoint(cp, { strict: true }) > 0);
}

/** A source string restricted to what the mined face can actually render. */
function textFrom(font, candidate) {
    return [...candidate]
        .filter(ch => font.glyphIndexForCodePoint(ch.codePointAt(0), { strict: true }) > 0)
        .join('');
}

/**
 * Unicode probes for the composite route — measured coverage of the mined
 * `Calibri` face (2026-09-02, task 01 report § Corpus): `ﬁ` U+FB01, `⁴`
 * U+2074 and `⁄` U+2044 are present and NOT WinAnsi; `€` and `→` are absent
 * from this face, so the list is filtered before use.
 */
const UNICODE_CANDIDATES = [0xE9, 0x2013, 0x20AC, 0x2192, 0xFB01, 0x2074, 0x2044];

beforeAll(async () => {
    const bytes = new Uint8Array(await Bun.file(CORPUS_PDF).arrayBuffer());
    const faces = embeddedFacesFromPdf(rt, bytes);
    regular = faces.find(f => f.psName === 'Calibri').font;
    ASCII = supported(regular, [...'ABCDEFGHILMNOPRSTUVabcdefghilmnoprstuv '].map(c => c.codePointAt(0)));
});

const HEX = '0123456789ABCDEF';
function hexLit(bytes) {
    let s = '<';
    for (const b of bytes) s += HEX[b >> 4] + HEX[b & 0xF];
    return s + '>';
}

const latin1 = (u8) => {
    let s = '';
    for (const b of u8) s += String.fromCharCode(b);
    return s;
};

/** `BT /F<n> 12 Tf … Tj ET` over the embed's own encoder. */
function contentFor(embed, name, text) {
    return `BT /${name} 12 Tf 72 700 Td ${hexLit(embed.encode(text))} Tj ET\n`;
}

/** Resolve page `i`'s `/F1` down to its dicts + decoded streams. */
function readBackFont(bytes, pageIndex, fontName, isCid) {
    const pdfApi   = rt.resolve('pdf');
    const dispatch = rt.resolve('pdfFilterDispatch');
    const doc = pdfApi.read(bytes);
    const resolveRef = doc._raw.resolve;
    const dref = (o) => (o && o.type === 'ref') ? resolveRef(o) : o;

    const page = doc.pages[pageIndex];
    const res = dref(page.resources);
    const fontRes = dref(res.entries.Font);
    const fontRef = fontRes.entries[fontName];
    const fontDict = dref(fontRef);
    const holder = isCid
        ? dref(dref(fontDict.entries.DescendantFonts).items[0])
        : fontDict;
    const descriptor = dref(holder.entries.FontDescriptor);
    const program = dispatch.decode(dref(descriptor.entries.FontFile2), resolveRef);
    const toUnicodeBytes = dispatch.decode(dref(fontDict.entries.ToUnicode), resolveRef);
    // `page.contents` is a list of plain `{num,gen}` (no `type:'ref'`) — the
    // raw dict entry is the resolvable one.
    const contents = dispatch.decode(dref(page.raw.entries.Contents), resolveRef);
    return { doc, fontRef, fontDict, holder, descriptor, program, toUnicodeBytes, contents };
}

/** Decode the emitted codes back to text through the written CMap. */
function decodeThroughToUnicode(toUnicodeBytes, codes, isCid) {
    const cmapMod = rt.resolve('cmapToUnicode');
    const toU = cmapMod.parseToUnicode(latin1(toUnicodeBytes));
    let out = '';
    if (isCid) {
        for (let i = 0; i < codes.length; i += 2) {
            out += toU.get((codes[i] << 8) | codes[i + 1]) ?? '�';
        }
    } else {
        for (const code of codes) out += toU.get(code) ?? '�';
    }
    return out;
}

describe('builder.addFont({ name, embedded }) — simple route, real Font', () => {
    test('one page: resource → font → descriptor → FontFile2 re-parses', () => {
        const emb = rt.resolve('pdfFontEmbed');
        const { builder } = rt.resolve('pdfBuilder');
        const fontsMod = rt.resolve('fonts');
        const subsetMod = rt.resolve('embedSubsetForPdf');

        const TEXT = textFrom(regular, 'Hello embedded builder');
        expect(TEXT.length).toBeGreaterThan(8);
        const cps = [...new Set([...TEXT].map(c => c.codePointAt(0)))].sort((a, b) => a - b);
        const e = emb.embedSimple(regular, cps);
        const expectedGlyphs = subsetMod.subsetForPdf(regular, e.codePoints).widths.length;

        const bytes = builder()
            .addPage({ mediaBox: [0, 0, 612, 792] })
            .addFont({ name: 'F1', embedded: e })
            .addContent(contentFor(e, 'F1', TEXT))
            .build();

        const back = readBackFont(bytes, 0, 'F1', false);
        expect(back.fontRef.type).toBe('ref');
        expect(back.fontDict.entries.Subtype.value).toBe('TrueType');
        expect(back.fontDict.entries.Encoding.value).toBe('WinAnsiEncoding');
        expect(back.fontDict.entries.BaseFont.value).toMatch(/^[A-Z]{6}\+Calibri$/);
        expect(back.descriptor.entries.FontFile2).toBeTruthy();

        const subFont = fontsMod.read(back.program);
        expect(subFont.numGlyphs).toBe(expectedGlyphs);
        for (const cp of cps) {
            expect(subFont.glyphIndexForCodePoint(cp, { strict: true })).toBeGreaterThan(0);
        }
        expect(latin1(back.contents)).toContain('Tj');
    });

    test('/Length1 equals the embedded program length', () => {
        const emb = rt.resolve('pdfFontEmbed');
        const { builder } = rt.resolve('pdfBuilder');
        const e = emb.embedSimple(regular, ASCII);
        const bytes = builder().addPage().addFont({ name: 'F1', embedded: e }).build();

        const pdfApi = rt.resolve('pdf');
        const doc = pdfApi.read(bytes);
        const dref = (o) => (o && o.type === 'ref') ? doc._raw.resolve(o) : o;
        const fontDict = dref(dref(dref(doc.pages[0].resources).entries.Font).entries.F1);
        const desc = dref(fontDict.entries.FontDescriptor);
        const stream = dref(desc.entries.FontFile2);
        expect(stream.dict.entries.Length1.value).toBe(e.fontFile.length);
        expect(stream.raw.length).toBe(e.fontFile.length);
    });

    test('the written /ToUnicode maps the emitted codes back to the source text', () => {
        const emb = rt.resolve('pdfFontEmbed');
        const { builder } = rt.resolve('pdfBuilder');
        const TEXT = textFrom(regular, 'Hello embedded builder');
        const cps = [...new Set([...TEXT].map(c => c.codePointAt(0)))].sort((a, b) => a - b);
        const e = emb.embedSimple(regular, cps);

        const bytes = builder().addPage()
            .addFont({ name: 'F1', embedded: e })
            .addContent(contentFor(e, 'F1', TEXT))
            .build();

        const back = readBackFont(bytes, 0, 'F1', false);
        expect(decodeThroughToUnicode(back.toUnicodeBytes, e.encode(TEXT), false)).toBe(TEXT);
    });

    test('the written /ToUnicode declares a one-byte codespace and 2-hex-digit codes', () => {
        const emb = rt.resolve('pdfFontEmbed');
        const { builder } = rt.resolve('pdfBuilder');
        const TEXT = textFrom(regular, 'Hello embedded builder');
        const cps = [...new Set([...TEXT].map(c => c.codePointAt(0)))].sort((a, b) => a - b);
        const e = emb.embedSimple(regular, cps);

        const bytes = builder().addPage()
            .addFont({ name: 'F1', embedded: e })
            .addContent(contentFor(e, 'F1', TEXT))
            .build();

        const cmap = latin1(readBackFont(bytes, 0, 'F1', false).toUnicodeBytes);
        expect(cmap).toContain('begincodespacerange\n<00> <FF>');
        expect(cmap).not.toContain('<0000> <FFFF>');
        const sources = cmap.split('\n').filter(l => /^<[0-9A-F]+>/.test(l)
            && !l.startsWith('<00> <FF>'));
        expect(sources.length).toBeGreaterThan(0);
        for (const l of sources) expect(l).toMatch(/^<[0-9A-F]{2}>/);
    });

    test('the embed result is left untouched by the builder', () => {
        const emb = rt.resolve('pdfFontEmbed');
        const { builder } = rt.resolve('pdfBuilder');
        const e = emb.embedSimple(regular, ASCII);
        const before = JSON.stringify({ d: e.descriptor, f: e.fontDict });
        builder().addPage().addFont({ name: 'F1', embedded: e }).build();
        expect(JSON.stringify({ d: e.descriptor, f: e.fontDict })).toBe(before);
        expect(e.descriptor.entries.FontFile2).toBeUndefined();
        expect(e.fontDict.entries.FontDescriptor.type).toBe('dict');
    });
});

describe('builder.addFont({ name, embedded }) — composite route, real Font', () => {
    test('Type0 → DescendantFonts ref → CIDFont, program re-parses', () => {
        const emb = rt.resolve('pdfFontEmbed');
        const { builder } = rt.resolve('pdfBuilder');
        const fontsMod = rt.resolve('fonts');
        const subsetMod = rt.resolve('embedSubsetForPdf');

        const extra = supported(regular, UNICODE_CANDIDATES);
        expect(extra.length).toBeGreaterThan(0);
        const TEXT = textFrom(regular, 'Uni ') + extra.map(cp => String.fromCodePoint(cp)).join('');
        const cps = [...new Set([...TEXT].map(c => c.codePointAt(0)))].sort((a, b) => a - b);
        const e = emb.embedCid(regular, cps);
        const expectedGlyphs = subsetMod.subsetForPdf(regular, e.codePoints, { cid: true }).widths.length;

        const bytes = builder()
            .addPage({ mediaBox: [0, 0, 612, 792] })
            .addFont({ name: 'F1', embedded: e })
            .addContent(contentFor(e, 'F1', TEXT))
            .build();

        const back = readBackFont(bytes, 0, 'F1', true);
        expect(back.fontDict.entries.Subtype.value).toBe('Type0');
        expect(back.fontDict.entries.Encoding.value).toBe('Identity-H');
        expect(back.fontDict.entries.DescendantFonts.items[0].type).toBe('ref');
        expect(back.holder.entries.Subtype.value).toBe('CIDFontType2');
        expect(back.holder.entries.CIDToGIDMap.value).toBe('Identity');
        expect(back.holder.entries.DW.value).toBe(1000);

        const subFont = fontsMod.read(back.program);
        expect(subFont.numGlyphs).toBe(expectedGlyphs);
        expect(e.encode.missing).toBe(0);
    });

    test('the written /ToUnicode round-trips the non-WinAnsi text', () => {
        const emb = rt.resolve('pdfFontEmbed');
        const { builder } = rt.resolve('pdfBuilder');
        const extra = supported(regular, UNICODE_CANDIDATES);
        const TEXT = textFrom(regular, 'Uni ') + extra.map(cp => String.fromCodePoint(cp)).join('');
        const cps = [...new Set([...TEXT].map(c => c.codePointAt(0)))].sort((a, b) => a - b);
        const e = emb.embedCid(regular, cps);

        const bytes = builder().addPage()
            .addFont({ name: 'F1', embedded: e })
            .addContent(contentFor(e, 'F1', TEXT))
            .build();

        const back = readBackFont(bytes, 0, 'F1', true);
        expect(decodeThroughToUnicode(back.toUnicodeBytes, e.encode(TEXT), true)).toBe(TEXT);
        // The composite route keeps the two-byte codespace.
        expect(latin1(back.toUnicodeBytes)).toContain('<0000> <FFFF>');
        // Non-WinAnsi coverage really exercised — the simple route rejects it.
        expect(() => emb.embedSimple(regular, cps)).toThrow();
    });

    test('the embed result is left untouched by the builder', () => {
        const emb = rt.resolve('pdfFontEmbed');
        const { builder } = rt.resolve('pdfBuilder');
        const e = emb.embedCid(regular, ASCII);
        const before = JSON.stringify({ d: e.descriptor, t: e.type0Dict, c: e.cidFontDict });
        builder().addPage().addFont({ name: 'F1', embedded: e }).build();
        expect(JSON.stringify({ d: e.descriptor, t: e.type0Dict, c: e.cidFontDict })).toBe(before);
        expect(e.type0Dict.entries.DescendantFonts.items[0].type).toBe('dict');
    });
});

describe('builder — one embedded face shared by two pages', () => {
    test('allocated once; both pages reference the same font object', () => {
        const emb = rt.resolve('pdfFontEmbed');
        const { builder } = rt.resolve('pdfBuilder');
        const fontsMod = rt.resolve('fonts');

        const T1 = textFrom(regular, 'Page one');
        const T2 = textFrom(regular, 'Page two');
        const cps = [...new Set([...(T1 + T2)].map(c => c.codePointAt(0)))].sort((a, b) => a - b);
        const e = emb.embedSimple(regular, cps);

        const bytes = builder()
            .addPage().addFont({ name: 'F1', embedded: e }).addContent(contentFor(e, 'F1', T1))
            .addPage().addFont({ name: 'FA', embedded: e }).addContent(contentFor(e, 'FA', T2))
            .build();

        const p0 = readBackFont(bytes, 0, 'F1', false);
        const p1 = readBackFont(bytes, 1, 'FA', false);
        expect(p0.fontRef.num).toBe(p1.fontRef.num);
        expect(p0.doc.pages.length).toBe(2);

        // The font program appears exactly once in the file.
        const text = latin1(bytes);
        expect((text.match(/\/Length1/g) || []).length).toBe(1);

        // Still a real font, and both pages' text round-trips.
        expect(fontsMod.read(p0.program).numGlyphs).toBeGreaterThan(1);
        expect(decodeThroughToUnicode(p0.toUnicodeBytes, e.encode(T1), false)).toBe(T1);
        expect(decodeThroughToUnicode(p1.toUnicodeBytes, e.encode(T2), false)).toBe(T2);
    });
});
