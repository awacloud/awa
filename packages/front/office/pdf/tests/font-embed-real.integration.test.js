// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `pdfFontEmbed` against a REAL parsed `@awacloud/fonts` Font
 * — the end-to-end proof BL-951/BL-952 were missing.
 *
 * The unit tier can only ever assert the adapter against a stub. This file
 * feeds it the four Calibri faces actually embedded in the vendored
 * `facturx-minimum-sample.pdf`, emits a one-page PDF through
 * `pdfWriter.writeDocument` for BOTH routes (simple `/TrueType` +
 * `/WinAnsiEncoding`, composite `/Type0` + `/Identity-H`), reads it back
 * with `pdf.read`, decodes the embedded `FontFile2` with
 * `pdfFilterDispatch.decode`, re-parses it with `fonts.read`, and maps the
 * emitted character codes back to the source text through the written
 * `/ToUnicode` CMap.
 *
 * **Cross-package fixture read** — this test reads
 * `packages/front/office/oconv/tests/_fixtures/corpus/pdf/facturx-minimum-sample.pdf`.
 * That is acceptable in the `tests/` tier (not in `src/`): the file is a
 * FIRST-PARTY vendored fixture with provenance recorded in the sibling
 * `PROVENANCE.md`, and no other first-party TrueType program in this repo
 * carries a real Latin subset with accented + symbol coverage. The mining
 * walk below is the spike recipe
 * (`ai/archives/spikes/oconv/w3b-linebreak/apparatus/metrics.js:137-190`),
 * copied rather than imported — the spike ships nothing.
 *
 * @module pdf/tests/font-embed-real.integration
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules, extras, bundle } from '../src/main.js';

const CORPUS_PDF = `${import.meta.dir}/../../oconv/tests/_fixtures/corpus/pdf/facturx-minimum-sample.pdf`;

/** PostScript names of the four faces the corpus embeds. */
const EMBEDDED_PSNAMES = ['Calibri', 'Calibri-Bold', 'Calibri-Italic', 'Calibri-BoldItalic'];

function buildRuntime() {
    const rt = new ModuleRuntime();
    for (const m of [...fw_require, ...pkg_require, ...modules, ...extras, ...bundle]) rt.register(m);
    return rt;
}

/**
 * Walk page-1 `/Font` resources, decode every `FontFile2` program and parse
 * it with `@awacloud/fonts`. Published surfaces only.
 */
function embeddedFacesFromPdf(rt, pdfBytes) {
    const pdfApi   = rt.resolve('pdf');
    const dispatch = rt.resolve('pdfFilterDispatch');
    const fontsMod = rt.resolve('fonts');

    const doc = pdfApi.read(pdfBytes);
    const resolveRef = doc._raw.resolve;
    const deref = (o) => (o && o.type === 'ref') ? resolveRef(o) : o;

    const parsed = [];
    const seen = new Set();
    for (const page of doc.pages) {
        const res = deref(page.resources);
        if (!res || !res.entries || !res.entries.Font) continue;
        const fontRes = deref(res.entries.Font);
        for (const key of Object.keys(fontRes.entries)) {
            const fontDict = deref(fontRes.entries[key]);
            let descriptor = fontDict.entries.FontDescriptor
                ? deref(fontDict.entries.FontDescriptor) : null;
            if (!descriptor && fontDict.entries.DescendantFonts) {
                const df = deref(deref(fontDict.entries.DescendantFonts).items[0]);
                descriptor = df.entries.FontDescriptor ? deref(df.entries.FontDescriptor) : null;
            }
            if (!descriptor || !descriptor.entries.FontFile2) continue;
            const program = dispatch.decode(deref(descriptor.entries.FontFile2), resolveRef);
            const font = fontsMod.read(program);
            const psName = font.names.postScriptName;
            if (seen.has(psName)) continue;
            seen.add(psName);
            parsed.push({ psName, font, programBytes: program.length });
        }
    }
    return parsed;
}

const rt = buildRuntime();
let faces = [];
let regular = null;
/** ASCII code points the mined face really carries (it is itself a subset). */
let ASCII = [];

beforeAll(async () => {
    const bytes = new Uint8Array(await Bun.file(CORPUS_PDF).arrayBuffer());
    faces = embeddedFacesFromPdf(rt, bytes);
    regular = faces.find(f => f.psName === 'Calibri').font;
    ASCII = supported(regular, [...'ABCDEFGHILMNOPRSTUVabcdefghilmnoprstuv '].map(c => c.codePointAt(0)));
});

/** Code points present in the face's own cmap, from a candidate list. */
function supported(font, cps) {
    return cps.filter(cp => font.glyphIndexForCodePoint(cp, { strict: true }) > 0);
}

/**
 * Unicode probes for the composite route. Measured coverage of the mined
 * `Calibri` face (2026-09-02): `é` U+00E9 and `–` U+2013 are WinAnsi;
 * `ﬁ` U+FB01, `⁴` U+2074 and `⁄` U+2044 are NOT — they are the ones that
 * make `embedCid` strictly more capable than `embedSimple` here. `€`
 * U+20AC and `→` U+2192 are ABSENT from this subset (`€` lives only in the
 * `Calibri-Italic` face), so the list is filtered before use.
 */
const UNICODE_CANDIDATES = [0xE9, 0x2013, 0x20AC, 0x2192, 0xFB01, 0x2074, 0x2044];

/** A source string restricted to what the mined face can actually render. */
function textFrom(font, candidate) {
    return [...candidate]
        .filter(ch => font.glyphIndexForCodePoint(ch.codePointAt(0), { strict: true }) > 0)
        .join('');
}

describe('corpus mining — the fixture really carries four subset faces', () => {
    test('the four Calibri faces parse from their FontFile2 programs', () => {
        expect(faces.length).toBeGreaterThanOrEqual(4);
        for (const name of EMBEDDED_PSNAMES) {
            const f = faces.find(x => x.psName === name);
            expect(f, `missing embedded face ${name}`).toBeTruthy();
            expect(f.programBytes).toBeGreaterThan(1000);
            expect(f.font.unitsPerEm).toBeGreaterThan(0);
        }
    });
});

describe('embedSimple / embedCid on a REAL Font (BL-951)', () => {
    test('embedSimple no longer throws fonts/fd-no-font', () => {
        const emb = rt.resolve('pdfFontEmbed');
        expect(() => emb.embedSimple(regular, ASCII)).not.toThrow();
    });

    test('embedSimple dict shape', () => {
        const emb = rt.resolve('pdfFontEmbed');
        const r = emb.embedSimple(regular, ASCII);
        expect(r.subtype).toBe('TrueType');
        expect(r.fontDict.entries.Subtype.value).toBe('TrueType');
        expect(r.fontDict.entries.Encoding.value).toBe('WinAnsiEncoding');
        expect(r.fontDict.entries.BaseFont.value).toMatch(/^[A-Z]{6}\+Calibri$/);
        expect(r.fontDict.entries.FirstChar.value).toBe(Math.min(...ASCII));
        expect(r.fontDict.entries.LastChar.value).toBe(Math.max(...ASCII));
        expect(r.fontDict.entries.Widths.items.length)
            .toBe(r.fontDict.entries.LastChar.value - r.fontDict.entries.FirstChar.value + 1);
        expect(r.fontFile).toBeInstanceOf(Uint8Array);
        expect(r.fontFileKey).toBe('FontFile2');
        expect(r.descriptor.entries.FontFile2).toBeUndefined();
        expect(r.widthOf(ASCII[0])).toBeGreaterThan(0);
        expect(r.widthOf(ASCII[0])).toBeLessThan(2000);      // 1000/em, not font units
    });

    test('embedCid covers Unicode the simple route rejects', () => {
        const emb = rt.resolve('pdfFontEmbed');
        const candidates = supported(regular, UNICODE_CANDIDATES);
        expect(candidates.length).toBeGreaterThan(0);        // é / € / → / – coverage
        const cps = [...ASCII, ...candidates];
        const r = emb.embedCid(regular, cps);

        expect(r.type0Dict.entries.Subtype.value).toBe('Type0');
        expect(r.type0Dict.entries.Encoding.value).toBe('Identity-H');
        expect(r.cidFontDict.entries.Subtype.value).toBe('CIDFontType2');
        expect(r.cidFontDict.entries.CIDToGIDMap.value).toBe('Identity');
        expect(r.cidFontDict.entries.DW.value).toBe(1000);
        expect(r.fontFile).toBeInstanceOf(Uint8Array);
        for (const cp of candidates) expect(r.widthOf(cp)).toBeGreaterThan(0);
    });

    test('a non-WinAnsi code point is rejected by the simple route only', () => {
        const emb = rt.resolve('pdfFontEmbed');
        // U+FB01 'ﬁ' — really in this face's cmap, and outside CP1252.
        const lig = supported(regular, [0xFB01, 0x2074, 0x2044])[0];
        expect(lig).toBeGreaterThan(0);
        expect(() => emb.embedSimple(regular, [ASCII[0], lig])).toThrow();
        const r = emb.embedCid(regular, [ASCII[0], lig]);
        expect(r.widthOf(lig)).toBeGreaterThan(0);
    });

    test('every glyphMap CID is inside the written /W run (CID === new gid)', () => {
        const emb = rt.resolve('pdfFontEmbed');
        const subsetMod = rt.resolve('embedSubsetForPdf');
        const cps = [...ASCII];
        const r = emb.embedCid(regular, cps);
        const subset = subsetMod.subsetForPdf(regular, r.codePoints, { cid: true });
        const w = r.cidFontDict.entries.W;
        const start = w.items[0].value;
        const run = w.items[1].items;
        expect(start).toBe(0);
        expect(run.length).toBe(subset.widths.length);
        for (const cid of subset.glyphMap.values()) {
            expect(cid).toBeGreaterThanOrEqual(start);
            expect(cid).toBeLessThan(start + run.length);
        }
    });
});

// ---------------------------------------------------------------------------
// Hand-assembled one-page PDF — both routes, written and read back.
// ---------------------------------------------------------------------------

const HEX = '0123456789ABCDEF';
function hexLit(bytes) {
    let s = '<';
    for (const b of bytes) s += HEX[b >> 4] + HEX[b & 0xF];
    return s + '>';
}

/**
 * Assemble a 1-page PDF around one embed result.
 *
 * The consumer's contract, exactly as `docs/api/font/embed.md` states it:
 * allocate the font program as a stream indirect with `/Length1`, inject the
 * ref into the descriptor, and do the same for `/ToUnicode`.
 */
function assemble(rt_, embed, text, isCid) {
    const { obj } = rt_.resolve('pdfParserObj');
    const pdfApi = rt_.resolve('pdf');
    const te = new TextEncoder();

    const FONT_FILE = 6, TO_UNICODE = 7;
    embed.descriptor.entries[embed.fontFileKey] = obj.ref(FONT_FILE, 0);
    const fontDict = isCid ? embed.type0Dict : embed.fontDict;
    fontDict.entries.ToUnicode = obj.ref(TO_UNICODE, 0);

    const content = te.encode(
        `BT /F1 12 Tf 72 700 Td ${hexLit(embed.encode(text))} Tj ET\n`);

    const indirects = [
        { num: 1, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(2, 0) }) },
        { num: 2, gen: 0, value: obj.dict({
            Type: obj.name('Pages'), Kids: obj.array([obj.ref(3, 0)]), Count: obj.int(1) }) },
        { num: 3, gen: 0, value: obj.dict({
            Type: obj.name('Page'), Parent: obj.ref(2, 0),
            MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
            Resources: obj.dict({ Font: obj.dict({ F1: obj.ref(5, 0) }) }),
            Contents: obj.ref(4, 0) }) },
        { num: 4, gen: 0, value: obj.stream(obj.dict({}), content) },
        { num: 5, gen: 0, value: fontDict },
        { num: FONT_FILE, gen: 0, value: obj.stream(
            obj.dict({ Length1: obj.int(embed.fontFile.length) }), embed.fontFile) },
        { num: TO_UNICODE, gen: 0, value: obj.stream(obj.dict({}), embed.toUnicodeStream.raw) }
    ];
    return pdfApi.write({ indirects, root: { num: 1, gen: 0 } });
}

/** Read the page's `/F1`, returning the resolved dicts + decoded program. */
function readBackFont(rt_, bytes, isCid) {
    const pdfApi   = rt_.resolve('pdf');
    const dispatch = rt_.resolve('pdfFilterDispatch');
    const doc = pdfApi.read(bytes);
    const resolveRef = doc._raw.resolve;
    const deref = (o) => (o && o.type === 'ref') ? resolveRef(o) : o;

    const page = doc.pages[0];
    const res = deref(page.resources);
    const fontRes = deref(res.entries.Font);
    const fontDict = deref(fontRes.entries.F1);
    const holder = isCid
        ? deref(deref(fontDict.entries.DescendantFonts).items[0])
        : fontDict;
    const descriptor = deref(holder.entries.FontDescriptor);
    const program = dispatch.decode(deref(descriptor.entries.FontFile2), resolveRef);
    const toUnicodeBytes = dispatch.decode(deref(fontDict.entries.ToUnicode), resolveRef);
    // `page.contents` is a list of plain `{num,gen}` (no `type:'ref'`) — the
    // raw dict entry is the resolvable one.
    const contents = dispatch.decode(deref(page.raw.entries.Contents), resolveRef);
    return { doc, fontDict, holder, descriptor, program, toUnicodeBytes, contents };
}

const latin1 = (u8) => {
    let s = '';
    for (const b of u8) s += String.fromCharCode(b);
    return s;
};

describe('round-trip — hand-assembled document, simple route', () => {
    test('writes, reads back, and the FontFile2 re-parses as a real font', () => {
        const emb = rt.resolve('pdfFontEmbed');
        const fontsMod = rt.resolve('fonts');
        const subsetMod = rt.resolve('embedSubsetForPdf');
        const TEXT = textFrom(regular, 'Hello embed');
        expect(TEXT.length).toBeGreaterThan(4);
        const cps = [...new Set([...TEXT].map(c => c.codePointAt(0)))].sort((a, b) => a - b);
        const e = emb.embedSimple(regular, cps);
        const expectedGlyphs = subsetMod.subsetForPdf(regular, e.codePoints).widths.length;

        const bytes = assemble(rt, e, TEXT, false);
        const back = readBackFont(rt, bytes, false);

        expect(back.fontDict.entries.Subtype.value).toBe('TrueType');
        expect(back.fontDict.entries.Encoding.value).toBe('WinAnsiEncoding');
        expect(back.descriptor.entries.FontFile2).toBeTruthy();

        const subFont = fontsMod.read(back.program);
        expect(subFont.numGlyphs).toBe(expectedGlyphs);
        for (const cp of cps) {
            expect(subFont.glyphIndexForCodePoint(cp, { strict: true })).toBeGreaterThan(0);
        }
    });

    test('the written /ToUnicode maps the emitted codes back to the source text', () => {
        const emb = rt.resolve('pdfFontEmbed');
        const cmapMod = rt.resolve('cmapToUnicode');
        const TEXT = textFrom(regular, 'Hello embed');
        const cps = [...new Set([...TEXT].map(c => c.codePointAt(0)))].sort((a, b) => a - b);
        const e = emb.embedSimple(regular, cps);

        const bytes = assemble(rt, e, TEXT, false);
        const back = readBackFont(rt, bytes, false);
        const toU = cmapMod.parseToUnicode(latin1(back.toUnicodeBytes));

        let out = '';
        for (const code of e.encode(TEXT)) out += toU.get(code) ?? '�';
        expect(out).toBe(TEXT);
        expect(latin1(back.contents)).toContain('Tj');

        // One-byte codespace, 2-hex-digit source codes (ISO 32000-2 §9.10.3).
        const cmapText = latin1(back.toUnicodeBytes);
        expect(cmapText).toContain('begincodespacerange\n<00> <FF>');
        expect(cmapText).not.toContain('<0000> <FFFF>');
        const sources = cmapText.split('\n').filter(l => /^<[0-9A-F]+>/.test(l)
            && !l.startsWith('<00> <FF>'));
        expect(sources.length).toBeGreaterThan(0);
        for (const l of sources) expect(l).toMatch(/^<[0-9A-F]{2}>/);
    });
});

describe('round-trip — hand-assembled document, composite route', () => {
    test('writes, reads back, FontFile2 re-parses and /ToUnicode round-trips', () => {
        const emb = rt.resolve('pdfFontEmbed');
        const fontsMod = rt.resolve('fonts');
        const subsetMod = rt.resolve('embedSubsetForPdf');
        const cmapMod = rt.resolve('cmapToUnicode');

        const extra = supported(regular, UNICODE_CANDIDATES);
        expect(extra.length).toBeGreaterThan(0);
        const TEXT = textFrom(regular, 'Uni ') + extra.map(cp => String.fromCodePoint(cp)).join('');
        const cps = [...new Set([...TEXT].map(c => c.codePointAt(0)))].sort((a, b) => a - b);
        const e = emb.embedCid(regular, cps);
        const expectedGlyphs = subsetMod.subsetForPdf(regular, e.codePoints, { cid: true }).widths.length;

        const bytes = assemble(rt, e, TEXT, true);
        const back = readBackFont(rt, bytes, true);

        expect(back.fontDict.entries.Subtype.value).toBe('Type0');
        expect(back.fontDict.entries.Encoding.value).toBe('Identity-H');
        expect(back.holder.entries.Subtype.value).toBe('CIDFontType2');
        expect(back.holder.entries.CIDToGIDMap.value).toBe('Identity');

        const subFont = fontsMod.read(back.program);
        expect(subFont.numGlyphs).toBe(expectedGlyphs);

        const toU = cmapMod.parseToUnicode(latin1(back.toUnicodeBytes));
        const codes = e.encode(TEXT);
        expect(e.encode.missing).toBe(0);
        let out = '';
        for (let i = 0; i < codes.length; i += 2) {
            out += toU.get((codes[i] << 8) | codes[i + 1]) ?? '�';
        }
        expect(out).toBe(TEXT);
        expect(latin1(back.toUnicodeBytes)).toContain('<0000> <FFFF>');
    });
});
