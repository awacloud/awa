// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { concat, xrefEntry, buildDocument, buildSyntax } from './build.js';

const td = new TextDecoder('latin1');

describe('concat', () => {
    test('joins mixed strings + Uint8Arrays', () => {
        const out = concat(['ab', new Uint8Array([0x63, 0x64]), 'ef']);
        expect(td.decode(out)).toBe('abcdef');
    });
});

describe('xrefEntry', () => {
    test('produces 20-byte canonical lines', () => {
        expect(xrefEntry(17, 0, false)).toBe('0000000017 00000 n \n');
        expect(xrefEntry(0, 65535, true)).toBe('0000000000 65535 f \n');
        expect(xrefEntry(17, 0, false).length).toBe(20);
    });
});

describe('buildDocument', () => {
    test('starts with %PDF-2.0 header', () => {
        const b = buildDocument();
        expect(td.decode(b.subarray(0, 8))).toBe('%PDF-2.0');
    });

    test('ends with %%EOF', () => {
        const b = buildDocument();
        const tail = td.decode(b.subarray(b.length - 6));
        expect(tail.endsWith('%%EOF\n')).toBe(true);
    });

    test('supports multi-page docs', () => {
        const b = buildDocument({ pages: ['a', 'b', 'c'] });
        const s = td.decode(b);
        expect(s).toContain('/Count 3');
    });
});

describe('buildSyntax', () => {
    test('is a single-page document', () => {
        const b = buildSyntax('content');
        expect(td.decode(b)).toContain('/Count 1');
    });
});
