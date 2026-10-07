// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfResources } from './resources.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfParserObj } from '../syntax/parser-obj.js';
const errors = _pdfErrors_TD1;
const { ParseError } = errors;
const parserObj = pdfParserObj.factory();
const { obj } = parserObj;
const { typeResources, resolvePageResources, lookupResource } = pdfResources.factory(errors, parserObj);

describe('typeResources', () => {
    test('null input → empty record', () => {
        const r = typeResources(null);
        expect(r.Font).toEqual({});
        expect(r.XObject).toEqual({});
    });

    test('extracts each category', () => {
        const dict = obj.dict({
            Font:    obj.dict({ F1: obj.ref(10, 0) }),
            XObject: obj.dict({ Im1: obj.ref(20, 0) }),
            ColorSpace: obj.dict({ CS1: obj.array([obj.name('ICCBased')]) }),
            ExtGState:  obj.dict({ GS1: obj.ref(30, 0) }),
            Pattern:    obj.dict({ P1: obj.ref(40, 0) }),
            Shading:    obj.dict({ Sh1: obj.ref(50, 0) }),
            ProcSet:    obj.array([obj.name('PDF'), obj.name('Text')])
        });
        const r = typeResources(dict);
        expect(r.Font.F1).toEqual({ type: 'ref', num: 10, gen: 0 });
        expect(r.XObject.Im1.num).toBe(20);
        expect(r.ColorSpace.CS1.type).toBe('array');
        expect(r.ExtGState.GS1.num).toBe(30);
        expect(r.Pattern.P1.num).toBe(40);
        expect(r.Shading.Sh1.num).toBe(50);
        expect(r.ProcSet).toEqual(['PDF', 'Text']);
    });

    test('rejects non-dict', () => {
        expect(() => typeResources(obj.array([]))).toThrow(ParseError);
    });

    test('rejects bad sub-dict', () => {
        const dict = obj.dict({ Font: obj.int(1) });
        expect(() => typeResources(dict)).toThrow(ParseError);
    });
});

describe('resolvePageResources', () => {
    function makeResolver(map) {
        return (ref) => map.get(ref.num + ':' + ref.gen);
    }

    test('uses page own Resources', () => {
        const page = obj.dict({
            Resources: obj.dict({ Font: obj.dict({ F1: obj.ref(10, 0) }) })
        });
        const r = resolvePageResources(page, () => null);
        expect(r.Font.F1.num).toBe(10);
    });

    test('walks parent chain', () => {
        const map = new Map();
        const root = obj.dict({
            Resources: obj.dict({ Font: obj.dict({ F1: obj.ref(99, 0) }) })
        });
        map.set('1:0', root);
        const page = obj.dict({ Parent: obj.ref(1, 0) });
        const r = resolvePageResources(page, makeResolver(map));
        expect(r.Font.F1.num).toBe(99);
    });

    test('resolves Resources passed as indirect ref', () => {
        const map = new Map();
        const resources = obj.dict({ Font: obj.dict({ F1: obj.ref(5, 0) }) });
        map.set('7:0', resources);
        const page = obj.dict({ Resources: obj.ref(7, 0) });
        const r = resolvePageResources(page, makeResolver(map));
        expect(r.Font.F1.num).toBe(5);
    });

    test('returns empty when nowhere found', () => {
        const page = obj.dict({});
        const r = resolvePageResources(page, () => null);
        expect(r.Font).toEqual({});
    });

    test('detects parent cycle', () => {
        const map = new Map();
        const a = obj.dict({ Parent: obj.ref(2, 0) });
        const b = obj.dict({ Parent: obj.ref(1, 0) });
        map.set('1:0', a); map.set('2:0', b);
        expect(() => resolvePageResources(a, makeResolver(map)))
            .toThrow(ParseError);
    });

    test('rejects bad /Resources shape', () => {
        const page = obj.dict({ Resources: obj.int(5) });
        expect(() => resolvePageResources(page, () => null))
            .toThrow(ParseError);
    });
});

describe('lookupResource', () => {
    const r = typeResources(obj.dict({
        Font: obj.dict({ F1: obj.ref(10, 0), F2: obj.dict({ Type: obj.name('Font') }) })
    }));

    test('returns inline entries directly', () => {
        expect(lookupResource(r, 'Font', 'F2').type).toBe('dict');
    });

    test('resolves indirect refs through callback', () => {
        const out = lookupResource(r, 'Font', 'F1', (ref) => {
            expect(ref.num).toBe(10);
            return obj.dict({ Type: obj.name('Font') });
        });
        expect(out.type).toBe('dict');
    });

    test('throws on missing name', () => {
        expect(() => lookupResource(r, 'Font', 'F99')).toThrow(ParseError);
    });

    test('throws on unknown category', () => {
        expect(() => lookupResource(r, 'NoSuch', 'F1')).toThrow(ParseError);
    });
});

describe('indirect resource categories (office/BATCH_41 task 05, BL-1546)', () => {
    // ISO 32000-2 §7.3.10: a category value may be an indirect reference.
    // Measured on a real document: every page's /ExtGState was indirect, and
    // rejecting it dropped the page's WHOLE resource map (fonts included).
    const store = new Map([
        ['7:0', obj.dict({ GS1: obj.ref(8, 0) })],
        ['9:0', obj.dict({ F1: obj.ref(10, 0) })],
        ['11:0', obj.nul()]
    ]);
    const resolveRef = (ref) => store.get(ref.num + ':' + ref.gen);

    test('typeResources resolves an indirect category through resolveRef', () => {
        const r = typeResources(obj.dict({
            Font: obj.ref(9, 0), ExtGState: obj.ref(7, 0)
        }), resolveRef);
        expect(r.Font.F1.num).toBe(10);
        expect(r.ExtGState.GS1.num).toBe(8);
    });

    test('a category ref resolving to null is treated as absent', () => {
        const r = typeResources(obj.dict({ Shading: obj.ref(11, 0) }), resolveRef);
        expect(r.Shading).toEqual({});
    });

    test('without a resolver an indirect category is still rejected', () => {
        expect(() => typeResources(obj.dict({ ExtGState: obj.ref(7, 0) })))
            .toThrow(ParseError);
    });

    test('resolvePageResources threads its resolver into the category typing', () => {
        const res = obj.dict({ Font: obj.dict({ F1: obj.ref(10, 0) }), ExtGState: obj.ref(7, 0) });
        const page = obj.dict({ Resources: obj.ref(12, 0) });
        const r = resolvePageResources(page, (ref) => (ref.num === 12 ? res : resolveRef(ref)));
        expect(r.Font.F1.num).toBe(10);
        expect(r.ExtGState.GS1.num).toBe(8);
    });
});

describe('pdfResources module', () => {
    test('module shape', () => {
        expect(pdfResources.name).toBe('pdfResources');
        expect(pdfResources.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfResources.factory.toString()).toContain('function');
        const m = pdfResources.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeResources).toBe('function');
        expect(typeof m.resolvePageResources).toBe('function');
        expect(typeof m.lookupResource).toBe('function');
    });
});
