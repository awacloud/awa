// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfOutline } from './outline.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfOutline_m = pdfOutline.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { walkOutline, typeOutlineItem } = _pdfOutline_m;

const u8 = (s) => new TextEncoder().encode(s);

function makeStore(map) {
    return (ref) => {
        const k = ref.num + ':' + ref.gen;
        if (!map[k]) throw new Error('missing ' + k);
        return map[k];
    };
}

describe('typeOutlineItem', () => {
    test('reads required + optional entries', () => {
        const d = obj.dict({
            Title: obj.string(u8('Hello')),
            Parent: obj.ref(1, 0),
            Count: obj.int(-3),
            C: obj.array([obj.real(1), obj.real(0), obj.real(0)]),
            F: obj.int(2),
            Custom: obj.int(9)
        });
        const r = typeOutlineItem(d);
        expect(r.title).toEqual(u8('Hello'));
        expect(r.parent).toEqual({ type: 'ref', num: 1, gen: 0 });
        expect(r.count).toBe(-3);
        expect(r.color).toEqual([1, 0, 0]);
        expect(r.F).toBe(2);
        expect(r._extras.Custom.value).toBe(9);
    });

    test('rejects non-dict', () => {
        expect(() => typeOutlineItem(obj.array([]))).toThrow(ParseError);
    });
    test('rejects missing title', () => {
        expect(() => typeOutlineItem(obj.dict({}))).toThrow(ParseError);
    });
});

describe('walkOutline', () => {
    test('empty root (no /First) returns []', () => {
        const r = walkOutline(obj.dict({}), () => null);
        expect(r).toEqual([]);
    });

    test('walks sibling chain depth-first', () => {
        // root.First → 10 → 11 ; 10.First → 12
        const map = {
            '10:0': obj.dict({
                Title: obj.string(u8('A')),
                First: obj.ref(12, 0),
                Next: obj.ref(11, 0)
            }),
            '11:0': obj.dict({ Title: obj.string(u8('B')) }),
            '12:0': obj.dict({ Title: obj.string(u8('A.1')) })
        };
        const root = obj.dict({ First: obj.ref(10, 0) });
        const r = walkOutline(root, makeStore(map));
        expect(r.map((x) => new TextDecoder().decode(x.title)))
            .toEqual(['A', 'A.1', 'B']);
        expect(r[0].ref).toEqual({ num: 10, gen: 0 });
    });

    test('detects cycles', () => {
        const map = {
            '10:0': obj.dict({
                Title: obj.string(u8('A')),
                Next: obj.ref(10, 0)
            })
        };
        expect(() => walkOutline(
            obj.dict({ First: obj.ref(10, 0) }), makeStore(map)
        )).toThrow(ParseError);
    });

    test('rejects non-dict root', () => {
        expect(() => walkOutline(obj.array([]), () => null)).toThrow(ParseError);
    });
    test('rejects non-ref First', () => {
        expect(() => walkOutline(
            obj.dict({ First: obj.int(1) }), () => null
        )).toThrow(ParseError);
    });
    test('rejects missing resolver', () => {
        expect(() => walkOutline(
            obj.dict({ First: obj.ref(1, 0) }), null
        )).toThrow(ParseError);
    });
});

describe('pdfOutline module', () => {
    test('module shape + worker safety', () => {
        expect(pdfOutline.name).toBe('pdfOutline');
        expect(pdfOutline.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfOutline.factory.toString()).toContain('function');
        const m = pdfOutline.factory(_pdfErrors_TD1, {});
        expect(typeof m.walkOutline).toBe('function');
        expect(typeof m.typeOutlineItem).toBe('function');
    });
});

const codeOfOut = (fn) => {
    try { fn(); } catch (e) { return e.code; }
    throw new Error('expected a throw, got none');
};

describe('walkOutline — traversal limits and malformed nodes', () => {
    test('maxDepth caps nesting and reports the offending depth', () => {
        // root → 10 → 11 → 12 (three levels of /First).
        const map = {
            '10:0': obj.dict({ Title: obj.string(u8('A')), First: obj.ref(11, 0) }),
            '11:0': obj.dict({ Title: obj.string(u8('A.1')), First: obj.ref(12, 0) }),
            '12:0': obj.dict({ Title: obj.string(u8('A.1.1')) })
        };
        const root = obj.dict({ First: obj.ref(10, 0) });
        expect(walkOutline(root, makeStore(map)).length).toBe(3);
        const e = (() => {
            try { walkOutline(root, makeStore(map), { maxDepth: 1 }); }
            catch (x) { return x; }
        })();
        expect(e).toBeInstanceOf(ParseError);
        expect(e.code).toBe('pdf/outline/max-depth');
        expect(e.context.maxDepth).toBe(1);
    });

    test('maxItems caps the collected item count', () => {
        const map = {
            '10:0': obj.dict({ Title: obj.string(u8('A')), Next: obj.ref(11, 0) }),
            '11:0': obj.dict({ Title: obj.string(u8('B')) })
        };
        const root = obj.dict({ First: obj.ref(10, 0) });
        expect(walkOutline(root, makeStore(map)).length).toBe(2);
        expect(codeOfOut(() => walkOutline(root, makeStore(map), { maxItems: 1 })))
            .toBe('pdf/outline/too-many');
    });

    test('a /Next that is not an indirect reference terminates the chain', () => {
        // typeOutlineItem only records /Next when it is a ref, so a
        // malformed sibling link ends the walk instead of throwing — the
        // walk-level `non-ref-sibling` guard is unreachable from here.
        const map = {
            '10:0': obj.dict({ Title: obj.string(u8('A')), Next: obj.dict({}) })
        };
        const r = walkOutline(obj.dict({ First: obj.ref(10, 0) }), makeStore(map));
        expect(r.length).toBe(1);
        expect(r[0].next).toBeUndefined();
    });

    test('a reference that does not resolve to a dictionary is rejected', () => {
        expect(codeOfOut(() => walkOutline(
            obj.dict({ First: obj.ref(10, 0) }), () => obj.array([]))))
            .toBe('pdf/outline/not-dict');
        expect(codeOfOut(() => walkOutline(
            obj.dict({ First: obj.ref(10, 0) }), () => null)))
            .toBe('pdf/outline/not-dict');
    });
});
