// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `builder({ pdfUA, lang })`: a document claiming PDF/UA-1 or
 * PDF/UA-2 carries MarkInfo, its language, DisplayDocTitle, an XMP packet
 * with `pdfuaid` and `dc:title`, the part's version and a trailer `/ID`;
 * a missing language or Title, a font without a program, or a claim with
 * PDF/A, is refused.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '../main.js';

const rt = new ModuleRuntime();
// T30 (g2), D53: pdfBuilder declares fonts' Standard 14 lookups, so the
// runtime takes the README's composition, pkg_require included.
for (const m of [...fw_require, ...pkg_require, ...modules]) rt.register(m);
const pdf = rt.resolve('pdf');
const { builder } = rt.resolve('pdfBuilder');
const { packet } = rt.resolve('pdfXmp');
const { ContractError } = rt.resolve('pdfErrors');
const dec = new TextDecoder();
const latin1 = new TextDecoder('latin1');
const thrown = (fn) => { try { fn(); } catch (e) { return e; } return null; };

/** The catalog entries of `bytes`, resolved, and the Metadata text. */
function catalogOf(bytes) {
    const doc = pdf.read(bytes);
    const r = doc._raw.resolve;
    const e = doc.catalog.raw.entries;
    const get = (v) => (v && v.type === 'ref' ? r(v) : v);
    const meta = get(e.Metadata);
    return { doc, e, get, xmp: meta ? dec.decode(meta.raw) : null };
}

describe('pdfXmp.packet pdfuaid', () => {
    test('part and rev in the PDF/UA identification namespace', () => {
        const text = dec.decode(packet({ pdfuaid: { part: 2, rev: 2024 }, info: { Title: 'T' } }));
        expect(text).toContain('xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/"');
        expect(text).toContain('<pdfuaid:part>2</pdfuaid:part><pdfuaid:rev>2024</pdfuaid:rev>');
        expect(dec.decode(packet({ pdfuaid: { part: 1 } }))).toContain('<pdfuaid:part>1</pdfuaid:part>');
        expect(dec.decode(packet({ info: { Title: 'T' } }))).not.toContain('pdfuaid:part');
    });
});

describe('builder({ pdfUA, lang })', () => {
    test('each part: MarkInfo, Lang, DisplayDocTitle, the XMP claim and title, the version, an /ID', () => {
        for (const [pdfUA, header, claim] of [[1, '%PDF-1.7', '<pdfuaid:part>1</pdfuaid:part>'], [2, '%PDF-2.0', '<pdfuaid:part>2</pdfuaid:part><pdfuaid:rev>2024</pdfuaid:rev>']]) {
            const bytes = builder({ pdfUA, lang: 'en-GB' }).addMetadata({ Title: 'An accessible page' }).addPage().build();
            const { doc, e, get, xmp } = catalogOf(bytes);
            expect(latin1.decode(bytes.slice(0, 8))).toBe(header);
            expect(get(get(e.MarkInfo).entries.Marked).value).toBe(true);
            expect(latin1.decode(get(e.Lang).value)).toBe('en-GB');
            expect(get(get(e.ViewerPreferences).entries.DisplayDocTitle).value).toBe(true);
            expect(xmp).toContain(claim);
            expect(xmp).toContain('<dc:title><rdf:Alt><rdf:li xml:lang="x-default">An accessible page</rdf:li></rdf:Alt></dc:title>');
            expect(doc.trailer.id).toHaveLength(2);
            expect(doc.trailer.info).toBeDefined();
        }
    });

    test('a bad part, no language, no Title, a version against the part, or PDF/A with it are refused', () => {
        const code = (fn) => { const e = thrown(fn); expect(e).toBeInstanceOf(ContractError); return e.code; };
        for (const bad of [0, 3, '1', true]) expect(code(() => builder({ pdfUA: bad, lang: 'en' }))).toBe('pdf/builder/bad-pdfua');
        for (const lang of [undefined, '', 7]) expect(code(() => builder({ pdfUA: 1, lang }))).toBe('pdf/builder/pdfua-lang');
        expect(code(() => builder({ pdfUA: 1, lang: 'en' }).addPage().build())).toBe('pdf/builder/pdfua-title');
        expect(code(() => builder({ pdfUA: 1, lang: 'en' }).setVersion('2.0'))).toBe('pdf/builder/pdfua-version');
        expect(code(() => builder({ pdfUA: 2, lang: 'en' }).setVersion('1.7'))).toBe('pdf/builder/pdfua-version');
        expect(code(() => builder({ pdfUA: 1, lang: 'en', pdfA: '4' }))).toBe('pdf/builder/pdfua-with-pdfa');
    });

    test('a font without an embedded program is refused, naming the claim', () => {
        const e = thrown(() => builder({ pdfUA: 2, lang: 'en' }).addMetadata({ Title: 'T' }).addPage()
            .addFont({ name: 'F1', baseFont: 'Helvetica' }).addContent('BT /F1 12 Tf (x) Tj ET').build());
        expect(e).toBeInstanceOf(ContractError);
        expect(e.code).toBe('pdf/builder/pdfa-font-not-embedded');
        expect(e.message).toContain('PDF/UA-2');
        expect(e.context.fonts).toEqual(['Helvetica']);
    });

    test('without pdfUA nothing changes', () => {
        const plain = builder().addMetadata({ Title: 'T' }).addPage().build();
        expect(builder({}).addMetadata({ Title: 'T' }).addPage().build()).toEqual(plain);
        expect(catalogOf(plain).e.MarkInfo).toBeUndefined();
    });
});
