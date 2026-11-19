// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `builder({ pdfA })` and `pdfXmp.packet`: a document
 * claiming PDF/A-4 or PDF/A-2b carries an XMP packet with its `pdfaid`
 * and the Info fields; PDF/A-4 writes no trailer Info and version 2.0,
 * PDF/A-2b keeps the Info, writes version 1.7 and a trailer `/ID`.
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
const { writeDocument } = rt.resolve('pdfWriter');
const { packet } = rt.resolve('pdfXmp');
const { ContractError } = rt.resolve('pdfErrors');
const dec = new TextDecoder();
const latin1 = new TextDecoder('latin1');

const INFO = {
    Title: 'A & B <report>', Author: 'awa', Subject: 'PDF/A', Keywords: 'pdf, archive',
    Creator: 'pdfBuilder', Producer: '@awacloud/pdf',
    CreationDate: 'D:20261103120000Z', ModDate: "D:20261103130500+01'00'"
};

/** The catalog's Metadata stream of `bytes` (resolved), its text and the read document. */
function metadataOf(bytes) {
    const doc = pdf.read(bytes);
    const r = doc._raw.resolve;
    const ref = doc.catalog.raw.entries.Metadata;
    const stream = ref && r(ref);
    return { doc, stream, text: stream ? dec.decode(stream.raw) : null };
}

const thrown = (fn) => { try { fn(); } catch (e) { return e; } return null; };

describe('pdfXmp.packet', () => {
    test('pdfaid and every Info field, mapped and escaped, dates in ISO 8601', () => {
        const text = dec.decode(packet({ pdfaid: { part: 2, conformance: 'B' }, info: { ...INFO, Trapped: 'False' } }));
        expect(text.startsWith('<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>')).toBe(true);
        expect(text.trimEnd().endsWith('<?xpacket end="w"?>')).toBe(true);
        expect(text).toContain('<pdfaid:part>2</pdfaid:part>');
        expect(text).toContain('<pdfaid:conformance>B</pdfaid:conformance>');
        expect(text).not.toContain('pdfaid:rev');
        expect(text).toContain('<dc:title><rdf:Alt><rdf:li xml:lang="x-default">A &amp; B &lt;report&gt;</rdf:li></rdf:Alt></dc:title>');
        expect(text).toContain('<dc:creator><rdf:Seq><rdf:li>awa</rdf:li></rdf:Seq></dc:creator>');
        expect(text).toContain('<dc:description><rdf:Alt><rdf:li xml:lang="x-default">PDF/A</rdf:li></rdf:Alt></dc:description>');
        expect(text).toContain('<pdf:Keywords>pdf, archive</pdf:Keywords>');
        expect(text).toContain('<xmp:CreatorTool>pdfBuilder</xmp:CreatorTool>');
        expect(text).toContain('<pdf:Producer>@awacloud/pdf</pdf:Producer>');
        expect(text).toContain('<xmp:CreateDate>2026-11-03T12:00:00Z</xmp:CreateDate>');
        expect(text).toContain('<xmp:ModifyDate>2026-11-03T13:05:00+01:00</xmp:ModifyDate>');
        expect(text).not.toContain('Trapped');
        expect(dec.decode(packet({ pdfaid: { part: 4, rev: 2020 } }))).toContain('<pdfaid:part>4</pdfaid:part><pdfaid:rev>2020</pdfaid:rev>');
    });

    test('a date that is not a PDF date is a ContractError', () => {
        const e = thrown(() => packet({ info: { CreationDate: '2026-11-03' } }));
        expect(e).toBeInstanceOf(ContractError);
        expect(e.code).toBe('pdf/xmp/bad-date');
    });
});

describe('builder({ pdfA })', () => {
    test("'4': the XMP packet unfiltered in the catalog, no trailer Info, version 2.0", () => {
        const bytes = builder({ pdfA: '4' }).addPage().addMetadata(INFO).build();
        const { doc, stream, text } = metadataOf(bytes);
        expect(latin1.decode(bytes.slice(0, 8))).toBe('%PDF-2.0');
        expect(stream.dict.entries.Type.value).toBe('Metadata');
        expect(stream.dict.entries.Subtype.value).toBe('XML');
        expect(stream.dict.entries.Filter).toBeUndefined();
        expect(text).toContain('<pdfaid:part>4</pdfaid:part><pdfaid:rev>2020</pdfaid:rev>');
        expect(text).toContain('<xmp:CreatorTool>pdfBuilder</xmp:CreatorTool>');
        expect(doc.trailer.info).toBeUndefined();
        expect(doc.trailer.id).toBeDefined();
    });

    test("'2b': the Info kept and mirrored, version 1.7, a derived trailer /ID", () => {
        const bytes = builder({ pdfA: '2b' }).addPage().addMetadata(INFO).build();
        const { doc, text } = metadataOf(bytes);
        expect(latin1.decode(bytes.slice(0, 8))).toBe('%PDF-1.7');
        expect(text).toContain('<pdfaid:part>2</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance>');
        expect(text).toContain('<pdf:Producer>@awacloud/pdf</pdf:Producer>');
        const info = doc._raw.resolve({ type: 'ref', ...doc.trailer.info });
        expect(latin1.decode(info.entries.Producer.value)).toBe('@awacloud/pdf');
        expect(doc.trailer.id).toHaveLength(2);
        expect(builder({ pdfA: '2b' }).addPage().addMetadata(INFO).build()).toEqual(bytes);
    });

    test("'2b' keeps setId's /ID; setVersion must match the profile", () => {
        const bytes = builder({ pdfA: '2b' }).addPage().setVersion('1.7').setId('000102030405060708090a0b0c0d0e0f').build();
        expect(Array.from(pdf.read(bytes).trailer.id[0].slice(0, 3))).toEqual([0, 1, 2]);
        const e = thrown(() => builder({ pdfA: '2b' }).setVersion('2.0'));
        expect(e).toBeInstanceOf(ContractError);
        expect(e.code).toBe('pdf/builder/pdfa-version');
        expect(thrown(() => builder({ pdfA: '4' }).setVersion('1.7')).code).toBe('pdf/builder/pdfa-version');
    });

    test('another pdfA value is a ContractError; no option writes no Metadata', () => {
        for (const bad of ['1b', 4, '']) {
            const e = thrown(() => builder({ pdfA: bad }));
            expect(e).toBeInstanceOf(ContractError);
            expect(e.code).toBe('pdf/builder/bad-pdfa');
        }
        expect(metadataOf(builder().addPage().build()).stream).toBeUndefined();
        expect(builder({}).addPage().build()).toEqual(builder().addPage().build());
    });
});

describe('builder({ pdfA }) fonts', () => {
    test('a font without an embedded program is refused at build; without pdfA it builds', () => {
        const draw = (b) => b.addPage().addFont({ name: 'F1', baseFont: 'Helvetica', encoding: 'WinAnsiEncoding' })
            .addContent('BT /F1 12 Tf 72 700 Td (x) Tj ET');
        for (const pdfA of ['4', '2b']) {
            const e = thrown(() => draw(builder({ pdfA })).build());
            expect(e).toBeInstanceOf(ContractError);
            expect(e.code).toBe('pdf/builder/pdfa-font-not-embedded');
            expect(e.context.fonts).toEqual(['Helvetica']);
        }
        expect(draw(builder()).build()).toBeInstanceOf(Uint8Array);
    });
});

describe('writeDocument deriveId', () => {
    test('derives the /ID for a version other than 2.0 when asked', () => {
        const indirects = [
            { num: 1, gen: 0, value: { type: 'dict', entries: { Type: { type: 'name', value: 'Catalog' }, Pages: { type: 'ref', num: 2, gen: 0 } } } },
            { num: 2, gen: 0, value: { type: 'dict', entries: { Type: { type: 'name', value: 'Pages' }, Kids: { type: 'array', items: [] }, Count: { type: 'int', value: 0 } } } }
        ];
        const plain = latin1.decode(writeDocument({ indirects, root: { num: 1, gen: 0 }, version: '1.7' }));
        const derived = latin1.decode(writeDocument({ indirects, root: { num: 1, gen: 0 }, version: '1.7', deriveId: true }));
        expect(plain).not.toContain('/ID [');
        expect(derived).toContain('/ID [');
    });
});
