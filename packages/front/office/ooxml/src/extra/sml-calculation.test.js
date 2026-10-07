// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests for smlCalculation — calc chain + calcPr.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { smlCalculation } from './sml-calculation.js';

describe('smlCalculation module', () => {
    test('module metadata', () => {
        expect(smlCalculation.name).toBe('smlCalculation');
        expect(smlCalculation.dependencies).toEqual(['xml']);
        expect(typeof smlCalculation.factory).toBe('function');
    });

    let xml, m;
    beforeEach(() => {
        xml = ooxmlXml.factory();
        m = smlCalculation.factory(xml);
    });

    describe('factory', () => {
        test('exposes calcChain + calcPr API', () => {
            expect(typeof m.parseCalcChain).toBe('function');
            expect(typeof m.renderCalcChain).toBe('function');
            expect(typeof m.parseCalcPr).toBe('function');
            expect(typeof m.renderCalcPr).toBe('function');
        });
    });

    describe('parseCalcChain / renderCalcChain', () => {
        test('roundtrip multiple cells', () => {
            const cc = { attrs: {}, cells: [
                { r: 'A1', i: '1', s: '1', l: '1' },
                { r: 'B2', i: '1', a: '1' },
                { r: 'C3', t: '1' }
            ]};
            const text = m.renderCalcChain(cc);
            expect(text).toContain('calcChain');
            expect(text).toContain('A1');
            const back = m.parseCalcChain(text);
            expect(back.cells).toHaveLength(3);
            expect(back.cells[0].r).toBe('A1');
            expect(back.cells[0].s).toBe('1');
            expect(back.cells[1].a).toBe('1');
            expect(back.cells[2].t).toBe('1');
        });

        test('empty calc chain', () => {
            const back = m.parseCalcChain(m.renderCalcChain({ cells: [] }));
            expect(back.cells).toHaveLength(0);
        });
    });

    describe('parseCalcPr / renderCalcPr', () => {
        test('roundtrip via element node', () => {
            const cp = { calcId: '125725', calcMode: 'auto', iterate: 'true',
                          iterateCount: '100', concurrentCalc: 'true' };
            const el = m.renderCalcPr(cp);
            expect(el.name).toBe('calcPr');
            const back = m.parseCalcPr(el);
            expect(back.calcId).toBe('125725');
            expect(back.calcMode).toBe('auto');
            expect(back.iterate).toBe('true');
            expect(back.iterateCount).toBe('100');
        });

        test('parseCalcPr accepts attrs bag directly', () => {
            const back = m.parseCalcPr({ calcId: '1', refMode: 'A1' });
            expect(back.calcId).toBe('1');
            expect(back.refMode).toBe('A1');
        });

        test('drops unknown attrs', () => {
            const back = m.parseCalcPr({ calcId: '1', notAKnownOne: 'x' });
            expect(back.calcId).toBe('1');
            expect(back.notAKnownOne).toBeUndefined();
        });
    });
});
