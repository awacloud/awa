// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfParserObj } from '../syntax/parser-obj.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
import { pdfAssociatedFiles2 } from './associated-files.js';

const u8 = (s) => new TextEncoder().encode(s);
const m = pdfAssociatedFiles2.factory(_pdfErrors_TD1);

describe('extra/associated-files', () => {
    test('inline filespec with standard relationship', () => {
        const r = m.typeAf(obj.array([
            obj.dict({
                Type: obj.name('Filespec'),
                F: obj.string(u8('data.csv')),
                AFRelationship: obj.name('Data')
            })
        ]));
        expect(r.entries.length).toBe(1);
        expect(r.entries[0].relationship).toBe('Data');
        expect(r.entries[0].standard).toBe(true);
        expect(r.entries[0].resolved).toBe(true);
    });

    test('non-standard relationship is flagged', () => {
        const r = m.typeAf(obj.array([
            obj.dict({ AFRelationship: obj.name('Custom') })
        ]));
        expect(r.entries[0].standard).toBe(false);
    });

    test('ref with no resolver leaves unresolved', () => {
        const r = m.typeAf(obj.array([obj.ref(5, 0)]));
        expect(r.entries[0].resolved).toBe(false);
        expect(r.entries[0].ref.num).toBe(5);
    });

    test('ref with resolver resolves to filespec', () => {
        const r = m.typeAf(obj.array([obj.ref(3, 0)]), {
            resolveRef: (ref) => obj.dict({
                AFRelationship: obj.name('Source')
            })
        });
        expect(r.entries[0].resolved).toBe(true);
        expect(r.entries[0].ref.num).toBe(3);
        expect(r.entries[0].relationship).toBe('Source');
    });

    test('carrier hint accepted', () => {
        const r = m.typeAf(obj.array([]), { carrier: 'Page' });
        expect(r.carrier).toBe('Page');
    });

    test('rejects bad carrier', () => {
        expect(() => m.typeAf(obj.array([]), { carrier: 'Frob' })).toThrow(ParseError);
    });

    test('rejects non-array', () => {
        expect(() => m.typeAf(obj.int(1))).toThrow(ParseError);
    });

    test('rejects bad /Type on filespec', () => {
        expect(() => m.typeAf(obj.array([
            obj.dict({ Type: obj.name('Bogus') })
        ]))).toThrow(ParseError);
    });

    test('rejects non-name /AFRelationship', () => {
        expect(() => m.typeAf(obj.array([
            obj.dict({ AFRelationship: obj.int(1) })
        ]))).toThrow(ParseError);
    });

    test('lists standard relationships', () => {
        expect(m.listStandardRelationships()).toContain('Source');
        expect(m.isStandardRelationship('Schema')).toBe(true);
        expect(m.isStandardRelationship('Nope')).toBe(false);
    });

    test('factory shape', () => {
        expect(pdfAssociatedFiles2.name).toBe('pdfAssociatedFiles2');
        expect(pdfAssociatedFiles2.dependencies).toEqual(['pdfErrors']);
        expect(pdfAssociatedFiles2.factory.toString()).toContain('function');
    });
});
