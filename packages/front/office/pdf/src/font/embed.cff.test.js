// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview A font with CFF outlines embedded as `FontFile3 /OpenType`
 * (office-coverage-3 T76, D55): under `/Type1` for a simple font (glyph
 * names through `/Differences`, ISO 32000-2 §9.6.5.2, §9.9.1) and
 * `/CIDFontType0` for a composite one (§9.7.4.2: a CID-keyed program by its
 * CIDs, another by CID = glyph id). Source Sans 3 (name-keyed CFF) and
 * Source Sans 3 VF (CFF2) are fonts' vendored OFL faces; the CID-keyed
 * program is built here and swapped into Source Sans 3.
 *
 * @module pdf/font/embed.cff.test
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { extras } from '../main.js';
import { pdfRuntime, LIBERATION_SANS } from '../../tests/_helpers/arlington-write.js';

const rt = pdfRuntime();
for (const m of extras) { try { rt.register(m); } catch { /* registered */ } }
const fonts = rt.resolve('fonts');
const embed = rt.resolve('pdfFontEmbed');
const { builder } = rt.resolve('pdfBuilder');
const pdf = rt.resolve('pdf');
const { encodeDict, writeIndex } = rt.resolve('embedCffSubset');
const { subsetForPdf } = rt.resolve('embedSubsetForPdf');
const SOURCE = new URL('../../../fonts/tests/_fixtures/ofl-faces/vendor/source-sans/', import.meta.url);
const read = (f) => fonts.read(new Uint8Array(readFileSync(new URL(f, SOURCE))));
const sans = read('SourceSans3-Regular.otf');
const sansVf = read('SourceSans3VF-Upright.otf');
const liberation = fonts.read(new Uint8Array(readFileSync(LIBERATION_SANS)));
const cps = (s) => [...new Set([...s].map((c) => c.codePointAt(0)))];
const nameOf = (v) => (v && v.type === 'name' ? v.value : v);
const codes = (bytes) => { const o = []; for (let i = 0; i + 1 < bytes.length; i += 2) o.push((bytes[i] << 8) | bytes[i + 1]); return o; };
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** A CID-keyed CFF of `n` glyphs, glyph k at CID 1000 + k (k > 0), one FD. */
function cidKeyedCff(n) {
    const cs = (...p) => Uint8Array.from(p.flat());
    const cat = (parts) => { const o = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let at = 0; for (const p of parts) { o.set(p, at); at += p.length; } return o; };
    const FIXED = new Set([15, 17, 18, 0x0C24, 0x0C25]);
    const priv = encodeDict([[20, [500]]]);
    const charset = cs([2], [(1001 >> 8) & 0xFF, 1001 & 0xFF], [((n - 2) >> 8) & 0xFF, (n - 2) & 0xFF]);
    const fdSelect = cs([3], [0, 1], [0, 0], [0], [(n >> 8) & 0xFF, n & 0xFF]);
    const charStrings = writeIndex(Array.from({ length: n }, () => cs([14])));
    const strings = writeIndex([new TextEncoder().encode('Adobe'), new TextEncoder().encode('Identity')]);
    const fdArrayAt = (p) => writeIndex([encodeDict([[18, [priv.length, p]]], FIXED)]);
    const topOf = (o) => encodeDict([[0x0C1E, [391, 392, 0]], [0x0C22, [n + 1000]], [15, [o.charset]], [17, [o.cs]], [0x0C24, [o.fd]], [0x0C25, [o.sel]]], FIXED);
    const head = cs([1, 0, 4, 4]);
    const name = writeIndex([new TextEncoder().encode('Cid')]);
    const gsubr = writeIndex([]);
    const fixedLen = head.length + name.length + writeIndex([topOf({ charset: 0, cs: 0, fd: 0, sel: 0 })]).length + strings.length + gsubr.length;
    const o = { charset: fixedLen };
    o.sel = o.charset + charset.length;
    o.cs = o.sel + fdSelect.length;
    o.fd = o.cs + charStrings.length;
    const privAt = o.fd + fdArrayAt(0).length;
    return cat([head, name, writeIndex([topOf(o)]), strings, gsubr, charset, fdSelect, charStrings, fdArrayAt(privAt), priv]);
}
const numGlyphs = sans.maxp?.numGlyphs ?? sans.numGlyphs;
const cidSans = { ...sans, rawSfnt: { ...sans.rawSfnt, tables: { ...sans.rawSfnt.tables, 'CFF ': { bytes: cidKeyedCff(numGlyphs) } } } };

/** The page text of `bytes` decoded through pdf's decoder, font by font, from the strings `shows` gives. */
function decodedText(bytes, shows) {
    const doc = pdf.read(bytes);
    const resolve = doc._raw.resolve;
    const deref = (v) => (v && v.type === 'ref' ? resolve(v) : v);
    const res = rt.resolve('pdfResources').resolvePageResources(doc.pages[0].raw, resolve);
    const dec = rt.resolve('pdfFontDecoder');
    return shows.map(([font, str]) => dec.decodeShow(dec.buildDecoder(deref(res.Font[font]), resolve), str).text);
}

describe('pdfFontEmbed — a CFF font as FontFile3 /OpenType (T76)', () => {
    test('embedSimple: /Type1, its glyph names through /Differences over WinAnsi', () => {
        const e = embed.embedSimple(sans, cps('Hello'));
        expect(nameOf(e.fontDict.entries.Subtype)).toBe('Type1');
        expect(e.subtype).toBe('Type1');
        expect(e.fontFileKey).toBe('FontFile3');
        const enc = e.fontDict.entries.Encoding;
        expect(nameOf(enc.entries.BaseEncoding)).toBe('WinAnsiEncoding');
        expect(enc.entries.Differences.items.map((x) => x.value)).toEqual([72, 'H', 101, 'e', 108, 'l', 111, 'o']);
        expect([...e.encode('Hello')]).toEqual([72, 101, 108, 108, 111]);
    });

    test('embedCid: /CIDFontType0, no /CIDToGIDMap, the codes the new glyph ids', () => {
        const e = embed.embedCid(sans, cps('Hello'));
        expect(nameOf(e.cidFontDict.entries.Subtype)).toBe('CIDFontType0');
        expect(e.cidFontDict.entries.CIDToGIDMap).toBeUndefined();
        expect(e.fontFileKey).toBe('FontFile3');
        expect(codes(e.encode('Hello'))).toEqual([1, 2, 3, 3, 4]);
    });

    test('a CFF2 face through embedCid: /CIDFontType0 too', () => {
        const e = embed.embedCid(sansVf, cps('Hello'));
        expect(nameOf(e.cidFontDict.entries.Subtype)).toBe('CIDFontType0');
        expect(codes(e.encode('Hello'))).toEqual([1, 2, 3, 3, 4]);
    });

    test('a CID-keyed program: codes, /W and /ToUnicode keyed by its CIDs', () => {
        const e = embed.embedCid(cidSans, cps('Hi'));
        const want = [...'Hi'].map((c) => 1000 + sans.glyphIndexForCodePoint(c.codePointAt(0)));
        expect(codes(e.encode('Hi'))).toEqual(want);
        const keyed = new Set();
        const items = e.cidFontDict.entries.W.items;
        for (let i = 0; i + 1 < items.length; i += 2) items[i + 1].items.forEach((_, k) => keyed.add(items[i].value + k));
        for (const c of want) expect(keyed.has(c)).toBe(true);
        const tou = new TextDecoder().decode(e.toUnicodeStream.raw);
        for (const c of want) expect(tou.toUpperCase()).toContain(`<${c.toString(16).toUpperCase().padStart(4, '0')}>`);
    });

    test('a CID-keyed program has no simple form: embedSimple refuses it by name', () => {
        let code = null;
        try { embed.embedSimple(sansVf, cps('Hello')); } catch (e) { code = e.code; }
        expect(code).toBe('pdf/embed/cid-keyed-simple');
    });

    test('a TrueType face is embedded as before, its program byte for byte', () => {
        const e = embed.embedSimple(liberation, cps('Hello'));
        expect(nameOf(e.fontDict.entries.Subtype)).toBe('TrueType');
        expect(e.fontFileKey).toBe('FontFile2');
        expect(e.fontFile).toEqual(subsetForPdf(liberation, cps('Hello')).subsetBytes);
        const c = embed.embedCid(liberation, cps('Hello'));
        expect(nameOf(c.cidFontDict.entries.Subtype)).toBe('CIDFontType2');
        expect(nameOf(c.cidFontDict.entries.CIDToGIDMap)).toBe('Identity');
    });

    test('written, read back and decoded as written; FontFile3 without /Length1', () => {
        const s = embed.embedSimple(sans, cps('Hello'));
        const c = embed.embedCid(cidSans, cps('Hi'));
        const bytes = builder().addPage()
            .addFont({ name: 'F1', embedded: s }).addFont({ name: 'F2', embedded: c })
            .addContent(`BT /F1 12 Tf 72 700 Td <${hex(s.encode('Hello'))}> Tj /F2 12 Tf 0 -16 Td <${hex(c.encode('Hi'))}> Tj ET`)
            .build();
        expect(decodedText(bytes, [['F1', s.encode('Hello')], ['F2', c.encode('Hi')]])).toEqual(['Hello', 'Hi']);
        const doc = pdf.read(bytes);
        const resolve = doc._raw.resolve;
        const deref = (v) => (v && v.type === 'ref' ? resolve(v) : v);
        const res = rt.resolve('pdfResources').resolvePageResources(doc.pages[0].raw, resolve);
        const fd = deref(deref(res.Font.F1).entries.FontDescriptor);
        const ff3 = deref(fd.entries.FontFile3);
        expect(nameOf(ff3.dict.entries.Subtype)).toBe('OpenType');
        expect(ff3.dict.entries.Length1).toBeUndefined();
    });
});
