// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfShadingTyped } from './shading-typed.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const { typeShading, typeFunction } = pdfShadingTyped.factory(_errors, _parserObj);
function nums(...xs) { return obj.array(xs.map(x => obj.real(x))); }

describe('typeShading', () => {
    test('Type 2 axial minimal', () => {
        const d = obj.dict({
            ShadingType: obj.int(2),
            Coords: nums(0, 0, 100, 0),
            ColorSpace: obj.name('DeviceRGB'),
            Function: obj.ref(1, 0)
        });
        const r = typeShading(d);
        expect(r.shadingType).toBe(2);
        expect(r.coords).toEqual([0, 0, 100, 0]);
        expect(r.extend).toEqual([false, false]);
    });

    test('Type 3 radial with all entries', () => {
        const d = obj.dict({
            ShadingType: obj.int(3),
            Coords: nums(0, 0, 0, 0, 0, 50),
            Domain: nums(0, 1),
            Function: obj.ref(1, 0),
            Extend: obj.array([obj.bool(true), obj.bool(true)]),
            BBox: nums(0, 0, 100, 100),
            AntiAlias: obj.bool(true),
            Background: obj.array([obj.real(1), obj.real(1), obj.real(1)]),
            Vendor: obj.int(1)
        });
        const r = typeShading(d);
        expect(r.extend).toEqual([true, true]);
        expect(r.background.length).toBe(3);
        expect(r._extras.Vendor.value).toBe(1);
    });

    test('Type 1 function-based defaults', () => {
        const r = typeShading(obj.dict({
            ShadingType: obj.int(1), Function: obj.ref(1, 0)
        }));
        expect(r.domain).toEqual([0, 1, 0, 1]);
        expect(r.matrix).toEqual([1, 0, 0, 1, 0, 0]);
    });

    test('Type 4 Free-form stream', () => {
        const s = obj.stream(obj.dict({
            ShadingType: obj.int(4),
            BitsPerCoordinate: obj.int(8),
            BitsPerComponent:  obj.int(8),
            BitsPerFlag:       obj.int(2),
            Decode: nums(0, 1, 0, 1, 0, 1, 0, 1, 0, 1)
        }), new Uint8Array(0));
        const r = typeShading(s);
        expect(r.shadingType).toBe(4);
        expect(r.bitsPerFlag).toBe(2);
    });

    test('Type 5 Lattice requires VerticesPerRow', () => {
        expect(() => typeShading(obj.dict({
            ShadingType: obj.int(5),
            BitsPerCoordinate: obj.int(8),
            BitsPerComponent:  obj.int(8),
            Decode: nums(0, 1)
        }))).toThrow(ParseError);
    });

    test('Type 6/7 mesh', () => {
        for (const st of [6, 7]) {
            const r = typeShading(obj.dict({
                ShadingType: obj.int(st),
                BitsPerCoordinate: obj.int(8),
                BitsPerComponent:  obj.int(8),
                BitsPerFlag:       obj.int(2),
                Decode: nums(0, 1)
            }));
            expect(r.shadingType).toBe(st);
        }
    });

    test('malformed throws', () => {
        expect(() => typeShading(obj.int(1))).toThrow(ParseError);
        expect(() => typeShading(obj.dict({}))).toThrow(ParseError);
        expect(() => typeShading(obj.dict({ ShadingType: obj.int(99) }))).toThrow(ParseError);
        expect(() => typeShading(obj.dict({ ShadingType: obj.int(2), Coords: nums(1, 2) })))
            .toThrow(ParseError);
        expect(() => typeShading(obj.dict({
            ShadingType: obj.int(4),
            BitsPerCoordinate: obj.int(8),
            BitsPerComponent:  obj.int(8),
            Decode: nums(0, 1)
        }))).toThrow(ParseError);
    });
});

describe('typeFunction', () => {
    test('Type 2 exponential', () => {
        const r = typeFunction(obj.dict({
            FunctionType: obj.int(2),
            Domain: nums(0, 1),
            C0: nums(0, 0, 0), C1: nums(1, 1, 1), N: obj.real(1)
        }));
        expect(r.functionType).toBe(2);
        expect(r.n).toBe(1);
    });

    test('Type 0 sampled stream', () => {
        const s = obj.stream(obj.dict({
            FunctionType: obj.int(0),
            Domain: nums(0, 1), Range: nums(0, 1),
            Size: obj.array([obj.int(2)]),
            BitsPerSample: obj.int(8)
        }), new Uint8Array([0, 255]));
        const r = typeFunction(s);
        expect(r.bitsPerSample).toBe(8);
        expect(r.size).toEqual([2]);
    });

    test('malformed throws', () => {
        expect(() => typeFunction(obj.int(1))).toThrow(ParseError);
        expect(() => typeFunction(obj.dict({}))).toThrow(ParseError);
        expect(() => typeFunction(obj.dict({ FunctionType: obj.int(99) }))).toThrow(ParseError);
    });
});

describe('factory', () => {
    test('shape', () => {
        expect(pdfShadingTyped.name).toBe('pdfShadingTyped');
        expect(pdfShadingTyped.factory.toString()).toContain('function');
        const api = pdfShadingTyped.factory(_pdfErrors_TD1, { isType: () => false });
        expect(typeof api.typeShading).toBe('function');
        expect(typeof api.typeFunction).toBe('function');
    });
});
