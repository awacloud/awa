// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Writer conformance against the vendored Arlington PDF
 * Model (`_fixtures/arlington/`, `tsv/latest`), through the shared harness
 * `_helpers/arlington-write.js`.
 *
 * Three layers:
 *   1. The predicate evaluator and the value checks, form by form.
 *   2. The walk and the case rules on a small hand-written model and a
 *      stand-in object graph (inputs to the checker, not documents
 *      measured): link choice, required, inherited and unknown keys,
 *      types, possible values, extension keys, objects visited once.
 *   3. The measure over the documents the package's writers emit, pinned:
 *      the score and every failing case with its reason.
 *
 * Integrity of the vendored files is the read-keys test's own layer 1.
 *
 * @module pdf/tests/arlington-write-conformance.integration
 */

import { describe, test, expect } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadModel, parseTsv } from './_helpers/arlington.js';
import {
    PDF_VERSION, checkDocument, checkDocuments, chooseLink, evaluate, listItem, literalEquals,
    pdfDocuments, pdfRuntime, typeMatches
} from './_helpers/arlington-write.js';

const TSV = join(fileURLToPath(new URL('_fixtures/arlington/', import.meta.url)), 'vendor', 'tsv');

const enc = (s) => new TextEncoder().encode(s);
const name = (value) => ({ type: 'name', value });
const int = (value) => ({ type: 'int', value });
const str = (s) => ({ type: 'string', value: enc(s), syntax: 'lit' });
const arr = (...items) => ({ type: 'array', items });
const dict = (entries) => ({ type: 'dict', entries });
const ref = (num) => ({ type: 'ref', num, gen: 0 });
const stream = (entries) => ({ type: 'stream', dict: dict(entries), raw: new Uint8Array(0) });
const noResolve = () => { throw new Error('no reference expected'); };

describe('the predicate evaluator (PDF 2.0)', () => {
    test('the version the measure is for', () => {
        expect(PDF_VERSION).toBe(2.0);
    });

    test.each([
        ['TRUE', true], ['FALSE', false], ['1.0', true], ['2.0', true], ['2.1', false],
        ['fn:IsRequired(fn:SinceVersion(2.0) || fn:NotStandard14Font())', true],
        ['fn:IsRequired(fn:IsPDFVersion(1.0))', false],
        ['fn:IsRequired(fn:SinceVersion(2.0))', true],
        ['fn:IsRequired(fn:BeforeVersion(2.0))', false],
        ['fn:IsRequired(fn:BeforeVersion(2.1))', true],
        ['fn:Eval(fn:Extension(ADBE_Extn3,1.7) || 2.0)', true],
        ['fn:Extension(ISO_21812,2.0)', false],
        ['fn:Deprecated(1.4,TRUE)', true],
        ['fn:IsRequired(fn:IsPresent(PieceInfo))', null],
        ['fn:IsRequired(fn:SinceVersion(1.4,fn:IsPresent(trailer::Catalog::PieceInfo)))', null],
        ['fn:IsRequired(fn:SinceVersion(2.1,fn:IsPresent(X)))', false],
        ['fn:IsRequired(fn:IsPresent(A) && fn:IsPDFVersion(1.0))', false],
        ['fn:IsRequired(fn:IsPresent(A) || fn:IsPresent(B))', null],
        ['(TRUE) && (fn:SinceVersion(1.5))', true],
        ['fn:Eval(@Size>0)', null],
        ['', null]
    ])('%s gives %p', (expr, want) => {
        expect(evaluate(expr)).toBe(want);
    });

    test.each([
        ['Font', { value: 'Font', valid: true }],
        ['fn:SinceVersion(1.2,FontType0)', { value: 'FontType0', valid: true }],
        ['fn:SinceVersion(2.1,Future)', { value: 'Future', valid: false }],
        ['fn:Deprecated(1.4,LZWDecode)', { value: 'LZWDecode', valid: true }],
        ['fn:IsPDFVersion(1.0,MacExpertEncoding)', { value: 'MacExpertEncoding', valid: false }],
        ['fn:BeforeVersion(2.0,Old)', { value: 'Old', valid: false }],
        ['fn:Extension(ADBE_Extn3,Acme)', { value: 'Acme', valid: false }],
        ['fn:RequiredValue(@Subtype==Image,DeviceRGB)', { value: 'DeviceRGB', valid: true }],
        ['fn:Eval(@Size>0)', { value: null, valid: null }],
        ['@Size', { value: null, valid: true }]
    ])('list item %s', (token, want) => {
        expect(listItem(token)).toEqual(want);
    });

    test('types: rectangles and matrices hold numbers, ASCII strings hold bytes under 0x80, dates follow 7.9.4', () => {
        expect(typeMatches('rectangle', arr(int(0), int(0), { type: 'real', value: 1.5 }, int(9)), noResolve)).toBe(true);
        expect(typeMatches('rectangle', arr(int(0), int(0), name('x'), int(9)), noResolve)).toBe(false);
        expect(typeMatches('rectangle', arr(int(0), int(0), int(9)), noResolve)).toBe(false);
        expect(typeMatches('matrix', arr(...[1, 0, 0, 1, 0, 0].map(int)), noResolve)).toBe(true);
        expect(typeMatches('rectangle', arr(int(0), int(0), int(1), ref(7)), (r) => (r.num === 7 ? int(5) : null))).toBe(true);
        expect(typeMatches('string-ascii', str('Adobe'), noResolve)).toBe(true);
        expect(typeMatches('string-ascii', { type: 'string', value: new Uint8Array([0x41, 0xe9]) }, noResolve)).toBe(false);
        expect(typeMatches('string-ascii', name('Adobe'), noResolve)).toBe(false);
        expect(typeMatches('date', str('D:20261014120000Z'), noResolve)).toBe(true);
        expect(typeMatches('date', str("D:20261014120000+02'00"), noResolve)).toBe(true);
        expect(typeMatches('date', str('D:2026'), noResolve)).toBe(true);
        expect(typeMatches('date', str('2026-10-14'), noResolve)).toBe(false);
        expect(typeMatches('number', int(3), noResolve)).toBe(true);
        expect(typeMatches('integer', { type: 'real', value: 3.5 }, noResolve)).toBe(false);
        expect(typeMatches('stream', dict({}), noResolve)).toBe(false);
        expect(typeMatches('name-tree', dict({}), noResolve)).toBe(true);
    });

    test('literals compare by type', () => {
        expect(literalEquals(name('Font'), 'Font')).toBe(true);
        expect(literalEquals(str('Font'), 'Font')).toBe(true);
        expect(literalEquals(int(2), '2')).toBe(true);
        expect(literalEquals({ type: 'real', value: 0.5 }, '0.5')).toBe(true);
        expect(literalEquals({ type: 'bool', value: false }, 'false')).toBe(true);
        expect(literalEquals(int(2), 'Font')).toBe(false);
        expect(literalEquals(arr(), '[]')).toBe(false);
    });
});

// A hand-written model in the Arlington columns (tab-separated).
const HEADER = 'Key\tType\tSinceVersion\tDeprecatedIn\tRequired\tIndirectReference\tInheritable\tDefaultValue\tPossibleValues\tSpecialCase\tLink\tNote';
const row = (...cells) => cells.join('\t');
const STAND_IN = {
    FileTrailer: [
        row('Root', 'dictionary', '1.0', '', 'TRUE', 'TRUE', 'FALSE', '', '', '', '[Catalog]', ''),
        row('ID', 'array', '1.1', '', 'fn:IsRequired(fn:SinceVersion(2.0) || fn:IsPresent(Encrypt))', 'FALSE', 'FALSE', '', '', '', '', ''),
        row('Mode', 'integer', '1.0', '', 'FALSE', 'FALSE', 'FALSE', '', '[1,2]', '', '', ''),
        row('Ext', 'name', 'fn:Extension(ACME,1.7)', '', 'FALSE', 'FALSE', 'FALSE', '', '', '', '', ''),
        row('Info', 'dictionary', '1.0', '', 'fn:IsRequired(fn:IsPresent(Root::Pieces))', 'FALSE', 'FALSE', '', '', '', '', ''),
        row('Alt', 'integer;fn:Extension(ACME,name)', '1.0', '', 'FALSE', 'FALSE', 'FALSE', '', '', '', '', '')
    ],
    XRefStream: [row('Root', 'dictionary', '1.5', '', 'TRUE', 'TRUE', 'FALSE', '', '', '', '[Catalog]', '')],
    Catalog: [
        row('Type', 'name', '1.0', '', 'TRUE', 'FALSE', 'FALSE', '', '[Catalog]', '', '', ''),
        row('Kids', 'array', '1.0', '', 'TRUE', 'FALSE', 'FALSE', '', '', '', '[ArrayOfKids]', ''),
        row('Style', 'name', '1.0', '', 'FALSE', 'FALSE', 'FALSE', '', '[fn:Deprecated(1.4,Old),fn:Extension(ACME,Acme),New]', '', '', ''),
        row('Size', 'integer', '1.0', '', 'FALSE', 'FALSE', 'FALSE', '', '[fn:Eval(@Size>0)]', '', '', ''),
        row('Pairs', 'array', '1.0', '', 'FALSE', 'FALSE', 'FALSE', '', '', '', '[ArrayOfPairs]', '')
    ],
    ArrayOfKids: [row('*', 'dictionary', '1.0', '', 'FALSE', 'TRUE', 'FALSE', '', '', '', '[Node,Leaf]', '')],
    // a repeated group of positions: a name, then a leaf
    ArrayOfPairs: [
        row('0*', 'name', '1.0', '', 'FALSE', 'FALSE', 'FALSE', '', '', '', '', ''),
        row('1*', 'dictionary', '1.0', '', 'FALSE', 'TRUE', 'FALSE', '', '', '', '[Leaf]', '')
    ],
    Node: [
        row('Type', 'name', '1.0', '', 'TRUE', 'FALSE', 'FALSE', '', '[Node]', '', '', ''),
        row('Kids', 'array', '1.0', '', 'TRUE', 'FALSE', 'FALSE', '', '', '', '[ArrayOfKids]', ''),
        row('Box', 'rectangle', '1.0', '', 'FALSE', 'FALSE', 'TRUE', '', '', '', '', '')
    ],
    Leaf: [
        row('Type', 'name', '1.0', '', 'TRUE', 'FALSE', 'FALSE', '', '[Leaf]', '', '', ''),
        row('Box', 'rectangle', '1.0', '', 'TRUE', 'FALSE', 'TRUE', '', '', '', '', ''),
        row('Parent', 'dictionary', '1.0', '', 'TRUE', 'TRUE', 'FALSE', '', '', '', '[Node]', ''),
        row('Data', 'stream', '1.0', '', 'FALSE', 'TRUE', 'FALSE', '', '', '', '[Data]', ''),
        // any other key: an integer
        row('*', 'integer', '1.0', '', 'FALSE', 'FALSE', 'FALSE', '', '', '', '', '')
    ],
    Data: [
        row('Length', 'integer', '1.0', '', 'TRUE', 'FALSE', 'FALSE', '', '', '', '', ''),
        row('Filter', 'name', '1.0', '', 'FALSE', 'FALSE', 'FALSE', '', '[FlateDecode,LZWDecode]', '', '', ''),
        row('DecodeParms', 'dictionary', '1.0', '', 'FALSE', 'FALSE', 'FALSE', '', '', '', '[FilterLZWDecode,FilterFlateDecode]', '')
    ],
    // link-choice pairs: A knows more of {a, b}; D, through its * row, has no unknown key in {a, z}
    PickA: [row('a', 'integer', '1.0', '', 'FALSE', 'FALSE', 'FALSE', '', '', '', '', ''),
        row('b', 'integer', '1.0', '', 'FALSE', 'FALSE', 'FALSE', '', '', '', '', ''),
        row('*', 'integer', '1.0', '', 'FALSE', 'FALSE', 'FALSE', '', '', '', '', '')],
    PickB: [row('a', 'integer', '1.0', '', 'FALSE', 'FALSE', 'FALSE', '', '', '', '', ''),
        row('*', 'integer', '1.0', '', 'FALSE', 'FALSE', 'FALSE', '', '', '', '', '')],
    PickC: [row('a', 'integer', '1.0', '', 'FALSE', 'FALSE', 'FALSE', '', '', '', '', '')],
    PickD: [row('a', 'integer', '1.0', '', 'FALSE', 'FALSE', 'FALSE', '', '', '', '', ''),
        row('*', 'integer', '1.0', '', 'FALSE', 'FALSE', 'FALSE', '', '', '', '', '')],
    FilterLZWDecode: [row('Predictor', 'integer', '1.0', '', 'FALSE', 'FALSE', 'FALSE', '', '', '', '', '')],
    FilterFlateDecode: [row('Predictor', 'integer', '1.0', '', 'FALSE', 'FALSE', 'FALSE', '', '', '', '', '')]
};
const standIn = new Map(Object.entries(STAND_IN).map(([n, rows]) => [n, parseTsv(n, [HEADER, ...rows].join('\n'))]));
standIn.get('ArrayOfKids').kind = 'array';
standIn.get('ArrayOfPairs').kind = 'array';

/** A conforming stand-in graph; `edit` changes the objects before the check. */
function graph(edit = () => {}) {
    const objects = {
        trailer: dict({ Root: ref(1), ID: arr(str('a'), str('a')) }),
        1: dict({ Type: name('Catalog'), Kids: arr(ref(2)) }),
        2: dict({ Type: name('Node'), Kids: arr(ref(3)), Box: arr(int(0), int(0), int(10), int(10)) }),
        3: dict({ Type: name('Leaf'), Parent: ref(2), Data: ref(4) }),
        4: stream({ Length: int(1), Filter: name('FlateDecode'), DecodeParms: dict({ Predictor: int(12) }) })
    };
    edit(objects);
    return objects;
}
/** A stand-in `pdf` API reading the graph back; object 13 cannot be resolved (it throws). */
const standInPdf = (objects, kind) => ({
    read: () => ({
        _raw: {
            resolve: (r) => {
                if (r.num === 13) throw new Error('damaged object');
                return objects[r.num];
            }
        },
        xref: { sections: [{ kind }] },
        trailer: { raw: objects.trailer }
    })
});
const check = (edit, kind = 'table') => {
    const objects = graph(edit);
    return checkDocument(standIn, { id: 'doc', bytes: new Uint8Array(0) }, standInPdf(objects, kind));
};
const failures = (r) => r.cases.filter((c) => !c.ok).map((c) => [c.case, c.detail]);

describe('the walk and the case rules, on a stand-in model', () => {
    test('a conforming graph: every key passes, each object visited once, the right links', () => {
        const r = check();
        expect(failures(r)).toEqual([]);
        expect(r.cases).toHaveLength(14);
        expect(r.objects).toEqual([
            'doc trailer FileTrailer', 'doc 1 0 R Catalog', 'doc 2 0 R Node', 'doc 3 0 R Leaf',
            'doc 4 0 R Data', 'doc 4 0 R/DecodeParms FilterFlateDecode'
        ]);
        // the inherited Box gives no case; the absent Info under a predicate is skipped
        expect(r.cases.map((c) => c.case)).not.toContain('doc 3 0 R Leaf/Box');
        expect(r.skipped).toEqual([{ case: 'doc trailer FileTrailer/Info', reason: 'absent; required by a predicate not evaluated (fn:IsRequired(fn:IsPresent(Root::Pieces)))' }]);
        expect(r.unevaluated).toEqual([]);
    });

    test('a required key absent fails; one inherited from no ancestor too', () => {
        expect(failures(check((o) => { delete o.trailer.entries.ID; }))).toEqual([['doc trailer FileTrailer/ID', 'required, absent']]);
        expect(failures(check((o) => { delete o[2].entries.Box; }))).toEqual([['doc 3 0 R Leaf/Box', 'required, absent']]);
    });

    test('an unknown key, a wrong type, a value outside the literals, an extension key', () => {
        expect(failures(check((o) => { o.trailer.entries.Bogus = int(1); }))).toEqual([['doc trailer FileTrailer/Bogus', 'not a key of FileTrailer']]);
        expect(failures(check((o) => { o.trailer.entries.Mode = name('x'); }))).toEqual([['doc trailer FileTrailer/Mode', 'a name, the model types it integer']]);
        expect(failures(check((o) => { o.trailer.entries.Mode = int(3); }))).toEqual([['doc trailer FileTrailer/Mode', 'value 3 is not among 1, 2']]);
        expect(failures(check((o) => { o.trailer.entries.Mode = int(2); }))).toEqual([]);
        expect(failures(check((o) => { o.trailer.entries.Ext = name('x'); }))).toEqual([
            ['doc trailer FileTrailer/Ext', 'not ISO 32000-2 for PDF 2.0 (SinceVersion fn:Extension(ACME,1.7))']
        ]);
    });

    test('possible values: deprecated passes, extension-only fails, a predicate is counted as not evaluated', () => {
        expect(failures(check((o) => { o[1].entries.Style = name('Old'); }))).toEqual([]);
        expect(failures(check((o) => { o[1].entries.Style = name('Acme'); }))).toEqual([['doc 1 0 R Catalog/Style', 'value /Acme is not valid in PDF 2.0']]);
        expect(failures(check((o) => { o[1].entries.Style = name('Zzz'); }))).toEqual([['doc 1 0 R Catalog/Style', 'value /Zzz is not among Old, Acme, New']]);
        const r = check((o) => { o[1].entries.Size = int(5); });
        expect(failures(r)).toEqual([]);
        expect(r.unevaluated).toEqual(['doc 1 0 R Catalog/Size']);
    });

    test('a reference to a missing or unresolvable object is the null object', () => {
        expect(failures(check((o) => { o.trailer.entries.Root = ref(9); }))).toEqual([['doc trailer FileTrailer/Root', 'a null, the model types it dictionary']]);
        expect(failures(check((o) => { o.trailer.entries.Root = ref(13); }))).toEqual([['doc trailer FileTrailer/Root', 'a null, the model types it dictionary']]);
    });

    test('a type valid only as an extension fails; the 2.0 alternative passes', () => {
        expect(failures(check((o) => { o.trailer.entries.Alt = int(1); }))).toEqual([]);
        expect(failures(check((o) => { o.trailer.entries.Alt = name('x'); }))).toEqual([
            ['doc trailer FileTrailer/Alt', 'a name, a type not valid in PDF 2.0 (integer;fn:Extension(ACME,name))']
        ]);
    });

    test('a key matched by the object\'s * row is checked against it', () => {
        expect(failures(check((o) => { o[3].entries.Custom = int(1); }))).toEqual([]);
        expect(failures(check((o) => { o[3].entries.Custom = name('x'); }))).toEqual([['doc 3 0 R Leaf/Custom', 'a name, the model types it integer']]);
    });

    test('array positions of a repeated group lead to their own rows\' links', () => {
        const r = check((o) => {
            o[1].entries.Pairs = arr(name('a'), ref(3), name('b'), ref(5));
            o[5] = dict({ Type: name('Leaf'), Parent: ref(2) });
        });
        expect(failures(r)).toEqual([]);
        expect(r.objects).toContain('doc 5 0 R Leaf');
    });

    test('a cross-reference stream trailer is checked as XRefStream', () => {
        const r = check((o) => { delete o.trailer.entries.ID; }, 'stream');
        expect(r.objects[0]).toBe('doc trailer XRefStream');
        expect(failures(r)).toEqual([]);
    });

    test('link choice: the literal-valued required keys decide, then the known keys', () => {
        const none = () => { throw new Error('unused'); };
        expect(chooseLink(standIn, ['Node', 'Leaf'], dict({ Type: name('Leaf') }), none)).toBe('Leaf');
        expect(chooseLink(standIn, ['Node', 'Leaf'], dict({ Type: name('Node') }), none)).toBe('Node');
        // no Type: neither fits, Leaf knows more of the keys
        expect(chooseLink(standIn, ['Node', 'Leaf'], dict({ Box: arr(), Parent: ref(2), Data: ref(4) }), none)).toBe('Leaf');
        expect(chooseLink(standIn, ['Node'], dict({}), none)).toBe('Node');
        expect(chooseLink(standIn, ['Missing', 'Node'], dict({}), none)).toBe('Node');
        expect(chooseLink(standIn, ['Missing'], dict({}), none)).toBe(null);
        // each score term alone: the keys a candidate knows, its unknown keys
        expect(chooseLink(standIn, ['PickB', 'PickA'], dict({ a: int(1), b: int(1) }), none)).toBe('PickA');
        expect(chooseLink(standIn, ['PickC', 'PickD'], dict({ a: int(1), z: int(1) }), none)).toBe('PickD');
        // a Kids entry typed Leaf by its Type is checked as a Leaf
        const r = check((o) => { o[2].entries.Kids = arr(ref(3)); o[3].entries.Type = name('Node'); });
        expect(r.objects).toContain('doc 3 0 R Node');
    });

    test('decode parameters follow the stream\'s own filter', () => {
        expect(check((o) => { o[4].dict.entries.Filter = name('LZWDecode'); }).objects).toContain('doc 4 0 R/DecodeParms FilterLZWDecode');
        // without a filter the candidates tie: the first
        expect(check((o) => { delete o[4].dict.entries.Filter; }).objects).toContain('doc 4 0 R/DecodeParms FilterLZWDecode');
    });
});

// Every case the package's writers fail today (2026-10-14, after the
// CIDSystemInfo strings fix and the derived /ID): the Standard 14 faces
// written without the opt-in metrics, with their reason.
const FAILING = [
    ['builder-standard-14 2 0 R FontType1/FirstChar', 'required, absent'],
    ['builder-standard-14 2 0 R FontType1/LastChar', 'required, absent'],
    ['builder-standard-14 2 0 R FontType1/Widths', 'required, absent'],
    ['builder-standard-14 2 0 R FontType1/FontDescriptor', 'required, absent'],
    ['builder-standard-14 3 0 R FontType1/FirstChar', 'required, absent'],
    ['builder-standard-14 3 0 R FontType1/LastChar', 'required, absent'],
    ['builder-standard-14 3 0 R FontType1/Widths', 'required, absent'],
    ['builder-standard-14 3 0 R FontType1/FontDescriptor', 'required, absent'],
    ['write-standard-14 2 0 R FontType1/FirstChar', 'required, absent'],
    ['write-standard-14 2 0 R FontType1/LastChar', 'required, absent'],
    ['write-standard-14 2 0 R FontType1/Widths', 'required, absent'],
    ['write-standard-14 2 0 R FontType1/FontDescriptor', 'required, absent'],
    ['write-standard-14 3 0 R FontType1/FirstChar', 'required, absent'],
    ['write-standard-14 3 0 R FontType1/LastChar', 'required, absent'],
    ['write-standard-14 3 0 R FontType1/Widths', 'required, absent'],
    ['write-standard-14 3 0 R FontType1/FontDescriptor', 'required, absent']
];

describe('the measure over the package\'s writers', () => {
    const rt = pdfRuntime();
    const docs = pdfDocuments(rt);
    const model = loadModel(TSV);
    const r = checkDocuments(model, docs, rt.resolve('pdf'));

    test('the documents: pdfBuilder from scratch and pdf.write of a read, %PDF-2.0, reproducible', () => {
        expect(docs.map((d) => [d.id, d.writer])).toEqual([
            ['builder-blank', 'pdfBuilder'], ['builder-standard-14', 'pdfBuilder'],
            ['builder-standard-14-metrics', 'pdfBuilder'], ['builder-embedded', 'pdfBuilder'],
            ['builder-image', 'pdfBuilder'], ['write-standard-14', 'pdf.write'], ['write-embedded', 'pdf.write']
        ]);
        for (const d of docs) expect(new TextDecoder().decode(d.bytes.subarray(0, 8))).toBe('%PDF-2.0');
        const again = pdfDocuments(rt);
        expect(again.map((d) => Array.from(d.bytes))).toEqual(docs.map((d) => Array.from(d.bytes)));
    });

    test('every object the walk reaches, by Arlington name', () => {
        const kinds = {};
        for (const o of r.objects) {
            const k = o.slice(o.lastIndexOf(' ') + 1);
            kinds[k] = (kinds[k] || 0) + 1;
        }
        expect(kinds).toEqual({
            CIDSystemInfo: 2, Catalog: 7, DocInfo: 2, FileTrailer: 7, FontCIDType2: 2, FontDescriptorCIDType2: 2,
            FontDescriptorTrueType: 2, FontDescriptorType1: 3, FontFile2: 4, FontTrueType: 2, FontType0: 2, FontType1: 7,
            PageObject: 9, PageTreeNodeRoot: 7, Resource: 9, Stream: 8, ToUnicodeCMapStream: 4, XObjectImage: 1,
            XObjectImageSoftMask: 1
        });
    });

    test('the score and every failing case', () => {
        expect(r.cases.filter((c) => c.ok).length).toBe(327);
        expect(r.cases.length).toBe(343);
        expect(failures(r)).toEqual(FAILING);
        expect(r.skipped.length).toBe(33);
        expect(r.unevaluated.length).toBe(23);
    });
});
