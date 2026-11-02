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

    test('the optional /Type /CollectionSchema is not a field (ISO 32000-2 Table 155)', () => {
        const schema = obj.dict({
            Type: obj.name('CollectionSchema'),
            Title: obj.dict({ Subtype: obj.name('S'), N: obj.string(u8('Title')) })
        });
        const s = m.typeSchema(schema);
        expect(Object.keys(s.fields)).toEqual(['Title']);
        expect(s.fields.Title.displayName).toEqual(u8('Title'));
        const p = m.typePortfolio(obj.dict({ Type: obj.name('Collection'), Schema: schema }));
        expect(Object.keys(p.schema.fields)).toEqual(['Title']);
        // a dictionary under the key Type is still a field definition
        expect(Object.keys(m.typeSchema(obj.dict({ Type: obj.dict({ Subtype: obj.name('S') }) })).fields))
            .toEqual(['Type']);
        // and a field that is neither a dict nor that /Type name still throws
        expect(code(() => m.typeSchema(obj.dict({ Type: obj.name('CollectionSchema'), F: obj.int(1) }))))
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

describe('collection parts and the /Type of a field and a sort (A39b)', () => {
    const { typeCollectionPart, COLLECTION_PART_KEYS, typeSchemaField: field, typeSort: sort } = pdfEmbeddedFilesPortfolio.factory(_pdfErrors_TD1);
    const { ContractError, ParseError: PE } = _pdfErrors_TD1;
    const u8 = (s) => new TextEncoder().encode(s);

    test('a folder: each key by its value or as read', () => {
        const f = typeCollectionPart(obj.dict({ Type: obj.name('Folder'), ID: obj.int(3), Name: obj.string(u8('Docs')), Parent: obj.ref(2, 0),
            CreationDate: obj.string(u8('D:2026')), Thumb: obj.stream(obj.dict({}), new Uint8Array()), Free: obj.array([]), Foo: obj.int(1) }), 'folder');
        expect([f.type, f.id, f.parent.type, f.thumb.type, f.free.type]).toEqual(['Folder', 3, 'ref', 'stream', 'array']);
        expect([f.name, f.creationdate]).toEqual([u8('Docs'), u8('D:2026')]);
        expect(f._extras).toEqual({ Foo: obj.int(1) });
    });

    test('colours, split, sub-item', () => {
        expect(typeCollectionPart(obj.dict({ Background: obj.array([]), PrimaryText: obj.name('x') }), 'colors')).toMatchObject({ background: { type: 'array' }, primarytext: null });
        expect(typeCollectionPart(obj.dict({ Direction: obj.name('H'), Position: obj.real(0.4) }), 'split')).toMatchObject({ direction: 'H', position: 0.4 });
        expect(typeCollectionPart(obj.dict({ D: obj.real(12), P: obj.string(u8('$')) }), 'subitem')).toMatchObject({ d: 12, p: u8('$') });
        expect(typeCollectionPart(obj.dict({ D: obj.string(u8('D:2026')) }), 'subitem').d).toEqual(u8('D:2026'));
        expect(Object.keys(COLLECTION_PART_KEYS).sort()).toEqual(['colors', 'folder', 'split', 'subitem']);
        const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };
        expect(code(() => typeCollectionPart(obj.array([]), 'folder'))).toEqual([PE.name, 'pdf/portfolio/part/not-dict']);
        expect(code(() => typeCollectionPart(obj.dict({}), 'navigator'))).toEqual([ContractError.name, 'pdf/portfolio/part/kind']);
    });

    test('a schema field and a sort read their /Type', () => {
        const fd = field('F', obj.dict({ Type: obj.name('CollectionField'), Subtype: obj.name('S') }));
        expect([fd.type, fd._extras]).toEqual(['CollectionField', {}]);
        const so = sort(obj.dict({ Type: obj.name('CollectionSort'), S: obj.name('F') }));
        expect([so.type, so._extras]).toEqual(['CollectionSort', {}]);
    });
});

describe('extra/embedded-files-portfolio — the navigator type and layout (A40c)', () => {
    test('type and layout, present only when the key is', () => {
        const nav = obj.dict({ Type: obj.name('Navigator'), Layout: obj.name('FilmStrip') });
        const r = m.typeNavigator(nav);
        expect([r.type, r.layout, r.raw, r.entries]).toEqual(['Navigator', 'FilmStrip', nav, nav.entries]);
        const list = obj.array([obj.name('D'), obj.name('T')]);
        expect(m.typeNavigator(obj.dict({ Layout: list })).layout).toBe(list);
        const bare = m.typeNavigator(obj.dict({}));
        expect(['type' in bare, 'layout' in bare]).toEqual([false, false]);
        expect(m.typeNavigator(obj.dict({ Layout: obj.int(1) })).layout).toBe(null);
    });
});

describe('extra/embedded-files-portfolio — the file parts and targets (A40e)', () => {
    const { ContractError } = _pdfErrors_TD1;
    const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };
    test('EF, RF, Mac, target', () => {
        const st = obj.ref(6, 0);
        const ef = m.typeFilePart(obj.dict({ F: st, UF: st, Foo: obj.int(1) }), 'ef');
        expect([ef.f, ef.uf, ef._extras]).toEqual([st, st, { Foo: obj.int(1) }]);
        const rf = m.typeFilePart(obj.dict({ F: obj.array([]), UF: obj.array([]) }), 'rf');
        expect([rf.f.type, rf.uf.type]).toEqual(['array', 'array']);
        const mac = m.typeFilePart(obj.dict({ Subtype: obj.int(1), Creator: obj.int(2), ResFork: st }), 'mac');
        expect([mac.subtype, mac.creator, mac.resfork]).toEqual([1, 2, st]);
        const t = m.typeFilePart(obj.dict({ R: obj.name('C'), N: obj.string(u8('a.pdf')), P: obj.int(0), A: obj.string(u8('note')), T: obj.dict({}) }), 'target');
        expect([t.r, t.n, t.p, t.a, t.t.type]).toEqual(['C', u8('a.pdf'), 0, u8('note'), 'dict']);
        expect(m.typeFilePart(obj.dict({ P: obj.string(u8('dest')), A: obj.int(2) }), 'target')).toMatchObject({ p: u8('dest'), a: 2 });
        expect(m.typeFilePart(obj.dict({ R: obj.int(1) }), 'target').r).toBe(null);
    });
    test('every kind of FILE_PART_KEYS types every key of its list; errors', () => {
        expect(Object.keys(m.FILE_PART_KEYS).sort()).toEqual(['ef', 'mac', 'rf', 'target']);
        for (const [kind, keys] of Object.entries(m.FILE_PART_KEYS)) {
            const entries = {};
            for (const k of keys) entries[k] = obj.ref(1, 0);
            expect(m.typeFilePart(obj.dict(entries), kind)._extras).toEqual({});
        }
        expect(code(() => m.typeFilePart(obj.array([]), 'ef'))).toEqual([ParseError.name, 'pdf/portfolio/file-part/not-dict']);
        expect(code(() => m.typeFilePart(obj.dict({}), 'EF'))).toEqual([ContractError.name, 'pdf/portfolio/file-part/kind']);
    });
});
