// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfColorSpacesExtended } from './color-spaces-extended.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const { typeColorSpace, COLOR_SPACE_FAMILIES } =
    pdfColorSpacesExtended.factory(_errors, _parserObj);
function bytes(s) { return new Uint8Array([...s].map(c => c.charCodeAt(0))); }

describe('typeColorSpace', () => {
    test('named device family', () => {
        const r = typeColorSpace(obj.name('DeviceRGB'));
        expect(r.family).toBe('DeviceRGB');
    });
    test('named resource pointer', () => {
        const r = typeColorSpace(obj.name('CS1'));
        expect(r.family).toBe('NamedResource');
    });
    test('CalGray', () => {
        const arr = obj.array([obj.name('CalGray'), obj.dict({
            WhitePoint: obj.array([obj.real(0.95), obj.real(1), obj.real(1.09)]),
            Gamma: obj.real(2.2)
        })]);
        const r = typeColorSpace(arr);
        expect(r.family).toBe('CalGray');
        expect(r.params.whitePoint.length).toBe(3);
    });
    test('CalRGB', () => {
        const arr = obj.array([obj.name('CalRGB'), obj.dict({
            WhitePoint: obj.array([obj.real(0.95), obj.real(1), obj.real(1.09)])
        })]);
        const r = typeColorSpace(arr);
        expect(r.family).toBe('CalRGB');
    });
    test('Lab', () => {
        const arr = obj.array([obj.name('Lab'), obj.dict({
            WhitePoint: obj.array([obj.real(0.95), obj.real(1), obj.real(1.09)]),
            Range: obj.array([obj.int(-100), obj.int(100), obj.int(-100), obj.int(100)])
        })]);
        const r = typeColorSpace(arr);
        expect(r.range).toEqual([-100, 100, -100, 100]);
    });
    test('ICCBased + metadata', () => {
        const s = obj.stream(obj.dict({
            N: obj.int(3),
            Alternate: obj.name('DeviceRGB'),
            Metadata: obj.ref(9, 0)
        }), new Uint8Array(2));
        const r = typeColorSpace(obj.array([obj.name('ICCBased'), s]));
        expect(r.n).toBe(3);
        expect(r.metadata.num).toBe(9);
    });
    test('Indexed lookup table', () => {
        const r = typeColorSpace(obj.array([
            obj.name('Indexed'), obj.name('DeviceRGB'),
            obj.int(255), obj.string(bytes('LUT'))
        ]));
        expect(r.hival).toBe(255);
        expect(r.lookup.value).toEqual(bytes('LUT'));
    });
    test('Separation with tintTransform', () => {
        const r = typeColorSpace(obj.array([
            obj.name('Separation'), obj.name('Cyan'),
            obj.name('DeviceCMYK'), obj.ref(1, 0)
        ]));
        expect(r.colorant).toBe('Cyan');
    });
    test('DeviceN + attributes', () => {
        const r = typeColorSpace(obj.array([
            obj.name('DeviceN'),
            obj.array([obj.name('Cyan'), obj.name('Magenta')]),
            obj.name('DeviceCMYK'),
            obj.ref(1, 0),
            obj.dict({ Subtype: obj.name('DeviceN') })
        ]));
        expect(r.names).toEqual(['Cyan', 'Magenta']);
        expect(r.attributes).toBeTruthy();
    });
    test('NChannel', () => {
        const r = typeColorSpace(obj.array([
            obj.name('NChannel'),
            obj.array([obj.name('R'), obj.name('G'), obj.name('B'), obj.name('Spot1')]),
            obj.name('DeviceRGB'),
            obj.ref(1, 0)
        ]));
        expect(r.nChannel).toBe(true);
    });
    test('Pattern', () => {
        const r = typeColorSpace(obj.array([obj.name('Pattern'), obj.name('DeviceRGB')]));
        expect(r.family).toBe('Pattern');
    });

    test('malformed inputs throw', () => {
        expect(() => typeColorSpace(obj.int(1))).toThrow(ParseError);
        expect(() => typeColorSpace(obj.array([]))).toThrow(ParseError);
        expect(() => typeColorSpace(obj.array([obj.int(1)]))).toThrow(ParseError);
        expect(() => typeColorSpace(obj.array([obj.name('XYZ')]))).toThrow(ParseError);
        expect(() => typeColorSpace(obj.array([obj.name('CalGray')]))).toThrow(ParseError);
        expect(() => typeColorSpace(obj.array([obj.name('CalGray'), obj.int(1)]))).toThrow(ParseError);
        expect(() => typeColorSpace(obj.array([obj.name('Lab'), obj.int(1)]))).toThrow(ParseError);
        expect(() => typeColorSpace(obj.array([obj.name('ICCBased'), obj.int(1)]))).toThrow(ParseError);
        expect(() => typeColorSpace(obj.array([obj.name('Indexed'), obj.name('DeviceRGB')]))).toThrow(ParseError);
        expect(() => typeColorSpace(obj.array([
            obj.name('Indexed'), obj.name('DeviceRGB'), obj.name('hi'), obj.string(bytes('x'))
        ]))).toThrow(ParseError);
        expect(() => typeColorSpace(obj.array([obj.name('Separation')]))).toThrow(ParseError);
        expect(() => typeColorSpace(obj.array([obj.name('DeviceN')]))).toThrow(ParseError);
    });
});

describe('factory', () => {
    test('shape', () => {
        expect(pdfColorSpacesExtended.name).toBe('pdfColorSpacesExtended');
        expect(pdfColorSpacesExtended.factory.toString()).toContain('function');
        const api = pdfColorSpacesExtended.factory(_pdfErrors_TD1, {});
        expect(typeof api.typeColorSpace).toBe('function');
        expect(COLOR_SPACE_FAMILIES.has('Lab')).toBe(true);
    });
});
