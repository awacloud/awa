// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfPages } from './pages.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfParserObj } from '../syntax/parser-obj.js';
const errors = _pdfErrors_TD1;
const { ParseError } = errors;
const parserObj = pdfParserObj.factory();
const { obj } = parserObj;
const { walkPageTree, readPageCount } = pdfPages.factory(errors, parserObj);

function makeResolver(map) {
    return (ref) => {
        const key = ref.num + ':' + ref.gen;
        if (!map.has(key)) throw new ParseError('test/missing', 'missing ' + key);
        return map.get(key);
    };
}

describe('walkPageTree', () => {
    test('single-page tree', () => {
        const map = new Map();
        map.set('2:0', obj.dict({
            Type: obj.name('Pages'),
            Kids: obj.array([obj.ref(3, 0)]),
            Count: obj.int(1)
        }));
        map.set('3:0', obj.dict({
            Type: obj.name('Page'),
            Parent: obj.ref(2, 0)
        }));
        const refs = walkPageTree({ num: 2, gen: 0 }, makeResolver(map));
        expect(refs).toEqual([{ num: 3, gen: 0 }]);
    });

    test('balanced two-level tree', () => {
        const map = new Map();
        map.set('1:0', obj.dict({
            Type: obj.name('Pages'),
            Kids: obj.array([obj.ref(2, 0), obj.ref(3, 0)]),
            Count: obj.int(4)
        }));
        map.set('2:0', obj.dict({
            Type: obj.name('Pages'),
            Kids: obj.array([obj.ref(4, 0), obj.ref(5, 0)]),
            Count: obj.int(2)
        }));
        map.set('3:0', obj.dict({
            Type: obj.name('Pages'),
            Kids: obj.array([obj.ref(6, 0), obj.ref(7, 0)]),
            Count: obj.int(2)
        }));
        for (const n of [4, 5, 6, 7]) {
            map.set(n + ':0', obj.dict({ Type: obj.name('Page') }));
        }
        const refs = walkPageTree({ num: 1, gen: 0 }, makeResolver(map));
        expect(refs.map(r => r.num)).toEqual([4, 5, 6, 7]);
    });

    test('detects cycles', () => {
        const map = new Map();
        map.set('1:0', obj.dict({
            Type: obj.name('Pages'),
            Kids: obj.array([obj.ref(1, 0)]),
            Count: obj.int(1)
        }));
        expect(() => walkPageTree({ num: 1, gen: 0 }, makeResolver(map)))
            .toThrow(ParseError);
    });

    test('enforces maxDepth', () => {
        const map = new Map();
        for (let i = 1; i <= 5; i++) {
            map.set(i + ':0', obj.dict({
                Type: obj.name('Pages'),
                Kids: obj.array([obj.ref(i + 1, 0)]),
                Count: obj.int(1)
            }));
        }
        map.set('6:0', obj.dict({ Type: obj.name('Page') }));
        expect(() => walkPageTree({ num: 1, gen: 0 }, makeResolver(map), { maxDepth: 2 }))
            .toThrow(ParseError);
    });

    test('rejects missing /Kids on intermediate node', () => {
        const map = new Map();
        map.set('1:0', obj.dict({ Type: obj.name('Pages') }));
        // No `Page` either — without /Kids and without /Type=Page, this
        // is an invalid intermediate. We expect failure.
        // Provide explicit Type=Pages so leaf-detection picks intermediate.
        expect(() => walkPageTree({ num: 1, gen: 0 }, makeResolver(map)))
            .toThrow(ParseError);
    });

    test('rejects non-ref Kid entries', () => {
        const map = new Map();
        map.set('1:0', obj.dict({
            Type: obj.name('Pages'),
            Kids: obj.array([obj.int(5)]),
            Count: obj.int(1)
        }));
        expect(() => walkPageTree({ num: 1, gen: 0 }, makeResolver(map)))
            .toThrow(ParseError);
    });
});

describe('readPageCount', () => {
    test('reads /Count int', () => {
        expect(readPageCount(obj.dict({ Count: obj.int(7) }))).toBe(7);
    });

    test('returns null when absent', () => {
        expect(readPageCount(obj.dict({}))).toBeNull();
    });

    test('returns null on non-dict', () => {
        expect(readPageCount(obj.array([]))).toBeNull();
    });
});

describe('pdfPages module', () => {
    test('module shape', () => {
        expect(pdfPages.name).toBe('pdfPages');
        expect(pdfPages.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfPages.factory.toString()).toContain('function');
        const m = pdfPages.factory(_pdfErrors_TD1, {});
        expect(typeof m.walkPageTree).toBe('function');
        expect(typeof m.readPageCount).toBe('function');
    });
});
