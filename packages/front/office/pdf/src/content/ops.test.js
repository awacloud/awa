// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfContentOps } from './ops.js';

const { OPS, OP_NAMES, lookupOp, isOp } = pdfContentOps.factory();

describe('OPS table', () => {
    test('has at least 60 operators', () => {
        expect(Object.keys(OPS).length).toBeGreaterThanOrEqual(60);
    });

    test('covers core path / paint / text / color groups', () => {
        for (const op of ['m', 'l', 'c', 'h', 're', 'S', 'f', 'B',
                          'BT', 'ET', 'Tj', 'TJ', 'Tf', 'Td',
                          'rg', 'RG', 'k', 'K', 'g', 'G',
                          'q', 'Q', 'cm', 'Do', 'sh', 'BMC', 'EMC',
                          'BI', 'ID', 'EI']) {
            expect(OPS[op]).toBeDefined();
            expect(OPS[op].op).toBe(op);
        }
    });

    test('every entry has op + category + arity + desc', () => {
        for (const k of Object.keys(OPS)) {
            const e = OPS[k];
            expect(e.op).toBe(k);
            expect(typeof e.category).toBe('string');
            expect(['number', 'string']).toContain(typeof e.arity);
            expect(typeof e.desc).toBe('string');
        }
    });

    test('OPS is frozen', () => {
        // Strict mode TypeError on assignment to a frozen object.
        let threw = false;
        try { OPS.zzz = { op: 'zzz' }; } catch (_) { threw = true; }
        expect(threw || OPS.zzz === undefined).toBe(true);
    });

    test('OP_NAMES is sorted alphabetically', () => {
        const sorted = OP_NAMES.slice().sort();
        expect(OP_NAMES).toEqual(sorted);
    });
});

describe('lookupOp / isOp', () => {
    test('lookupOp returns the record', () => {
        expect(lookupOp('m').arity).toBe(2);
        expect(lookupOp('zzz')).toBeUndefined();
    });

    test('isOp', () => {
        expect(isOp('Tj')).toBe(true);
        expect(isOp('UNKNOWN')).toBe(false);
    });
});

describe('pdfContentOps module', () => {
    test('module shape', () => {
        expect(pdfContentOps.name).toBe('pdfContentOps');
        expect(pdfContentOps.dependencies).toEqual([]);
        expect(pdfContentOps.factory.toString()).toContain('function');
        const m = pdfContentOps.factory();
        expect(m.OPS).toEqual(OPS);
        expect(typeof m.lookupOp).toBe('function');
        expect(typeof m.isOp).toBe('function');
    });
});
