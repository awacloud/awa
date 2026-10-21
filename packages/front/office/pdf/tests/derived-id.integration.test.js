// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The `/ID` a PDF 2.0 file requires (ISO 32000-2 Table 15),
 * through the package's public writers: `pdfBuilder` without `setId`,
 * `pdf.write` of a read model that has none, and the committed standalone
 * bundle. When the caller gives no `/ID`, `pdfWriter` derives one from the
 * bytes written before the trailer, so the output stays reproducible.
 *
 * @module pdf/tests/derived-id.integration
 */

import { describe, test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '../src/main.js';
import { pdfErrors } from '../src/errors.js';
import { pdfSerializer } from '../src/syntax/serializer.js';
import { pdfWriter } from '../src/document/writer.js';
import { pdfBundled } from '../dist/standalone/pdf.js';

const rt = new ModuleRuntime();
for (const m of [...fw_require, ...pkg_require, ...modules]) rt.register(m);
const pdf = rt.resolve('pdf');
const { builder } = rt.resolve('pdfBuilder');
const { obj } = rt.resolve('pdfParserObj');

const td = new TextDecoder('latin1');
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
/** The `/ID` the writer derives: the first 16 bytes of the SHA-256 of what precedes the trailer. */
const expectedId = (out) => hex(createHash('sha256').update(out.subarray(0, td.decode(out).lastIndexOf('trailer\n'))).digest().subarray(0, 16));

describe('a derived /ID in every PDF 2.0 file the writers emit', () => {
    test('pdfBuilder without setId', () => {
        const out = builder().addPage().build();
        const id = pdf.read(out).trailer.id;
        expect([hex(id[0]), hex(id[1])]).toEqual([expectedId(out), expectedId(out)]);
        expect(Array.from(builder().addPage().build())).toEqual(Array.from(out));
    });

    test('pdfBuilder with setId, or with a 1.x header, keeps what it wrote before', () => {
        const given = pdf.read(builder().addPage().setId('000102030405060708090a0b0c0d0e0f').build()).trailer.id;
        expect(hex(given[0])).toBe('000102030405060708090a0b0c0d0e0f');
        expect(td.decode(builder().setVersion('1.7').addPage().build())).not.toContain('/ID');
    });

    // a document written by a hand-wired writer, which derives nothing
    const plain = pdfWriter.factory(pdfErrors.factory(), pdfSerializer.factory(pdfErrors.factory())).writeDocument({
        indirects: [
            { num: 1, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(2, 0) }) },
            { num: 2, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([]), Count: obj.int(0) }) }
        ],
        root: { num: 1, gen: 0 }
    });

    test('pdf.write of a read model without /ID', () => {
        expect(pdf.read(plain).trailer.id).toBeFalsy();
        const out = pdf.write(pdf.read(plain));
        expect(hex(pdf.read(out).trailer.id[0])).toBe(expectedId(out));
    });

    test('the committed standalone bundle derives the same /ID', () => {
        const api = pdfBundled.factory();
        const viaBundle = api.write(api.read(plain));
        expect(hex(api.read(viaBundle).trailer.id[0])).toBe(expectedId(viaBundle));
        expect(Array.from(viaBundle)).toEqual(Array.from(pdf.write(pdf.read(plain))));
    });
});
