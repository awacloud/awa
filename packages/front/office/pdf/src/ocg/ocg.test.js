// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfOCG } from './ocg.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfOCG_m = pdfOCG.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeOCG, typeUsage } = _pdfOCG_m;

const u8 = (s) => new TextEncoder().encode(s);

describe('typeOCG', () => {
    test('minimal valid OCG', () => {
        const dict = obj.dict({
            Type: obj.name('OCG'),
            Name: obj.string(u8('Layer 1'))
        });
        const o = typeOCG(dict);
        expect(o.name).toEqual(u8('Layer 1'));
        expect(o.raw).toBe(dict);
        expect(o._extras).toEqual({});
    });

    test('reads Intent as name and as array', () => {
        const a = typeOCG(obj.dict({
            Name: obj.string(u8('L')),
            Intent: obj.name('View')
        }));
        expect(a.intent).toEqual(['View']);
        const b = typeOCG(obj.dict({
            Name: obj.string(u8('L')),
            Intent: obj.array([obj.name('View'), obj.name('Design')])
        }));
        expect(b.intent).toEqual(['View', 'Design']);
    });

    test('reads Usage state names', () => {
        const o = typeOCG(obj.dict({
            Name: obj.string(u8('L')),
            Usage: obj.dict({
                PrintState: obj.name('ON'),
                ViewState: obj.name('OFF'),
                Print: obj.dict({})
            })
        }));
        expect(o.usage.printState).toBe('ON');
        expect(o.usage.viewState).toBe('OFF');
        expect(o.usage.print.type).toBe('dict');
    });

    test('preserves unknown entries', () => {
        const o = typeOCG(obj.dict({
            Name: obj.string(u8('L')),
            CustomX: obj.int(1)
        }));
        expect(o._extras.CustomX).toEqual({ type: 'int', value: 1 });
    });

    test('rejects non-dict', () => {
        expect(() => typeOCG(obj.array([]))).toThrow(ParseError);
    });
    test('rejects wrong /Type', () => {
        expect(() => typeOCG(obj.dict({
            Type: obj.name('Page'),
            Name: obj.string(u8('a'))
        }))).toThrow(ParseError);
    });
    test('rejects missing /Name', () => {
        expect(() => typeOCG(obj.dict({}))).toThrow(ParseError);
    });
    test('rejects bad /Usage type', () => {
        expect(() => typeOCG(obj.dict({
            Name: obj.string(u8('L')),
            Usage: obj.int(1)
        }))).toThrow(ParseError);
    });
    test('rejects bad state value', () => {
        expect(() => typeUsage(obj.dict({
            PrintState: obj.int(1)
        }))).toThrow(ParseError);
    });
});

describe('pdfOCG module', () => {
    test('module shape + worker safety', () => {
        expect(pdfOCG.name).toBe('pdfOCG');
        expect(pdfOCG.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfOCG.factory.toString()).toContain('function');
        const m = pdfOCG.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeOCG).toBe('function');
        expect(typeof m.typeUsage).toBe('function');
    });
});
