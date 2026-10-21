// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `detect()` on the repository's real files and on minimal
 * signatures: magic bytes first, the file name only as a tie-break.
 *
 * @module viewer/core/detect.test
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { detect, extensionOf, FAMILY } from './detect.js';

const repo = (p) => new URL(`../../../../../${p}`, import.meta.url);
const corpus = (p) => new Uint8Array(readFileSync(repo(`packages/front/office/oconv/tests/_fixtures/corpus/${p}`)));
const fixture = (p) => new Uint8Array(readFileSync(new URL(`../../tests/fixtures/${p}`, import.meta.url)));
const enc = (s) => new TextEncoder().encode(s);

describe('detect — real files', () => {
    const cases = [
        ['docx/docx-structured.docx', 'docx'], ['xlsx/poi-simple-multicell.xlsx', 'xlsx'],
        ['pptx/poi-sampleshow.pptx', 'pptx'], ['odt/odt-structured.odt', 'odt'],
        ['ods/ods-structured.ods', 'ods'], ['odp/odp-structured.odp', 'odp'],
        ['pdf-tagged/tagged-structured.pdf', 'pdf']
    ];
    for (const [file, format] of cases) {
        test(`${file} → ${format}`, () => {
            expect(detect(corpus(file), 'no-extension').format).toBe(format);
        });
    }
    test('the generated ODF fixtures carry their mimetype entry', () => {
        expect(detect(fixture('rich.odt')).format).toBe('odt');
        expect(detect(fixture('rich.ods')).format).toBe('ods');
        expect(detect(fixture('rich.odp')).format).toBe('odp');
        expect(detect(fixture('rich.xlsx')).format).toBe('xlsx');
    });
});

describe('detect — signatures and tie-breaks', () => {
    test('a PDF header found after leading junk', () => {
        expect(detect(enc('\n\n%PDF-1.7\n'), 'x.bin')).toEqual({ format: 'pdf', family: 'portable' });
    });
    test('an MS-CFB container is a legacy binary, named by its extension', () => {
        const cfb = new Uint8Array(1024);
        cfb.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
        expect(detect(cfb, 'old.doc').format).toBe('legacy-doc');
        expect(detect(cfb, 'old.XLS').format).toBe('legacy-xls');
        expect(detect(cfb, 'old.ppt').format).toBe('legacy-ppt');
        expect(detect(cfb, 'unknown').format).toBe('legacy');
        expect(FAMILY['legacy-doc']).toBe('legacy');
    });
    test('a CFB with an EncryptionInfo stream is a protected OOXML file', () => {
        const cfb = new Uint8Array(2048);
        cfb.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
        const name = 'EncryptionInfo';
        for (let i = 0; i < name.length; i++) cfb[1024 + i * 2] = name.charCodeAt(i);
        expect(detect(cfb, 'secret.docx')).toEqual({ format: 'encrypted', family: 'encrypted' });
    });
    test('UTF-8 text: Markdown by extension, plain text otherwise', () => {
        expect(detect(enc('# Title\n\nbody é'), 'notes.md').format).toBe('md');
        expect(detect(enc('# Title'), 'notes.markdown').format).toBe('md');
        expect(detect(enc('a,b\n1,2'), 'data.csv').format).toBe('text');
    });
    test('8-bit legacy text is text when its extension says so', () => {
        const cp1252 = new Uint8Array([0x52, 0xe9, 0x67, 0x69, 0x6f, 0x6e, 0x3b, 0x80]);   // "Région;€"
        expect(detect(cp1252, 'ventes.csv').format).toBe('text');
        expect(detect(cp1252, 'image.bin').format).toBe('unknown');
    });
    test('UTF-16 with a BOM is text', () => {
        expect(detect(new Uint8Array([0xff, 0xfe, 0x41, 0x00]), 'a.txt').format).toBe('text');
    });
    test('binary data is unknown', () => {
        expect(detect(new Uint8Array([0x00, 0x01, 0x02, 0xff, 0x00]), 'a.txt')).toEqual({ format: 'unknown', family: 'unknown' });
    });
    test('a ZIP that is neither OOXML nor ODF is unknown', () => {
        const zip = new Uint8Array(64);
        zip.set([0x50, 0x4b, 0x03, 0x04]);
        expect(detect(zip, 'archive.zip').format).toBe('unknown');
    });
    test('extensionOf', () => {
        expect(extensionOf('C:\\docs\\Report.DOCX')).toBe('docx');
        expect(extensionOf('.hidden')).toBe('');
        expect(extensionOf('noext')).toBe('');
    });
});
