// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for mathMisc — generic m: element parse/render.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { mathMisc } from './math-misc.js';

describe('mathMisc module', () => {
    test('module metadata', () => {
        expect(mathMisc.name).toBe('mathMisc');
        expect(mathMisc.dependencies).toEqual(['xml']);
        expect(typeof mathMisc.factory).toBe('function');
    });

    let xml, m;
    beforeEach(() => {
        xml = ooxmlXml.factory();
        m = mathMisc.factory(xml);
    });

    describe('factory', () => {
        test('exposes parseElement / renderElement / ELEMENTS', () => {
            expect(typeof m.parseElement).toBe('function');
            expect(typeof m.renderElement).toBe('function');
            expect(Array.isArray(m.ELEMENTS)).toBe(true);
            expect(m.ELEMENTS.length).toBeGreaterThan(0);
        });
    });

    describe('parseElement / renderElement', () => {
        test('roundtrip every listed element with attrs', () => {
            for (const q of m.ELEMENTS) {
                const el = xml.el(q, { x: '1' });
                const parsed = m.parseElement(el);
                expect(parsed).not.toBeNull();
                const local = q.includes(':') ? q.split(':')[1] : q;
                expect(parsed.kind).toBe(local);
                const back = m.renderElement(parsed);
                expect(back.name).toBe(q);
                expect(back.attrs.x).toBe('1');
            }
        });

        test('returns null on null input', () => {
            expect(m.parseElement(null)).toBeNull();
            expect(m.renderElement(null)).toBeNull();
        });
    });
});
