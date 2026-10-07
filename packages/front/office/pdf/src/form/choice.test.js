// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfChoiceField } from './choice.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfParserObj } from '../syntax/parser-obj.js';
const errors = _pdfErrors_TD1;
const { ParseError } = errors;
const parserObj = pdfParserObj.factory();
const { obj } = parserObj;
const { typeChoiceField } = pdfChoiceField.factory(errors, parserObj);

describe('typeChoiceField', () => {
    test('minimal list field', () => {
        const d = obj.dict({ FT: obj.name('Ch') });
        const c = typeChoiceField(d);
        expect(c.kind).toBe('list');
        expect(c.flags).toBe(0);
        expect(c.opt).toEqual([]);
        expect(c.v).toBeNull();
        expect(c.raw).toBe(d);
    });

    test('combo with edit + sort', () => {
        const flags = (1 << 17) | (1 << 18) | (1 << 19);
        const d = obj.dict({ FT: obj.name('Ch'), Ff: obj.int(flags) });
        const c = typeChoiceField(d);
        expect(c.kind).toBe('combo');
        expect(c.editable).toBe(true);
        expect(c.sort).toBe(true);
    });

    test('list with multi-select + commit-on-sel-change', () => {
        const flags = (1 << 21) | (1 << 26);
        const d = obj.dict({ FT: obj.name('Ch'), Ff: obj.int(flags) });
        const c = typeChoiceField(d);
        expect(c.multiSelect).toBe(true);
        expect(c.commitOnSelChange).toBe(true);
    });

    test('/Opt with strings and [export,display] pairs', () => {
        const s1 = new Uint8Array([0x41]);
        const s2a = new Uint8Array([0x42]);
        const s2b = new Uint8Array([0x62]);
        const d = obj.dict({
            FT: obj.name('Ch'),
            Opt: obj.array([
                obj.string(s1),
                obj.array([obj.string(s2a), obj.string(s2b)])
            ])
        });
        const c = typeChoiceField(d);
        expect(c.opt).toHaveLength(2);
        expect(c.opt[0].export).toBe(s1);
        expect(c.opt[1].export).toBe(s2a);
        expect(c.opt[1].display).toBe(s2b);
    });

    test('/V single string and array', () => {
        const s = new Uint8Array([0x41]);
        const d1 = obj.dict({ FT: obj.name('Ch'), V: obj.string(s) });
        expect(typeChoiceField(d1).v).toEqual([s]);
        const d2 = obj.dict({ FT: obj.name('Ch'), V: obj.array([obj.string(s)]) });
        expect(typeChoiceField(d2).v).toEqual([s]);
    });

    test('/I indices', () => {
        const d = obj.dict({ FT: obj.name('Ch'), I: obj.array([obj.int(0), obj.int(2)]) });
        expect(typeChoiceField(d).i).toEqual([0, 2]);
    });

    test('preserves unknown entries in _extras', () => {
        const d = obj.dict({ FT: obj.name('Ch'), Mystery: obj.int(1) });
        expect(typeChoiceField(d)._extras.Mystery.value).toBe(1);
    });

    test('rejects non-dict input', () => {
        expect(() => typeChoiceField(obj.array([]))).toThrow(ParseError);
    });

    test('rejects wrong /FT', () => {
        expect(() => typeChoiceField(obj.dict({ FT: obj.name('Tx') }))).toThrow(ParseError);
    });

    test('rejects malformed /Opt entry', () => {
        const d = obj.dict({ FT: obj.name('Ch'), Opt: obj.array([obj.int(0)]) });
        expect(() => typeChoiceField(d)).toThrow(ParseError);
    });

    test('rejects /Opt sub-array of wrong length', () => {
        const d = obj.dict({
            FT: obj.name('Ch'),
            Opt: obj.array([obj.array([obj.string(new Uint8Array([0x41]))])])
        });
        expect(() => typeChoiceField(d)).toThrow(ParseError);
    });

    test('rejects /V with non-stringy entry', () => {
        const d = obj.dict({ FT: obj.name('Ch'), V: obj.array([obj.int(0)]) });
        expect(() => typeChoiceField(d)).toThrow(ParseError);
    });
});

describe('pdfChoiceField module', () => {
    test('module shape + worker safety', () => {
        expect(pdfChoiceField.name).toBe('pdfChoiceField');
        expect(pdfChoiceField.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfChoiceField.factory.toString()).toContain('function');
        const m = pdfChoiceField.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeChoiceField).toBe('function');
    });
});
