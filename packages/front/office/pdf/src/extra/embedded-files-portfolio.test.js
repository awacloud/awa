// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfParserObj } from '../syntax/parser-obj.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
import { pdfEmbeddedFilesPortfolio } from './embedded-files-portfolio.js';

const u8 = (s) => new TextEncoder().encode(s);
const m = pdfEmbeddedFilesPortfolio.factory(_pdfErrors_TD1);

describe('extra/embedded-files-portfolio', () => {
    test('minimal empty Collection', () => {
        const r = m.typePortfolio(obj.dict({}));
        expect(r._extras).toEqual({});
    });

    test('reads /Schema, /D, /View, /Sort, /Navigator', () => {
        const r = m.typePortfolio(obj.dict({
            Type: obj.name('Collection'),
            Schema: obj.dict({
                FName: obj.dict({
                    Subtype: obj.name('F'),
                    N: obj.string(u8('File')),
                    O: obj.int(1),
                    V: obj.bool(true),
                    E: obj.bool(false)
                })
            }),
            D: obj.string(u8('main.pdf')),
            View: obj.name('T'),
            Sort: obj.dict({ S: obj.name('FName'), A: obj.bool(true) }),
            Navigator: obj.dict({ Foo: obj.int(1) })
        }));
        expect(r.initialDoc).toBeInstanceOf(Uint8Array);
        expect(r.view).toBe('T');
        expect(r.schema.fields.FName.subtype).toBe('F');
        expect(r.schema.fields.FName.order).toBe(1);
        expect(r.sort.keys).toEqual(['FName']);
        expect(r.sort.ascending).toEqual([true]);
        expect(r.navigator.raw.type).toBe('dict');
    });

    test('Navigator can be ref; CI custom icon', () => {
        const r = m.typePortfolio(obj.dict({ Navigator: obj.ref(7, 0) }));
        expect(r.navigator.ref.num).toBe(7);
        const ci = m.typeCustomIcon(obj.dict({}));
        expect(ci.raw.type).toBe('dict');
    });

    test('preserves unknown via _extras', () => {
        const r = m.typePortfolio(obj.dict({ Foo: obj.int(99) }));
        expect(r._extras.Foo.value).toBe(99);
    });

    test('Sort with array S/A', () => {
        const r = m.typePortfolio(obj.dict({
            Sort: obj.dict({
                S: obj.array([obj.name('A'), obj.name('B')]),
                A: obj.array([obj.bool(true), obj.bool(false)])
            })
        }));
        expect(r.sort.keys).toEqual(['A', 'B']);
        expect(r.sort.ascending).toEqual([true, false]);
    });

    test('rejects bad /View', () => {
        expect(() => m.typePortfolio(obj.dict({ View: obj.name('Z') }))).toThrow(ParseError);
    });

    test('rejects non-dict input', () => {
        expect(() => m.typePortfolio(obj.array([]))).toThrow(ParseError);
    });

    test('rejects bad /Schema field /Subtype', () => {
        expect(() => m.typePortfolio(obj.dict({
            Schema: obj.dict({ X: obj.dict({ Subtype: obj.name('Q') }) })
        }))).toThrow(ParseError);
    });

    test('rejects bad /Sort /S type', () => {
        expect(() => m.typePortfolio(obj.dict({
            Sort: obj.dict({ S: obj.int(1) })
        }))).toThrow(ParseError);
    });

    test('typeCollectionItem extracts CI custom icon', () => {
        const ci = m.typeCollectionItem(obj.dict({
            Type: obj.name('CollectionItem'),
            FName: obj.string(u8('a.txt')),
            CI: obj.dict({})
        }));
        expect(ci.fields.FName).toBeDefined();
        expect(ci.customIcon).toBeDefined();
    });

    test('rejects bad /CI', () => {
        expect(() => m.typeCustomIcon(obj.int(1))).toThrow(ParseError);
    });

    test('factory shape', () => {
        expect(pdfEmbeddedFilesPortfolio.name).toBe('pdfEmbeddedFilesPortfolio');
        expect(pdfEmbeddedFilesPortfolio.dependencies).toEqual(['pdfErrors']);
        expect(pdfEmbeddedFilesPortfolio.factory.toString()).toContain('function');
    });
});

// Malformed-input surface: every typed rejection carries its own error
// code, so the assertions pin the code and not merely the class — a
// mis-routed throw would still be a ParseError.
function code(fn) {
    try { fn(); } catch (e) { return e.code; }
    throw new Error('expected a throw, got none');
}

describe('extra/embedded-files-portfolio — /Schema rejections', () => {
    test('/Schema itself must be a dict', () => {
        expect(code(() => m.typeSchema(obj.array([]))))
            .toBe('pdf/portfolio/bad-schema');
        expect(() => m.typePortfolio(obj.dict({ Schema: obj.int(1) })))
            .toThrow(ParseError);
    });

    test('a /Schema field must be a dict', () => {
        expect(code(() => m.typeSchema(obj.dict({ FName: obj.int(3) }))))
            .toBe('pdf/portfolio/bad-schema-field');
    });

    test('/Subtype must be a name AND one of the eight known subtypes', () => {
        // Wrong node type — not just a wrong value.
        expect(code(() => m.typeSchemaField('F', obj.dict({ Subtype: obj.name('Q') }))))
            .toBe('pdf/portfolio/bad-schema-subtype');
        // Every advertised subtype is accepted.
        for (const s of m.SCHEMA_SUBTYPES) {
            expect(m.typeSchemaField('F', obj.dict({ Subtype: obj.name(s) })).subtype)
                .toBe(s);
        }
    });

    test('/N must be a string, /O an integer, /V and /E booleans', () => {
        expect(code(() => m.typeSchemaField('F', obj.dict({ N: obj.name('x') }))))
            .toBe('pdf/portfolio/bad-schema-n');
        expect(code(() => m.typeSchemaField('F', obj.dict({ O: obj.string(u8('1')) }))))
            .toBe('pdf/portfolio/bad-schema-o');
        expect(code(() => m.typeSchemaField('F', obj.dict({ V: obj.int(1) }))))
            .toBe('pdf/portfolio/bad-schema-v');
        expect(code(() => m.typeSchemaField('F', obj.dict({ E: obj.int(0) }))))
            .toBe('pdf/portfolio/bad-schema-e');
    });

    test('/O and /V accept falsy-but-present values (null-check, not truthiness)', () => {
        const f = m.typeSchemaField('F', obj.dict({
            O: obj.int(0), V: obj.bool(false), E: obj.bool(false)
        }));
        expect(f.order).toBe(0);
        expect(f.visible).toBe(false);
        expect(f.editable).toBe(false);
    });

    test('unknown field keys survive in _extras', () => {
        const f = m.typeSchemaField('F', obj.dict({ Subtype: obj.name('S'), Zz: obj.int(7) }));
        expect(f._extras.Zz.value).toBe(7);
        expect(f._extras.Subtype).toBeUndefined();
    });
});

describe('extra/embedded-files-portfolio — /Sort rejections', () => {
    test('/Sort itself must be a dict', () => {
        expect(code(() => m.typeSort(obj.array([]))))
            .toBe('pdf/portfolio/bad-sort');
    });

    test('/S array items must all be names', () => {
        expect(code(() => m.typeSort(obj.dict({
            S: obj.array([obj.name('A'), obj.int(2)])
        })))).toBe('pdf/portfolio/bad-sort-s-item');
    });

    test('/A must be a bool or an array of bools', () => {
        expect(code(() => m.typeSort(obj.dict({ A: obj.int(1) }))))
            .toBe('pdf/portfolio/bad-sort-a');
        expect(code(() => m.typeSort(obj.dict({
            A: obj.array([obj.bool(true), obj.name('x')])
        })))).toBe('pdf/portfolio/bad-sort-a-item');
    });

    test('/A accepts a bare false (null-check, not truthiness)', () => {
        expect(m.typeSort(obj.dict({ A: obj.bool(false) })).ascending).toEqual([false]);
    });

    test('non-S/A keys land in _extras', () => {
        expect(m.typeSort(obj.dict({ S: obj.name('A'), Zz: obj.int(1) }))._extras.Zz.value)
            .toBe(1);
    });
});

describe('extra/embedded-files-portfolio — top-level rejections', () => {
    test('/Navigator must be a dict or a ref', () => {
        expect(code(() => m.typeNavigator(obj.int(1))))
            .toBe('pdf/portfolio/bad-navigator');
        expect(m.typeNavigator(obj.ref(4, 2)).ref).toEqual({ num: 4, gen: 2 });
    });

    test('/Type, when present, must be /Collection', () => {
        expect(code(() => m.typePortfolio(obj.dict({ Type: obj.name('Catalog') }))))
            .toBe('pdf/portfolio/bad-type');
        // Right value but wrong node type is rejected by the same guard.
        expect(code(() => m.typePortfolio(obj.dict({ Type: obj.string(u8('Collection')) }))))
            .toBe('pdf/portfolio/bad-type');
    });

    test('/D must be a string', () => {
        expect(code(() => m.typePortfolio(obj.dict({ D: obj.name('main.pdf') }))))
            .toBe('pdf/portfolio/bad-d');
    });

    test('/View must be a name, and every advertised mode is accepted', () => {
        expect(code(() => m.typePortfolio(obj.dict({ View: obj.int(1) }))))
            .toBe('pdf/portfolio/bad-view');
        for (const v of m.VIEW_MODES) {
            expect(m.typePortfolio(obj.dict({ View: obj.name(v) })).view).toBe(v);
        }
    });

    test('/CI item must be a dict; a stream /CI icon is accepted', () => {
        expect(code(() => m.typeCollectionItem(obj.array([]))))
            .toBe('pdf/portfolio/ci-not-dict');
        const icon = m.typeCustomIcon({ type: 'stream', dict: obj.dict({}), raw: new Uint8Array(0) });
        expect(icon.raw.type).toBe('stream');
    });
});
