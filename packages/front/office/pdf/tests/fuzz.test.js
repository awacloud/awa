// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Fuzz / garbage-input safety. Confirms that malformed
 * inputs throw a typed `PdfError` rather than crashing or returning
 * partial state.
 */

import { describe, test, expect } from 'bun:test';
import { buildDocument, bootstrapPdf, getRuntime } from './_helpers/build.js';

const _pdfErrors = getRuntime().resolve('pdfErrors');
const { PdfError } = _pdfErrors;

const te = new TextEncoder();

function expectPdfError(fn) {
    let err;
    try { fn(); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(PdfError);
    expect(typeof err.code).toBe('string');
    expect(err.code.startsWith('pdf/')).toBe(true);
}

describe('fuzz — malformed input rejected with typed errors', () => {
    const api = bootstrapPdf();

    test('empty input', () => {
        expectPdfError(() => api.read(new Uint8Array(0)));
    });

    test('garbage input', () => {
        const garbage = new Uint8Array(256);
        for (let i = 0; i < garbage.length; i++) garbage[i] = (i * 31) & 0xFF;
        expectPdfError(() => api.read(garbage));
    });

    test('header only, no body', () => {
        expectPdfError(() => api.read(te.encode('%PDF-2.0\n')));
    });

    test('header + xref but no trailer', () => {
        const b = te.encode('%PDF-2.0\nxref\n0 0\nstartxref\n9\n%%EOF\n');
        expectPdfError(() => api.read(b));
    });

    test('truncated xref offset (points past EOF)', () => {
        const b = buildDocument({ pages: ['ok'] });
        // Rewrite the startxref offset to point past EOF
        const s = new TextDecoder('latin1').decode(b);
        const i = s.lastIndexOf('startxref\n');
        const tampered = te.encode(s.slice(0, i)
            + 'startxref\n999999\n%%EOF\n');
        expectPdfError(() => api.read(tampered));
    });

    test('non-Uint8Array rejected', () => {
        expectPdfError(() => api.read('not bytes'));
        expectPdfError(() => api.read(null));
        expectPdfError(() => api.read(undefined));
    });

    test('header is not %PDF-', () => {
        const b = te.encode('Not a PDF here at all, sorry. '.repeat(50));
        expectPdfError(() => api.read(b));
    });

    test('header followed by truncated dict', () => {
        const b = te.encode('%PDF-2.0\n1 0 obj\n<< /A 1 /B\nendobj\n');
        expectPdfError(() => api.read(b));
    });

    test('xref entry with bad flag', () => {
        const lines = [
            '%PDF-2.0\n',
            '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
            '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n',
            'xref\n0 3\n',
            '0000000000 65535 z \n',   // bad flag
            '0000000009 00000 n \n',
            '0000000055 00000 n \n',
            'trailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n',
        ];
        let off = 0;
        const body = lines.join('');
        const xrefIdx = body.indexOf('xref');
        const tail = body + xrefIdx + '\n%%EOF\n';
        expectPdfError(() => api.read(te.encode(tail)));
    });

    test('error message + context are inspectable', () => {
        try { api.read(new Uint8Array(0)); }
        catch (e) {
            expect(e.message.length).toBeGreaterThan(0);
            expect(e.name).toMatch(/Error$/);
        }
    });
});
