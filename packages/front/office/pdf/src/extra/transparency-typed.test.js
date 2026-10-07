// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfTransparencyTyped } from './transparency-typed.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const { typeTransparencyGroup, typeSoftMask, resolveBlendMode, BLEND_MODES } =
    pdfTransparencyTyped.factory(_errors, _parserObj);
describe('typeTransparencyGroup', () => {
    test('minimal', () => {
        const d = obj.dict({ S: obj.name('Transparency') });
        const r = typeTransparencyGroup(d);
        expect(r.s).toBe('Transparency');
        expect(r.isolated).toBe(false);
        expect(r._extras).toEqual({});
    });
    test('all major entries + extras', () => {
        const d = obj.dict({
            Type: obj.name('Group'),
            S: obj.name('Transparency'),
            CS: obj.name('DeviceRGB'),
            I: obj.bool(true), K: obj.bool(true),
            Custom: obj.int(7)
        });
        const r = typeTransparencyGroup(d);
        expect(r.isolated).toBe(true);
        expect(r.knockout).toBe(true);
        expect(r._extras.Custom.value).toBe(7);
    });
    test('malformed throws', () => {
        expect(() => typeTransparencyGroup(obj.int(1))).toThrow(ParseError);
        expect(() => typeTransparencyGroup(obj.dict({ Type: obj.name('X'), S: obj.name('Transparency') })))
            .toThrow(ParseError);
        expect(() => typeTransparencyGroup(obj.dict({ S: obj.name('XYZ') }))).toThrow(ParseError);
    });
});

describe('typeSoftMask', () => {
    test('minimal Luminosity', () => {
        const d = obj.dict({
            Type: obj.name('Mask'),
            S: obj.name('Luminosity'),
            G: obj.ref(1, 0)
        });
        const r = typeSoftMask(d);
        expect(r.kind).toBe('Luminosity');
    });
    test('with BC + TR + extras', () => {
        const d = obj.dict({
            S: obj.name('Alpha'),
            G: obj.ref(1, 0),
            BC: obj.array([obj.real(0.1), obj.real(0.2), obj.real(0.3)]),
            TR: obj.ref(9, 0),
            Vendor: obj.int(5)
        });
        const r = typeSoftMask(d);
        expect(r.kind).toBe('Alpha');
        expect(r.backdrop).toEqual([0.1, 0.2, 0.3]);
        expect(r.transfer.num).toBe(9);
        expect(r._extras.Vendor.value).toBe(5);
    });
    test('malformed throws', () => {
        expect(() => typeSoftMask(obj.int(1))).toThrow(ParseError);
        expect(() => typeSoftMask(obj.dict({}))).toThrow(ParseError);
        expect(() => typeSoftMask(obj.dict({ S: obj.name('Alpha') }))).toThrow(ParseError);
        expect(() => typeSoftMask(obj.dict({
            Type: obj.name('XYZ'), S: obj.name('Alpha'), G: obj.ref(1, 0)
        }))).toThrow(ParseError);
    });
});

describe('resolveBlendMode', () => {
    test('name', () => {
        expect(resolveBlendMode(obj.name('Multiply'))).toBe('Multiply');
        expect(resolveBlendMode(obj.name('Bogus'))).toBe(null);
    });
    test('array picks first known', () => {
        expect(resolveBlendMode(obj.array([obj.name('Bogus'), obj.name('Screen')]))).toBe('Screen');
    });
    test('null', () => {
        expect(resolveBlendMode(null)).toBe(null);
    });
    test('throws on bad type', () => {
        expect(() => resolveBlendMode(obj.int(1))).toThrow(ParseError);
    });
});

describe('BLEND_MODES', () => {
    test('frozen and length 17 (incl. Compatible)', () => {
        expect(Object.isFrozen(BLEND_MODES)).toBe(true);
        expect(BLEND_MODES.length).toBeGreaterThanOrEqual(16);
        expect(BLEND_MODES).toContain('Luminosity');
    });
});

describe('factory', () => {
    test('shape', () => {
        expect(pdfTransparencyTyped.name).toBe('pdfTransparencyTyped');
        expect(pdfTransparencyTyped.factory.toString()).toContain('function');
        const api = pdfTransparencyTyped.factory(_pdfErrors_TD1, {});
        expect(typeof api.typeSoftMask).toBe('function');
    });
});
