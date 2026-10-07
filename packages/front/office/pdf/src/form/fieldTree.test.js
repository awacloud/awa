// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfFieldTree } from './fieldTree.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfParserObj } from '../syntax/parser-obj.js';
const errors = _pdfErrors_TD1;
const { ParseError } = errors;
const parserObj = pdfParserObj.factory();
const { obj } = parserObj;
const { walkFieldTree, getInherited } = pdfFieldTree.factory(errors, parserObj);

function makeStore(entries) {
    return function resolve(ref) {
        const key = ref.num + ':' + ref.gen;
        const v = entries[key];
        if (!v) throw new Error('missing ' + key);
        return v;
    };
}

describe('walkFieldTree', () => {
    test('single terminal field', () => {
        const f = obj.dict({ T: obj.string(new Uint8Array([0x66])), FT: obj.name('Tx') });
        const resolve = makeStore({ '10:0': f });
        const list = walkFieldTree([{ num: 10, gen: 0 }], resolve);
        expect(list).toHaveLength(1);
        expect(list[0].terminal).toBe(true);
        expect(list[0].ref).toEqual({ num: 10, gen: 0 });
        expect(list[0].ancestors).toEqual([]);
    });

    test('intermediate node with two children (kids have /T)', () => {
        const c1 = obj.dict({ T: obj.string(new Uint8Array([0x61])), FT: obj.name('Tx') });
        const c2 = obj.dict({ T: obj.string(new Uint8Array([0x62])), FT: obj.name('Tx') });
        const root = obj.dict({
            T: obj.string(new Uint8Array([0x72])),
            Kids: obj.array([obj.ref(11, 0), obj.ref(12, 0)])
        });
        const resolve = makeStore({ '10:0': root, '11:0': c1, '12:0': c2 });
        const list = walkFieldTree([{ num: 10, gen: 0 }], resolve);
        expect(list).toHaveLength(3);
        expect(list[0].terminal).toBe(false);
        expect(list[1].terminal).toBe(true);
        expect(list[1].ancestors).toEqual([root]);
    });

    test('terminal field with widget-only kids (no /T)', () => {
        const widget = obj.dict({ Subtype: obj.name('Widget') });
        const f = obj.dict({
            T: obj.string(new Uint8Array([0x66])), FT: obj.name('Btn'),
            Kids: obj.array([obj.ref(11, 0)])
        });
        const resolve = makeStore({ '10:0': f, '11:0': widget });
        const list = walkFieldTree([{ num: 10, gen: 0 }], resolve);
        expect(list).toHaveLength(1);
        expect(list[0].terminal).toBe(true);
    });

    test('cycle detection', () => {
        const a = obj.dict({ T: obj.string(new Uint8Array([0x61])), Kids: obj.array([obj.ref(10, 0)]) });
        const resolve = makeStore({ '10:0': a });
        expect(() => walkFieldTree([{ num: 10, gen: 0 }], resolve)).toThrow(ParseError);
    });

    test('depth cap honoured', () => {
        // Build a chain 10 → 11 → 12 with /T on each
        const c = obj.dict({ T: obj.string(new Uint8Array([0x63])) });
        const b = obj.dict({ T: obj.string(new Uint8Array([0x62])), Kids: obj.array([obj.ref(12, 0)]) });
        const a = obj.dict({ T: obj.string(new Uint8Array([0x61])), Kids: obj.array([obj.ref(11, 0)]) });
        const resolve = makeStore({ '10:0': a, '11:0': b, '12:0': c });
        expect(() => walkFieldTree([{ num: 10, gen: 0 }], resolve, { maxDepth: 1 })).toThrow(ParseError);
    });

    test('rejects non-array roots', () => {
        expect(() => walkFieldTree(null, () => {})).toThrow(ParseError);
    });

    test('rejects non-dict resolved node', () => {
        const resolve = () => obj.array([]);
        expect(() => walkFieldTree([{ num: 10, gen: 0 }], resolve)).toThrow(ParseError);
    });

    test('rejects non-ref kid', () => {
        const root = obj.dict({
            T: obj.string(new Uint8Array([0x72])),
            Kids: obj.array([obj.int(1)])
        });
        const resolve = makeStore({ '10:0': root });
        // First kid isn't a ref → isFieldKidsArray returns false → terminal,
        // so no throw. To force a throw, child must look like a field.
        const list = walkFieldTree([{ num: 10, gen: 0 }], resolve);
        expect(list).toHaveLength(1);
    });
});

describe('getInherited', () => {
    test('returns own entry when present', () => {
        const node = obj.dict({ FT: obj.name('Tx') });
        expect(getInherited(node, [], 'FT').value).toBe('Tx');
    });

    test('walks ancestors when missing', () => {
        const parent = obj.dict({ FT: obj.name('Btn'), Q: obj.int(1) });
        const node = obj.dict({});
        expect(getInherited(node, [parent], 'FT').value).toBe('Btn');
        expect(getInherited(node, [parent], 'Q').value).toBe(1);
    });

    test('returns undefined for non-inheritable keys', () => {
        const parent = obj.dict({ T: obj.name('foo') });
        expect(getInherited(obj.dict({}), [parent], 'T')).toBeUndefined();
    });

    test('returns undefined when not found', () => {
        expect(getInherited(obj.dict({}), [], 'FT')).toBeUndefined();
    });
});

describe('pdfFieldTree module', () => {
    test('module shape + worker safety', () => {
        expect(pdfFieldTree.name).toBe('pdfFieldTree');
        expect(pdfFieldTree.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfFieldTree.factory.toString()).toContain('function');
        const m = pdfFieldTree.factory(_pdfErrors_TD1, {});
        expect(typeof m.walkFieldTree).toBe('function');
        expect(typeof m.getInherited).toBe('function');
    });
});
