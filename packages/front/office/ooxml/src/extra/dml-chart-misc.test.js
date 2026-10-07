// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for dmlChartMisc — generic c: element parse/render.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { dmlChartMisc } from './dml-chart-misc.js';

describe('dmlChartMisc module', () => {
    test('module metadata', () => {
        expect(dmlChartMisc.name).toBe('dmlChartMisc');
        expect(dmlChartMisc.dependencies).toEqual(['xml']);
        expect(typeof dmlChartMisc.factory).toBe('function');
    });

    let xml, m;
    beforeEach(() => {
        xml = ooxmlXml.factory();
        m = dmlChartMisc.factory(xml);
    });

    describe('factory', () => {
        test('exposes parseElement / renderElement / ELEMENTS', () => {
            expect(typeof m.parseElement).toBe('function');
            expect(typeof m.renderElement).toBe('function');
            expect(Array.isArray(m.ELEMENTS)).toBe(true);
            expect(m.ELEMENTS.length).toBeGreaterThan(50);
            for (const q of m.ELEMENTS) expect(q.startsWith('c:')).toBe(true);
        });
    });

    describe('parseElement / renderElement', () => {
        test('roundtrip every listed element with attrs', () => {
            for (const q of m.ELEMENTS) {
                const el = xml.el(q, { val: '1', foo: 'x' });
                const parsed = m.parseElement(el);
                expect(parsed).not.toBeNull();
                expect(parsed.kind).toBe(q.split(':')[1]);
                expect(parsed.attrs.val).toBe('1');
                const back = m.renderElement(parsed);
                expect(back.name).toBe(q);
                expect(back.attrs.foo).toBe('x');
            }
        });

        test('returns null on non-element', () => {
            expect(m.parseElement(null)).toBeNull();
            expect(m.parseElement({ type: 'text', value: 'x' })).toBeNull();
        });

        test('returns null for unknown tag', () => {
            const back = m.parseElement(xml.el('c:zzNotKnown', {}));
            expect(back).toBeNull();
        });
    });
});
