// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfDestination } from './destination.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfDestination_m = pdfDestination.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeDestination } = _pdfDestination_m;

describe('typeDestination', () => {
    test('XYZ with all args', () => {
        const d = typeDestination(obj.array([
            obj.ref(3, 0), obj.name('XYZ'),
            obj.int(0), obj.int(792), obj.real(1.5)
        ]));
        expect(d.page).toEqual({ num: 3, gen: 0 });
        expect(d.fit).toBe('XYZ');
        expect(d.args).toEqual([0, 792, 1.5]);
    });

    test('Fit takes no args', () => {
        const d = typeDestination(obj.array([
            obj.ref(2, 0), obj.name('Fit')
        ]));
        expect(d.fit).toBe('Fit');
        expect(d.args).toEqual([]);
    });

    test('null args allowed', () => {
        const d = typeDestination(obj.array([
            obj.ref(1, 0), obj.name('XYZ'), obj.nul(), obj.int(100), obj.nul()
        ]));
        expect(d.args).toEqual([null, 100, null]);
    });

    test('FitR with four args', () => {
        const d = typeDestination(obj.array([
            obj.ref(1, 0), obj.name('FitR'),
            obj.int(0), obj.int(0), obj.int(100), obj.int(100)
        ]));
        expect(d.args).toEqual([0, 0, 100, 100]);
    });

    test('integer page (remote)', () => {
        const d = typeDestination(obj.array([
            obj.int(5), obj.name('Fit')
        ]));
        expect(d.page).toEqual({ pageNum: 5 });
    });

    test('unwraps dict with /D', () => {
        const d = typeDestination(obj.dict({
            D: obj.array([obj.ref(1, 0), obj.name('Fit')])
        }));
        expect(d.fit).toBe('Fit');
    });

    test('resolves named via legacy /Dests dict', () => {
        const names = obj.dict({
            Chapter1: obj.array([obj.ref(7, 0), obj.name('Fit')])
        });
        const d = typeDestination(obj.name('Chapter1'), names);
        expect(d.page).toEqual({ num: 7, gen: 0 });
    });

    test('resolves through Names array', () => {
        const u = (s) => new TextEncoder().encode(s);
        const names = obj.dict({
            Names: obj.array([
                obj.string(u('Ch1')), obj.array([obj.ref(7, 0), obj.name('Fit')])
            ])
        });
        const d = typeDestination(obj.string(u('Ch1')), names);
        expect(d.page).toEqual({ num: 7, gen: 0 });
    });

    test('rejects non-typed input', () => {
        expect(() => typeDestination(null)).toThrow(ParseError);
    });
    test('rejects bad fit name', () => {
        expect(() => typeDestination(obj.array([
            obj.ref(1, 0), obj.name('Bogus')
        ]))).toThrow(ParseError);
    });
    test('rejects missing fit', () => {
        expect(() => typeDestination(obj.array([obj.ref(1, 0)]))).toThrow(ParseError);
    });
    test('rejects empty array', () => {
        expect(() => typeDestination(obj.array([]))).toThrow(ParseError);
    });
    test('rejects bad page entry', () => {
        expect(() => typeDestination(obj.array([
            obj.name('foo'), obj.name('Fit')
        ]))).toThrow(ParseError);
    });
    test('rejects bad arg type', () => {
        expect(() => typeDestination(obj.array([
            obj.ref(1, 0), obj.name('FitH'), obj.name('oops')
        ]))).toThrow(ParseError);
    });
    test('rejects unknown named dest', () => {
        expect(() => typeDestination(obj.name('NoSuch'), obj.dict({}))).toThrow(ParseError);
    });
    test('rejects named with no names dict', () => {
        expect(() => typeDestination(obj.name('Foo'))).toThrow(ParseError);
    });
});

describe('pdfDestination module', () => {
    test('module shape + worker safety', () => {
        expect(pdfDestination.name).toBe('pdfDestination');
        expect(pdfDestination.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfDestination.factory.toString()).toContain('function');
        const m = pdfDestination.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeDestination).toBe('function');
    });
});

const u8dest = (s) => new TextEncoder().encode(s);
const codeOfDest = (fn) => {
    try { fn(); } catch (e) { return e.code; }
    throw new Error('expected a throw, got none');
};

describe('typeDestination — rejections', () => {
    test('a scalar that is neither name nor string is not a destination', () => {
        expect(codeOfDest(() => typeDestination(obj.int(3)))).toBe('pdf/dest/bad-type');
        expect(codeOfDest(() => typeDestination(obj.bool(true)))).toBe('pdf/dest/bad-type');
    });
});

describe('typeDestination — /Names name-tree resolution', () => {
    const explicit = obj.array([obj.ref(5, 0), obj.name('Fit')]);

    test('a /Names leaf matches a byte-string key against a /Name lookup', () => {
        // The name-tree key is a PDF string; the destination reference is a
        // /Name, so the comparison crosses the bytes-vs-string boundary.
        const names = obj.dict({
            Names: obj.array([obj.string(u8dest('Chapter1')), explicit])
        });
        const d = typeDestination(obj.name('Chapter1'), names);
        expect(d.page).toEqual({ num: 5, gen: 0 });
        expect(d.fit).toBe('Fit');
    });

    test('a key of the wrong length or content does not match', () => {
        const names = obj.dict({
            Names: obj.array([obj.string(u8dest('Chapter1')), explicit])
        });
        expect(codeOfDest(() => typeDestination(obj.name('Chapter11'), names)))
            .toBe('pdf/dest/unknown-name');
        expect(codeOfDest(() => typeDestination(obj.name('Chapter2'), names)))
            .toBe('pdf/dest/unknown-name');
    });

    test('the tree descends into /Kids and resolves an indirect target', () => {
        const child = obj.dict({
            Names: obj.array([obj.string(u8dest('Deep')), obj.ref(11, 0)])
        });
        const root = obj.dict({
            Names: obj.array([]),
            Kids: obj.array([obj.int(1), obj.ref(9, 0)])   // non-refs are skipped
        });
        const resolveRef = (r) => (r.num === 9 ? child : (r.num === 11 ? explicit : null));
        const d = typeDestination(obj.name('Deep'), root, resolveRef);
        expect(d.page).toEqual({ num: 5, gen: 0 });
    });

    test('a /Kids branch that resolves to nothing reports unknown-name', () => {
        const root = obj.dict({
            Names: obj.array([]),
            Kids: obj.array([obj.ref(9, 0)])
        });
        expect(codeOfDest(() => typeDestination(obj.name('Missing'), root, () => null)))
            .toBe('pdf/dest/unknown-name');
    });
});
