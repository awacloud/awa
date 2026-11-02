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

describe('typeColorPart (A41b)', () => {
    const { typeColorPart, COLOR_PART_KEYS } = pdfColorSpacesExtended.factory(_errors, _parserObj);
    const { ContractError } = _errors;
    const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };
    test('DeviceN attributes, mixing hints, process, solidities, default colour spaces, functions', () => {
        const d = typeColorPart(obj.dict({ Subtype: obj.name('NChannel'), Colorants: obj.dict({}), Process: obj.ref(3, 0), MixingHints: obj.dict({}), Foo: obj.int(1) }), 'deviceN');
        expect([d.subtype, d.colorants.type, d.process, d.mixinghints.type, d._extras]).toEqual(['NChannel', 'dict', obj.ref(3, 0), 'dict', { Foo: obj.int(1) }]);
        const h = typeColorPart(obj.dict({ Solidities: obj.dict({}), PrintingOrder: obj.array([]), DotGain: obj.dict({}) }), 'mixingHints');
        expect([h.solidities.type, h.printingorder.type, h.dotgain.type]).toEqual(['dict', 'array', 'dict']);
        expect(typeColorPart(obj.dict({ ColorSpace: obj.name('DeviceCMYK'), Components: obj.array([]) }), 'process')).toMatchObject({ colorspace: 'DeviceCMYK' });
        expect(typeColorPart(obj.dict({ ColorSpace: obj.array([]) }), 'process').colorspace.type).toBe('array');
        expect(typeColorPart(obj.dict({ Default: obj.real(0.5), Cyan: obj.real(1) }), 'solidities')).toMatchObject({ default: 0.5, _extras: { Cyan: obj.real(1) } });
        const m = typeColorPart(obj.dict({ DefaultRGB: obj.array([]), DefaultCMYK: obj.array([]), DefaultGray: obj.array([]) }), 'colorSpaceMap');
        expect([m.defaultrgb.type, m.defaultcmyk.type, m.defaultgray.type]).toEqual(['array', 'array', 'array']);
        expect(typeColorPart(obj.dict({ Default: obj.dict({}) }), 'functions').default.type).toBe('dict');
        expect(typeColorPart(obj.dict({ Subtype: obj.int(1) }), 'deviceN').subtype).toBe(null);
    });
    test('every kind of COLOR_PART_KEYS types every key of its list; errors', () => {
        expect(Object.keys(COLOR_PART_KEYS).sort()).toEqual(['colorSpaceMap', 'deviceN', 'functions', 'mixingHints', 'process', 'solidities']);
        for (const [kind, keys] of Object.entries(COLOR_PART_KEYS)) {
            const entries = {};
            for (const k of keys) entries[k] = obj.ref(1, 0);
            expect(typeColorPart(obj.dict(entries), kind)._extras).toEqual({});
        }
        expect(code(() => typeColorPart(obj.array([]), 'deviceN'))).toEqual([ParseError.name, 'pdf/extra/color-part/not-dict']);
        expect(code(() => typeColorPart(obj.dict({}), 'DeviceN'))).toEqual([ContractError.name, 'pdf/extra/color-part/kind']);
    });
});
