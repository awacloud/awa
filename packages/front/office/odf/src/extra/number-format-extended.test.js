// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { numberFormatExtended } from './number-format-extended.js';

const xml = fwXml.factory();
const ext = numberFormatExtended.factory(xml);

describe('numberFormatExtended', () => {
    test('contract', () => {
        expect(numberFormatExtended.name).toBe('numberFormatExtended');
        expect(numberFormatExtended.dependencies).toEqual(['xml']);
    });
    test('parse/render number:number', () => {
        const el = xml.el('number:number', { 'number:decimal-places': '2' }, []);
        const p = ext.parseFragment(el);
        expect(p.type).toBe('number-fragment');
        expect(p.kind).toBe('number');
        expect(ext.renderFragment(p).attrs['number:decimal-places']).toBe('2');
    });
    test('parse number:text preserves text content', () => {
        const el = xml.el('number:text', {}, [xml.text(' € ')]);
        const p = ext.parseFragment(el);
        expect(p.text).toBe(' € ');
        const back = ext.renderFragment(p);
        expect(xml.textContent(back)).toBe(' € ');
    });
    test('hydrateStyle promotes parts', () => {
        const s = { parts: [xml.el('number:currency-symbol', {}, [xml.text('$')])] };
        ext.hydrateStyle(s);
        expect(s.parts[0].type).toBe('number-fragment');
        ext.dehydrateStyle(s);
        expect(s.parts[0].name).toBe('number:currency-symbol');
    });
});
