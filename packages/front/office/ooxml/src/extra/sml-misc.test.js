// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for smlMisc — generic SpreadsheetML element parse/render
 * (no namespace prefix on most elements).
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { smlMisc } from './sml-misc.js';

describe('smlMisc module', () => {
    test('module metadata', () => {
        expect(smlMisc.name).toBe('smlMisc');
        expect(smlMisc.dependencies).toEqual(['xml']);
        expect(typeof smlMisc.factory).toBe('function');
    });

    let xml, m;
    beforeEach(() => {
        xml = ooxmlXml.factory();
        m = smlMisc.factory(xml);
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
                const el = xml.el(q, { foo: 'bar' });
                const parsed = m.parseElement(el);
                expect(parsed).not.toBeNull();
                const local = q.includes(':') ? q.split(':')[1] : q;
                expect(parsed.kind).toBe(local);
                expect(parsed.attrs.foo).toBe('bar');
                const back = m.renderElement(parsed);
                expect(back.name).toBe(q);
                expect(back.attrs.foo).toBe('bar');
            }
        });

        test('returns null on null input', () => {
            expect(m.parseElement(null)).toBeNull();
            expect(m.renderElement(null)).toBeNull();
        });
    });
});
