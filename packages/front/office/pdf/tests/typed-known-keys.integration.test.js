// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Entries the typers listed as known but never put in their record, now
 * typed as optional fields: each typer, given the entries with a
 * non-default value, returns exactly the new fields with those values;
 * given the same dictionary without them, it returns none of the new
 * fields (the record a document without them always had).
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras } from '../src/main.js';

const rt = new ModuleRuntime();
for (const m of [...fw_require, ...modules, ...extras]) rt.register(m);
const get = (name) => rt.resolve(name);

const enc = (s) => new TextEncoder().encode(s);
const name = (value) => ({ type: 'name', value });
const int = (value) => ({ type: 'int', value });
const real = (value) => ({ type: 'real', value });
const bool = (value) => ({ type: 'bool', value });
const str = (s) => ({ type: 'string', value: enc(s), syntax: 'lit' });
const ref = (num) => ({ type: 'ref', num, gen: 0 });
const dict = (entries = {}) => ({ type: 'dict', entries });
const arr = (...items) => ({ type: 'array', items });
const stream = (entries) => ({ type: 'stream', dict: dict(entries), raw: new Uint8Array([1, 2, 3]) });
const nul = { type: 'null' };

/**
 * `typer(make(base))` has none of `fields`; `typer(make({ ...base, ...more }))`
 * has the same keys plus exactly `fields`, with the values `expected` names.
 */
function check(typer, make, base, more, expected) {
    const without = typer(make(base));
    const withKeys = typer(make({ ...base, ...more }));
    const added = Object.keys(withKeys).filter((k) => !(k in without)).sort();
    expect(added).toEqual(Object.keys(expected).sort());
    for (const [k, v] of Object.entries(expected)) expect(withKeys[k]).toEqual(v);
    // a PDF null is the entry's absence
    const nulled = typer(make({ ...base, ...Object.fromEntries(Object.keys(more).map((k) => [k, nul])) }));
    expect(Object.keys(nulled).filter((k) => !(k in without))).toEqual([]);
}

describe('document layer', () => {
    test('page: the Table 31 entries the record had left out', () => {
        const t = get('pdfPage').typePage;
        const thumb = ref(9), b = arr(ref(10)), trans = dict({ S: name('Wipe') }), aa = dict({ O: ref(11) });
        const pi = dict(), sep = dict(), steps = ref(12), vp = arr(dict()), af = arr(ref(13)), oi = arr(dict()), dpart = ref(14), bci = dict();
        check(t, dict, { Type: name('Page') }, {
            LastModified: str('D:20261023'), BoxColorInfo: bci, Thumb: thumb, B: b, Dur: real(2.5),
            Trans: trans, AA: aa, PieceInfo: pi, StructParents: int(4), ID: str('id'), PZ: real(1.5),
            SeparationInfo: sep, TemplateInstantiated: name('T1'), PresSteps: steps, VP: vp, AF: af,
            OutputIntents: oi, DPart: dpart
        }, {
            lastModified: enc('D:20261023'), boxColorInfo: bci, thumb, b, dur: 2.5, trans, aa, pieceInfo: pi,
            structParents: 4, id: enc('id'), pz: 1.5, separationInfo: sep, templateInstantiated: 'T1',
            presSteps: steps, vp, af, outputIntents: oi, dPart: dpart
        });
    });

    test('catalog: the Table 29 entries the record had left out', () => {
        const t = get('pdfCatalog').typeCatalog;
        const v = (n) => dict({ N: int(n) });
        check(t, dict, { Type: name('Catalog'), Pages: ref(2) }, {
            Threads: arr(ref(3)), OpenAction: arr(ref(4), name('Fit')), AA: v(1), URI: v(2), SpiderInfo: v(3),
            PieceInfo: v(4), Perms: v(5), Legal: v(6), Requirements: arr(v(7)), Collection: v(8),
            NeedsRendering: bool(true), DSS: v(9), AF: arr(ref(5)), DPartRoot: ref(6)
        }, {
            threads: arr(ref(3)), openAction: arr(ref(4), name('Fit')), aa: v(1), uri: v(2), spiderInfo: v(3),
            pieceInfo: v(4), perms: v(5), legal: v(6), requirements: arr(v(7)), collection: v(8),
            needsRendering: true, dss: v(9), af: arr(ref(5)), dPartRoot: ref(6)
        });
    });
});

describe('form fields', () => {
    const common = { Parent: ref(20), Kids: arr(ref(21)), TU: str('Tool tip'), TM: str('export'), AA: dict({ K: ref(22) }) };
    const commonOut = { parent: ref(20), kids: arr(ref(21)), tu: enc('Tool tip'), tm: enc('export'), aa: dict({ K: ref(22) }) };

    test('text: the common entries and the rich value', () => {
        check(get('pdfTextField').typeTextField, dict, { FT: name('Tx') }, { ...common, RV: str('<body/>') },
            { ...commonOut, rv: enc('<body/>') });
        const rv = ref(30);
        expect(get('pdfTextField').typeTextField(dict({ FT: name('Tx'), RV: rv })).rv).toEqual(rv);
    });

    test('button: the common entries, DA and Q', () => {
        check(get('pdfButtonField').typeButtonField, dict, { FT: name('Btn') }, { ...common, DA: str('/Helv 0 Tf'), Q: int(2) },
            { ...commonOut, da: enc('/Helv 0 Tf'), q: 2 });
    });

    test('choice: the common entries', () => {
        check(get('pdfChoiceField').typeChoiceField, dict, { FT: name('Ch') }, common, commonOut);
    });

    test('signature: the common entries, DA, Q and DV', () => {
        const dv = dict({ Type: name('Sig') });
        check(get('pdfSignatureField').typeSignatureField, dict, { FT: name('Sig') },
            { ...common, DA: str('/Helv 0 Tf'), Q: int(1), DV: dv }, { ...commonOut, da: enc('/Helv 0 Tf'), q: 1, dv });
    });
});

describe('streams', () => {
    test('embedded file: Length, Filter, DecodeParms, DL', () => {
        const dp = dict({ Predictor: int(12) });
        check(get('pdfEmbeddedFile').typeEmbeddedFile, stream, { Type: name('EmbeddedFile') },
            { Length: int(3), Filter: name('FlateDecode'), DecodeParms: dp, DL: int(40) },
            { length: 3, filter: 'FlateDecode', decodeParms: dp, dl: 40 });
        const filters = arr(name('ASCIIHexDecode'), name('FlateDecode'));
        expect(get('pdfEmbeddedFile').typeEmbeddedFile(stream({ Filter: filters })).filter).toEqual(filters);
    });

    test('sound object: Type, Length, Filter, DecodeParms', () => {
        const dp = arr(dict());
        check(get('pdfLegacyDeprecatedAnnots').typeSoundStream, stream, { R: int(8000) },
            { Type: name('Sound'), Length: int(3), Filter: name('FlateDecode'), DecodeParms: dp },
            { type: 'Sound', length: 3, filter: 'FlateDecode', decodeParms: dp });
    });

    test('OpenType font file: Filter, DecodeParms', () => {
        const dp = dict({ Columns: int(4) });
        check(get('pdfFontColorTagging').typeFontFile3OpenType, stream, { Subtype: name('OpenType') },
            { Filter: name('FlateDecode'), DecodeParms: dp }, { filter: 'FlateDecode', decodeParms: dp });
    });
});

describe('files, parts, outline and security', () => {
    test('collection: Colors, Folders, Split', () => {
        const colors = dict({ Background: arr(int(1), int(1), int(1)) }), folders = ref(40), split = dict({ Direction: name('H') });
        check(get('pdfCollection').typeCollection, dict, {}, { Colors: colors, Folders: folders, Split: split },
            { colors, folders, split });
    });

    test('file specification: Type and Thumb', () => {
        const thumb = ref(41);
        check(get('pdfFileSpec').typeFileSpec, dict, { F: str('a.txt') }, { Type: name('Filespec'), Thumb: thumb },
            { type: 'Filespec', thumb });
    });

    test('document part: Start and End are page references (Table 408); an integer is kept', () => {
        const t = get('pdfDocumentParts').typeDPart;
        const r = t(dict({ Type: name('DPart'), Start: ref(50), End: ref(51) }));
        expect([r.start, r.end]).toEqual([{ num: 50, gen: 0 }, { num: 51, gen: 0 }]);
        expect(t(dict({ Start: int(0), End: int(3) })).start).toBe(0);
        expect(t(dict({})).start).toBeNull();
    });

    test('collection item, crypt filter, DocMDP parameters: Type', () => {
        const ci = get('pdfEmbeddedFilesPortfolio').typeCollectionItem;
        check(ci, dict, { Size: int(4) }, { Type: name('CollectionItem') }, { type: 'CollectionItem' });
        check(get('pdfSigAesGcm').typeCfEntry, dict, { CFM: name('AESV3') }, { Type: name('CryptFilter') }, { type: 'CryptFilter' });
        check(get('pdfMisc').typeDocMdpParams, dict, { P: int(2) }, { Type: name('TransformParams') }, { type: 'TransformParams' });
    });

    test('outline item: SE', () => {
        const se = ref(60);
        check(get('pdfOutline').typeOutlineItem, dict, { Title: str('Chapter') }, { SE: se }, { se });
    });
});
