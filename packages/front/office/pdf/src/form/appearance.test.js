// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfAppearance } from './appearance.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfParserObj } from '../syntax/parser-obj.js';
const errors = _pdfErrors_TD1;
const { ParseError } = errors;
const parserObj = pdfParserObj.factory();
const { obj } = parserObj;
const { typeAppearanceStreams, listPopulatedSlots } = pdfAppearance.factory(errors, parserObj);

describe('typeAppearanceStreams', () => {
    test('minimal with /N as ref', () => {
        const d = obj.dict({ N: obj.ref(20, 0) });
        const ap = typeAppearanceStreams(d);
        expect(ap.N.default.num).toBe(20);
        expect(ap.N.states).toEqual({});
        expect(ap.R).toBeNull();
        expect(ap.D).toBeNull();
    });

    test('/N as state-dict (checkbox)', () => {
        const d = obj.dict({
            N: obj.dict({ Yes: obj.ref(20, 0), Off: obj.ref(21, 0) })
        });
        const ap = typeAppearanceStreams(d);
        expect(ap.N.default).toBeNull();
        expect(ap.N.states.Yes.num).toBe(20);
        expect(ap.N.states.Off.num).toBe(21);
    });

    test('all three slots populated', () => {
        const d = obj.dict({
            N: obj.ref(20, 0), R: obj.ref(21, 0), D: obj.ref(22, 0)
        });
        const ap = typeAppearanceStreams(d);
        expect(ap.N.default.num).toBe(20);
        expect(ap.R.default.num).toBe(21);
        expect(ap.D.default.num).toBe(22);
    });

    test('/N as inline stream', () => {
        const s = obj.stream(obj.dict({}), new Uint8Array([1, 2]));
        const d = obj.dict({ N: s });
        const ap = typeAppearanceStreams(d);
        expect(ap.N.default).toBe(s);
    });

    test('preserves unknown entries in _extras', () => {
        const d = obj.dict({ N: obj.ref(20, 0), Mystery: obj.int(7) });
        expect(typeAppearanceStreams(d)._extras.Mystery.value).toBe(7);
    });

    test('rejects non-dict input', () => {
        expect(() => typeAppearanceStreams(obj.array([]))).toThrow(ParseError);
    });

    test('rejects missing /N', () => {
        expect(() => typeAppearanceStreams(obj.dict({ R: obj.ref(1, 0) }))).toThrow(ParseError);
    });

    test('rejects bad slot value', () => {
        const d = obj.dict({ N: obj.int(0) });
        expect(() => typeAppearanceStreams(d)).toThrow(ParseError);
    });

    test('rejects bad state-dict entry', () => {
        const d = obj.dict({ N: obj.dict({ Yes: obj.int(0) }) });
        expect(() => typeAppearanceStreams(d)).toThrow(ParseError);
    });
});

describe('listPopulatedSlots', () => {
    test('returns only populated slots', () => {
        const d = obj.dict({ N: obj.ref(20, 0), D: obj.ref(22, 0) });
        const ap = typeAppearanceStreams(d);
        expect(listPopulatedSlots(ap)).toEqual(['N', 'D']);
    });
});

describe('pdfAppearance module', () => {
    test('module shape + worker safety', () => {
        expect(pdfAppearance.name).toBe('pdfAppearance');
        expect(pdfAppearance.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfAppearance.factory.toString()).toContain('function');
        const m = pdfAppearance.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeAppearanceStreams).toBe('function');
        expect(typeof m.listPopulatedSlots).toBe('function');
    });
});
