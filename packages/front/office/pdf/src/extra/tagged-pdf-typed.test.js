// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfTaggedPdfTyped } from './tagged-pdf-typed.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const { typeStructAttribute } = pdfTaggedPdfTyped.factory(_errors, _parserObj);
function bytes(s) { return new Uint8Array([...s].map(c => c.charCodeAt(0))); }

describe('typeStructAttribute', () => {
    test('Layout — minimal', () => {
        const d = obj.dict({ O: obj.name('Layout') });
        const r = typeStructAttribute(d);
        expect(r.owner).toBe('Layout');
        expect(r._extras).toEqual({});
    });

    test('Layout — all major optional entries', () => {
        const d = obj.dict({
            O: obj.name('Layout'),
            Placement: obj.name('Block'),
            WritingMode: obj.name('LrTb'),
            BackgroundColor: obj.array([obj.real(1), obj.real(1), obj.real(1)]),
            TextAlign: obj.name('Center'),
            SpaceBefore: obj.real(12),
            ColumnCount: obj.int(2)
        });
        const r = typeStructAttribute(d);
        expect(r.placement).toBe('Block');
        expect(r.textAlign).toBe('Center');
        expect(r.spaceBefore).toBe(12);
        expect(r.columnCount).toBe(2);
        expect(r.backgroundColor).toEqual([1, 1, 1]);
    });

    test('List', () => {
        const d = obj.dict({
            O: obj.name('List'),
            ListNumbering: obj.name('Decimal'),
            ContinuedList: obj.bool(true)
        });
        const r = typeStructAttribute(d);
        expect(r.listNumbering).toBe('Decimal');
        expect(r.continuedList).toBe(true);
    });

    test('Table with rowspan/headers', () => {
        const d = obj.dict({
            O: obj.name('Table'),
            RowSpan: obj.int(2), ColSpan: obj.int(3),
            Scope: obj.name('Row'),
            Summary: obj.string(bytes('Quarterly sales'))
        });
        const r = typeStructAttribute(d);
        expect(r.rowSpan).toBe(2);
        expect(r.scope).toBe('Row');
        expect(r.summary).toEqual(bytes('Quarterly sales'));
    });

    test('PrintField checked', () => {
        const d = obj.dict({
            O: obj.name('PrintField'),
            Role: obj.name('cb'),
            checked: obj.name('on')
        });
        const r = typeStructAttribute(d);
        expect(r.role).toBe('cb');
        expect(r.checked).toBe('on');
    });

    test('Artifact', () => {
        const d = obj.dict({
            O: obj.name('Artifact'),
            Type: obj.name('Pagination'),
            Subtype: obj.name('Header'),
            BBox: obj.array([obj.int(0), obj.int(0), obj.int(100), obj.int(50)])
        });
        const r = typeStructAttribute(d);
        expect(r.artifactType).toBe('Pagination');
        expect(r.artifactSubtype).toBe('Header');
        expect(r.bbox).toEqual([0, 0, 100, 50]);
    });

    test('UserProperties', () => {
        const d = obj.dict({
            O: obj.name('UserProperties'),
            P: obj.array([
                obj.dict({
                    N: obj.string(bytes('Status')),
                    V: obj.string(bytes('Final')),
                    H: obj.bool(false)
                })
            ])
        });
        const r = typeStructAttribute(d);
        expect(r.properties.length).toBe(1);
        expect(r.properties[0].hidden).toBe(false);
    });

    test('_extras preservation', () => {
        const d = obj.dict({ O: obj.name('Layout'), Custom: obj.int(1) });
        const r = typeStructAttribute(d);
        expect(r._extras.Custom.value).toBe(1);
    });

    test('vendor owner', () => {
        const d = obj.dict({ O: obj.name('XYZCustom'), Whatever: obj.int(1) });
        const r = typeStructAttribute(d);
        expect(r.owner).toBe('XYZCustom');
        expect(r.vendor).toBe(true);
        expect(r._extras.Whatever).toBeDefined();
    });

    test('rejects non-dict / missing owner / bad UserProperties P', () => {
        expect(() => typeStructAttribute(obj.array([]))).toThrow(ParseError);
        expect(() => typeStructAttribute(obj.dict({}))).toThrow(ParseError);
        expect(() => typeStructAttribute(obj.dict({
            O: obj.name('UserProperties'),
            P: obj.array([obj.int(1)])
        }))).toThrow(ParseError);
    });
});

describe('pdfTaggedPdfTyped factory', () => {
    test('shape', () => {
        expect(pdfTaggedPdfTyped.name).toBe('pdfTaggedPdfTyped');
        expect(pdfTaggedPdfTyped.factory.toString()).toContain('function');
        const api = pdfTaggedPdfTyped.factory(_pdfErrors_TD1, { isType: () => false });
        expect(typeof api.typeStructAttribute).toBe('function');
    });
});

describe('A38b: the NSO owner, the Layout keys typed, Short and Checked', () => {
    const { ATTRIBUTE_OWNERS } = pdfTaggedPdfTyped.factory(_errors, _parserObj);
    const u8 = (s) => new TextEncoder().encode(s);

    test('an NSO attribute object: NS and every standard attribute read', () => {
        const d = obj.dict({
            O: obj.name('NSO'), NS: obj.ref(9, 0), Placement: obj.name('Block'), SpaceBefore: obj.real(6),
            ListNumbering: obj.name('Decimal'), RowSpan: obj.int(2), Short: obj.string(u8('Q1')), Role: obj.name('cb'),
            Checked: obj.name('on'), Type: obj.name('Pagination'), P: obj.array([]), Foo: obj.int(1)
        });
        const r = typeStructAttribute(d);
        expect([r.owner, r.ns.type, r.placement, r.spaceBefore, r.listNumbering, r.rowSpan]).toEqual(['NSO', 'ref', 'Block', 6, 'Decimal', 2]);
        expect([r.short, r.role, r.checked, r.artifactType, r.p.type]).toEqual([u8('Q1'), 'cb', 'on', 'Pagination', 'array']);
        expect(r.vendor).toBeUndefined();
        expect(r._extras).toEqual({ Foo: obj.int(1) });
        expect(ATTRIBUTE_OWNERS.has('NSO')).toBe(true);
    });

    test('Layout: the five keys typed; Width, Height, LineHeight a name or a number', () => {
        const r = typeStructAttribute(obj.dict({
            O: obj.name('Layout'), TBorderStyle: obj.name('Solid'), TPadding: obj.int(2), RubyAlign: obj.name('Center'),
            RubyPosition: obj.name('Before'), GlyphOrientationVertical: obj.int(90), Width: obj.name('Auto'),
            Height: obj.real(12), LineHeight: obj.name('Normal')
        }));
        expect([r.tBorderStyle, r.tPadding, r.rubyAlign, r.rubyPosition, r.glyphOrientationVertical])
            .toEqual(['Solid', 2, 'Center', 'Before', 90]);
        expect([r.width, r.height, r.lineHeight]).toEqual(['Auto', 12, 'Normal']);
        expect(r._extras).toEqual({});
        expect(typeStructAttribute(obj.dict({ O: obj.name('Layout'), TBorderStyle: obj.array([]), GlyphOrientationVertical: obj.name('Auto') })))
            .toMatchObject({ tBorderStyle: { type: 'array' }, glyphOrientationVertical: 'Auto' });
    });

    test('Table: Short; PrintField: Checked not an extra', () => {
        expect(typeStructAttribute(obj.dict({ O: obj.name('Table'), Short: obj.string(u8('Q')) })).short).toEqual(u8('Q'));
        const pf = typeStructAttribute(obj.dict({ O: obj.name('PrintField'), Checked: obj.name('off') }));
        expect([pf.checked, pf._extras]).toEqual(['off', {}]);
    });
});
