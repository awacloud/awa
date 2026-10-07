// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { numberFormats } from './numberFormats.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    return { xml, n: numberFormats.factory(xml) };
}

describe('numberFormats module', () => {
    test('factory shape', () => {
        expect(numberFormats.name).toBe('numberFormats');
        expect(numberFormats.dependencies).toEqual(['xml']);
        expect(typeof numberFormats.factory).toBe('function');
    });

    describe('parse / render', () => {
        test('date-style typed', () => {
            const { xml, n } = build();
            const el = xml.parse('<office:styles><number:date-style style:name="N1"><number:day number:style="long"/><number:text>/</number:text><number:month/><number:text>/</number:text><number:year/></number:date-style></office:styles>');
            const m = n.parse(el);
            expect(m.formats).toHaveLength(1);
            expect(m.formats[0].kind).toBe('date');
            expect(m.formats[0].name).toBe('N1');
            expect(m.formats[0].parts).toHaveLength(5);
            expect(m.formats[0].parts[0].type).toBe('day');
            expect(m.formats[0].parts[1].type).toBe('text');
            expect(m.formats[0].parts[1].text).toBe('/');
        });

        test('roundtrip number-style', () => {
            const { xml, n } = build();
            const m = {
                formats: [{
                    kind: 'number', name: 'N2',
                    parts: [
                        { type: 'number', attrs: { 'number:decimal-places': '2' } },
                        { type: 'text', attrs: {}, text: '%' }
                    ]
                }]
            };
            const wrapper = xml.el('office:styles', {}, n.render(m));
            const out = xml.serialize(wrapper);
            expect(out).toContain('<number:number-style style:name="N2">');
            expect(out).toContain('number:decimal-places="2"');
            expect(out).toContain('>%</number:text>');
        });

        test('handles all 7 kinds', () => {
            const { xml, n } = build();
            const m = {
                formats: [
                    { kind: 'date', name: 'D', parts: [] },
                    { kind: 'time', name: 'T', parts: [] },
                    { kind: 'number', name: 'NN', parts: [] },
                    { kind: 'currency', name: 'C', parts: [] },
                    { kind: 'percentage', name: 'P', parts: [] },
                    { kind: 'boolean', name: 'B', parts: [] },
                    { kind: 'text', name: 'TX', parts: [] }
                ]
            };
            const nodes = n.render(m);
            expect(nodes).toHaveLength(7);
            // Roundtrip via a container parse
            const wrapper = xml.el('office:styles', {}, nodes);
            const back = n.parse(wrapper);
            expect(back.formats.map(f => f.kind).sort()).toEqual(
                ['boolean', 'currency', 'date', 'number', 'percentage', 'text', 'time']);
        });
    });
});
