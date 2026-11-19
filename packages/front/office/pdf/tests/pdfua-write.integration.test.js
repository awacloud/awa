// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The tagged documents the `verapdf-pdfua` suite writes with
 * the builder (a paragraph; a heading, a list and a page-number artifact; a
 * figure and a table), each claiming PDF/UA-1 and PDF/UA-2, pass the
 * package's own PDF/UA linter. veraPDF's verdict on them is the suite's.
 */

import { describe, test, expect } from 'bun:test';
import { pdfRuntime, pdfuaDocuments } from './_helpers/arlington-write.js';
import { extras } from '../src/main.js';

const rt = pdfRuntime();
for (const m of extras) { try { rt.register(m); } catch { /* already registered */ } }
const pdf = rt.resolve('pdf');
const { validatePdfUa } = rt.resolve('pdfUaTagged');

describe('the builder\'s tagged documents', () => {
    for (const part of [1, 2]) {
        test(`PDF/UA-${part}: validatePdfUa reports no error`, () => {
            const docs = pdfuaDocuments(rt, part);
            expect(docs.map((d) => d.id)).toEqual(['builder-paragraph', 'builder-heading-list', 'builder-figure-table']);
            for (const d of docs) expect({ id: d.id, errors: validatePdfUa(pdf.read(d.bytes), { part }).errors }).toEqual({ id: d.id, errors: [] });
        });
    }
});
