// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfText } from './text.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfGraphics } from './graphics.js';
import { pdfErrors } from '../errors.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const errMod = _pdfErrors_TD1;
const { ContractError } = errMod;
const { obj } = pdfParserObj.factory();
const { initialGState } = pdfGraphics.factory(errMod);
const {
    setFont, beginTextObject, td, tdSetLeading, setTextMatrix,
    nextLine, rawStringBytes, extractText
} = pdfText.factory(errMod);

const te = new TextEncoder();

describe('setFont', () => {
    test('writes to gstate.text', () => {
        const g = initialGState();
        setFont(g, 'F1', 12);
        expect(g.text.font).toBe('F1');
        expect(g.text.fontSize).toBe(12);
    });
});

describe('beginTextObject / td / Tm', () => {
    test('initial Tm = Tlm = identity', () => {
        const s = beginTextObject();
        expect(s.Tm).toEqual([1, 0, 0, 1, 0, 0]);
        expect(s.Tlm).toEqual([1, 0, 0, 1, 0, 0]);
    });

    test('td translates', () => {
        const s = beginTextObject();
        td(s, 10, 20);
        expect(s.Tm[4]).toBe(10);
        expect(s.Tm[5]).toBe(20);
        expect(s.Tlm).toEqual(s.Tm);
    });

    test('TD sets leading', () => {
        const g = initialGState();
        const s = beginTextObject();
        tdSetLeading(g, s, 0, -14);
        expect(g.text.leading).toBe(14);
        expect(s.Tm[5]).toBe(-14);
    });

    test('Tm replaces', () => {
        const s = beginTextObject();
        setTextMatrix(s, [2, 0, 0, 2, 100, 200]);
        expect(s.Tm).toEqual([2, 0, 0, 2, 100, 200]);
        expect(s.Tlm).toEqual([2, 0, 0, 2, 100, 200]);
    });

    test('Tm rejects bad shape', () => {
        const s = beginTextObject();
        expect(() => setTextMatrix(s, [1, 2, 3])).toThrow(ContractError);
    });

    test('T* nextLine uses leading', () => {
        const g = initialGState();
        g.text.leading = 14;
        const s = beginTextObject();
        nextLine(g, s);
        expect(s.Tm[5]).toBe(-14);
    });
});

describe('rawStringBytes', () => {
    test('returns bytes', () => {
        const s = obj.string(te.encode('hi'));
        expect(rawStringBytes(s)).toBe(s.value);
    });

    test('rejects non-string operand', () => {
        expect(() => rawStringBytes(obj.int(1))).toThrow(ContractError);
    });
});

describe('extractText', () => {
    const fontSimple = { subtype: 'Type1' };
    const fontType0  = { subtype: 'Type0' };
    const ascii = (cid) => String.fromCharCode(cid);

    test('Tj on simple font', () => {
        const op = { op: 'Tj', args: [obj.string(te.encode('Hi'))] };
        expect(extractText(op, fontSimple, ascii)).toBe('Hi');
    });

    test('TJ array with positioning', () => {
        const op = { op: 'TJ', args: [obj.array([
            obj.string(te.encode('H')),
            obj.int(-100),
            obj.string(te.encode('i'))
        ])] };
        expect(extractText(op, fontSimple, ascii)).toBe('Hi');
    });

    test("' / next-line + show", () => {
        const op = { op: "'", args: [obj.string(te.encode('X'))] };
        expect(extractText(op, fontSimple, ascii)).toBe('X');
    });

    test('" / aw ac string', () => {
        const op = {
            op: '"',
            args: [obj.int(0), obj.int(0), obj.string(te.encode('Y'))]
        };
        expect(extractText(op, fontSimple, ascii)).toBe('Y');
    });

    test('Type0 uses 2-byte CIDs', () => {
        const op = {
            op: 'Tj',
            args: [obj.string(new Uint8Array([0, 0x48, 0, 0x69]))]
        };
        const cidToUni = (cid) => String.fromCharCode(cid);
        expect(extractText(op, fontType0, cidToUni)).toBe('Hi');
    });

    test('unmapped glyph → replacement char', () => {
        const op = { op: 'Tj', args: [obj.string(te.encode('ab'))] };
        expect(extractText(op, fontSimple, () => undefined)).toBe('��');
    });
});

describe('pdfText module', () => {
    test('module shape', () => {
        expect(pdfText.name).toBe('pdfText');
        expect(pdfText.dependencies).toEqual(['pdfErrors']);
        expect(pdfText.factory.toString()).toContain('function');
        const m = pdfText.factory(_pdfErrors_TD1);
        for (const k of ['setFont','beginTextObject','td','tdSetLeading',
                         'setTextMatrix','nextLine','rawStringBytes','extractText']) {
            expect(typeof m[k]).toBe('function');
        }
    });
});
