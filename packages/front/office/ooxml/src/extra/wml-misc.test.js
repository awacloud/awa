// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for wmlMisc — generic w: element parse/render top-up.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { wmlMisc } from './wml-misc.js';

describe('wmlMisc module', () => {
    test('module metadata', () => {
        expect(wmlMisc.name).toBe('wmlMisc');
        expect(wmlMisc.dependencies).toEqual(['xml']);
        expect(typeof wmlMisc.factory).toBe('function');
    });

    let xml, m;
    beforeEach(() => {
        xml = ooxmlXml.factory();
        m = wmlMisc.factory(xml);
    });

    describe('factory', () => {
        test('exposes parseElement / renderElement / ELEMENTS', () => {
            expect(typeof m.parseElement).toBe('function');
            expect(typeof m.renderElement).toBe('function');
            expect(Array.isArray(m.ELEMENTS)).toBe(true);
            expect(m.ELEMENTS.length).toBeGreaterThan(50);
            for (const q of m.ELEMENTS) expect(q.startsWith('w:')).toBe(true);
        });
    });

    describe('parseElement / renderElement', () => {
        test('roundtrip every listed element with attrs', () => {
            for (const q of m.ELEMENTS) {
                const el = xml.el(q, { val: '1' });
                const parsed = m.parseElement(el);
                expect(parsed).not.toBeNull();
                expect(parsed.kind).toBe(q.split(':')[1]);
                expect(parsed.attrs.val).toBe('1');
                const back = m.renderElement(parsed);
                expect(back.name).toBe(q);
                expect(back.attrs.val).toBe('1');
            }
        });

        test('returns null on null / unknown', () => {
            expect(m.parseElement(null)).toBeNull();
            expect(m.parseElement(xml.el('w:zzNotKnown', {}))).toBeNull();
            expect(m.renderElement(null)).toBeNull();
            expect(m.renderElement({ kind: 'zzNotKnown' })).toBeNull();
        });
    });
});
