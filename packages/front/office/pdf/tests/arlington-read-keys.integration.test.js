// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Read-model key coverage against the vendored Arlington PDF
 * Model (`_fixtures/arlington/`, `tsv/latest`: ISO 32000-2:2020 with its
 * errata), through the shared harness `_helpers/arlington.js`.
 *
 * Four layers:
 *   1. Integrity — every `MANIFEST.json` entry is on disk with its byte
 *      count and SHA-256, nothing unlisted.
 *   2. The model as read — object kinds, the value builder's shapes.
 *   3. The handled test itself, on stand-in typers (the `_extras` rule, the
 *      no-`_extras` differential, a throw, several typers for one object).
 *   4. The measure over the package's typers, pinned: the score, the bound
 *      and unbound object counts, and every typer that throws on the
 *      dictionary built for its object, with the reason.
 *
 * Only committed bytes are read; the fetched archive is never needed here.
 *
 * @module pdf/tests/arlington-read-keys.integration
 */

import { describe, test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    BINDINGS, OVERRIDES, STREAM_OBJECTS, createBuilder, isStreamObject, keyExclusion, loadModel, measure, runBinding,
    splitTop, unwrap
} from './_helpers/arlington.js';

const DIR = fileURLToPath(new URL('_fixtures/arlington/', import.meta.url));
const TSV = join(DIR, 'vendor', 'tsv');
const manifest = JSON.parse(readFileSync(join(DIR, 'MANIFEST.json'), 'utf8'));
const model = loadModel(TSV);

describe('integrity of the vendored Arlington files', () => {
    test('MANIFEST.json lists exactly the files on disk, each with its bytes and SHA-256', () => {
        const onDisk = readdirSync(TSV).sort();
        expect(manifest.files.map((f) => f.path)).toEqual(onDisk);
        expect(onDisk.length).toBe(613);
        for (const f of manifest.files) {
            const b = readFileSync(join(TSV, f.path));
            expect([f.path, b.length]).toEqual([f.path, f.bytes]);
            expect([f.path, createHash('sha256').update(b).digest('hex')]).toEqual([f.path, f.sha256]);
        }
    });

    test('the upstream LICENSE and NOTICE.txt copies match the manifest, and nothing else sits beside them', () => {
        for (const f of manifest.upstreamNotices) {
            const b = readFileSync(join(DIR, f.path));
            expect([f.path, b.length, createHash('sha256').update(b).digest('hex')]).toEqual([f.path, f.bytes, f.sha256]);
        }
        const docs = ['.gitattributes', 'MANIFEST.json', 'PROVENANCE.md', 'README.md'];
        expect(readdirSync(DIR).sort()).toEqual([...docs, ...manifest.upstreamNotices.map((f) => f.path), 'vendor'].sort());
        expect(readdirSync(join(DIR, 'vendor'))).toEqual(['tsv']);
    });

    test('the manifest names the pinned commit, its archive and the tree', () => {
        expect(manifest.ref).toBe('c48b363e9b78902deea03e958693c09339248a3a');
        expect(manifest.archiveSha256).toBe('ff8ad980e0da525251cee24b0941658faee433feebf4f51249682128a8322f3a');
        expect(manifest.tree).toBe('tsv/latest');
    });
});

describe('the model as read', () => {
    test('object kinds: dictionaries, maps (wildcard-only, linked as dictionaries) and arrays', () => {
        const kinds = {};
        for (const o of model.values()) kinds[o.kind] = (kinds[o.kind] || 0) + 1;
        expect(kinds).toEqual({ dict: 399, map: 21, array: 193 });
        expect(model.get('FontMap').kind).toBe('map');
        expect(model.get('ArrayOfFields').kind).toBe('array');
        expect(model.get('ArrayOfQuadPoints').kind).toBe('array');
    });

    test('predicate wrappers: the plain value, or null for an expression', () => {
        expect(unwrap('fn:SinceVersion(2.0,array)')).toBe('array');
        expect(unwrap('fn:Deprecated(2.0,fn:RequiredValue(@V==4,4))')).toBe('4');
        expect(unwrap('fn:Eval((@0>=0) && (@0<=1))')).toBe(null);
        expect(splitTop('[a,fn:X(b,c)];[d]', ';')).toEqual(['[a,fn:X(b,c)]', '[d]']);
    });

    test('key exclusions: extensions and wildcard entries, nothing else', () => {
        const nav = model.get('Navigator').rows;
        expect(keyExclusion(nav.find((r) => r.Key === 'SWF'))).toMatch(/^an extension/);
        expect(keyExclusion(nav.find((r) => r.Key === 'Layout'))).toBe(null); // since 2.0
        expect(keyExclusion(model.get('Catalog').rows.find((r) => r.Key === 'Pages'))).toBe(null);
        expect(keyExclusion({ Key: '*', SinceVersion: '1.0' })).toMatch(/wildcard/);
    });

    test('the builder: possible values valid in 2.0, indirect references, required positions, map entries', () => {
        const b = createBuilder(model);
        const cat = b.objectValue('Catalog').entries;
        expect(cat.Type).toEqual({ type: 'name', value: 'Catalog' });
        expect(cat.Pages.type).toBe('ref'); // IndirectReference TRUE
        const enc = b.objectValue('EncryptionStandard').entries;
        expect([enc.V.value, enc.R.value]).toEqual([5, 6]); // not the deprecated V 0 / R 2
        const hl = b.objectValue('AnnotHighlight').entries;
        expect(hl.QuadPoints.items.length).toBe(8); // the 0*..7* group once
        const res = b.objectValue('Resource').entries;
        expect(Object.keys(res.Font.entries)).toEqual(['K1']); // a map gets one entry
        expect(b.objectValue('XObjectImage').type).toBe('stream');
        // a value the typer cannot mistake for an absent key: not the default
        // (Open defaults to false), one item for an any-length array of references
        expect(b.objectValue('AnnotText').entries.Open).toEqual({ type: 'bool', value: true });
        const page = b.objectValue('PageObject').entries;
        expect(page.Contents.items.map((x) => x.type)).toEqual(['ref']);
        expect(b.objectValue('InteractiveForm').entries.Fields.items).toEqual([]); // direct dictionaries: none
        expect(page.Rotate).toEqual({ type: 'int', value: 90 }); // OVERRIDES
        expect(b.objectValue('EncryptionPublicKey').type).toBe('dict'); // Length and Filter alone
    });

    test('every override names an included key of a bound object', () => {
        for (const id of Object.keys(OVERRIDES)) {
            const [obj, key] = id.split('/');
            const row = model.get(obj).rows.find((r) => r.Key === key);
            expect([id, row !== undefined && keyExclusion(row) === null, BINDINGS[obj] !== undefined]).toEqual([id, true, true]);
        }
    });
});

describe('the handled test on stand-in typers', () => {
    const value = {
        type: 'dict',
        entries: { A: { type: 'int', value: 1 }, B: { type: 'name', value: 'x' }, C: { type: 'bool', value: true } }
    };
    const fake = (fn) => ({ get: () => ({ fn }) });
    const run = (fn) => Object.fromEntries(runBinding({ typer: 'm.fn', call: (f, v) => f(v) }, value, fake(fn)));

    test('a record with _extras: a key is handled unless it is in _extras', () => {
        const fn = (d) => ({ a: d.entries.A, _extras: { C: d.entries.C } });
        expect(run(fn)).toEqual({ A: null, B: null, C: 'in _extras' });
    });

    test('no _extras: a key is handled when removing or nulling it changes the outcome', () => {
        const fn = (d) => {
            if (d.entries.C && d.entries.C.type !== 'bool') throw new Error('C must be a boolean');
            return { a: d.entries.A ? d.entries.A.value : null, raw: d };
        };
        expect(run(fn)).toEqual({ A: null, B: 'no effect on the record', C: null });
    });

    test('no _extras: a typer that reads which keys are present is seen by the removal probe', () => {
        const fn = (d) => ({ present: Object.keys(d.entries).filter((k) => k !== 'B').sort() });
        expect(run(fn)).toEqual({ A: null, B: 'no effect on the record', C: null });
    });

    test('surfaced: a key out of _extras counts only when it reaches the record', () => {
        // B is "known" (out of _extras) but dropped; C is kept untyped in _extras
        const fn = (d) => ({ a: d.entries.A ? d.entries.A.value : null, raw: d, _extras: { C: d.entries.C } });
        expect(run(fn)).toEqual({ A: null, B: null, C: 'in _extras' });
        const surfaced = Object.fromEntries(runBinding({ typer: 'm.fn', call: (f, v) => f(v) }, value, fake(fn), true));
        expect(surfaced).toEqual({ A: null, B: 'no effect on the record', C: 'in _extras' });
    });

    test('a throw on the whole dictionary: no key is handled, the reason names the error', () => {
        const fn = () => { throw Object.assign(new Error('no'), { code: 'pdf/x/y' }); };
        expect(Object.values(run(fn))).toEqual(Array(3).fill('m.fn throws pdf/x/y'));
    });

    test('several typers for one object: a key counts when one of them handles it', () => {
        const m = new Map([['Catalog', model.get('Catalog')], ['PageObject', model.get('PageObject')]]);
        for (const name of ['FontMap', 'ArrayOfFields']) m.set(name, model.get(name));
        const info = { typer: 'pdfInfo.typeInfo', call: (f, v) => f(v) };
        const r = measure(m, { Catalog: [{ typer: 'pdfCatalog.typeCatalog', call: (f, v) => f(v) }, info],
            PageObject: [{ typer: 'pdfPage.typePage', call: (f, v) => f(v) }, info] });
        expect(r.bound).toEqual(['Catalog', 'PageObject']);
        // in the info typer's _extras, handled by the catalog typer
        expect(r.cases.find((c) => c.case === 'Catalog/Pages')).toEqual({ case: 'Catalog/Pages', ok: true });
        // in both: each typer's reason, in binding order
        expect(r.cases.find((c) => c.case === 'PageObject/Hid')).toEqual({
            case: 'PageObject/Hid', ok: false, detail: 'in _extras; in _extras'
        });
        expect(r.skipped.map((s) => s.case)).toEqual(['FontMap', 'ArrayOfFields']); // model order
    });
});

describe('the measure over the package typers (pinned)', () => {
    const r = measure(model);
    const fails = (prefix) => r.cases.filter((c) => c.case.startsWith(prefix) && !c.ok);

    test('score: handled keys over included keys; bound and unbound objects', () => {
        expect(r.cases.length).toBe(3357);
        expect(r.cases.filter((c) => c.ok).length).toBe(3289);
        expect([r.bound.length, r.unbound.length, r.skipped.length]).toEqual([345, 19, 308]);
    });

    test('every typer that throws on its dictionary, with the reason', () => {
        const thrown = r.cases.filter((c) => !c.ok && / throws /.test(c.detail || ''))
            .map((c) => `${c.case}: ${c.detail}`);
        expect(thrown).toEqual([
            // the public-key security handler is not claimed (Standard handler only): /R is required
            'EncryptionPublicKey/Recipients: pdfSecurity.typeEncryptDict throws pdf/crypto/encrypt-dict/missing-V-R; in _extras'
        ]);
    });

    test('a collection schema types with its optional /Type', () => {
        expect(r.cases.find((c) => c.case === 'CollectionSchema/Type')).toEqual({ case: 'CollectionSchema/Type', ok: true });
    });

    test('a JavaScript action types with its /JS given by reference (the stream form)', () => {
        expect(r.cases.find((c) => c.case === 'ActionECMAScript/JS')).toEqual({ case: 'ActionECMAScript/JS', ok: true });
    });

    test('the catalog: every key handled; the page: one key left in _extras', () => {
        expect(fails('Catalog/').map((c) => c.case)).toEqual([]);
        expect(fails('PageObject/').map((c) => c.case)).toEqual(['PageObject/Hid']);
    });

    test('annotations: the markup and PDF 2.0 entries reach typeMarkupEntries; a widget /T, the field name, the field companion', () => {
        const ENTRIES = new Set(['T', 'Popup', 'RC', 'CreationDate', 'IRT', 'Subj', 'RT', 'IT', 'ExData', 'ca', 'BM', 'Lang']);
        const left = r.cases.filter((c) => c.case.startsWith('Annot') && ENTRIES.has(c.case.split('/')[1]) && !c.ok)
            .map((c) => c.case);
        expect(left).toEqual([]);
        const handled = r.cases.filter((c) => c.case.startsWith('Annot') && ENTRIES.has(c.case.split('/')[1]) && c.ok);
        // 18 markup objects × 9 entries, 28 annotation objects × 3, the Movie and Screen /T, the widget /T
        expect(handled.length).toBe(18 * 9 + 28 * 3 + 2 + 1);
    });

    test('font descriptors: every included key of the six descriptor objects reaches typeFontDescriptor', () => {
        const SIX = ['FontDescriptorType1', 'FontDescriptorTrueType', 'FontDescriptorType3',
            'FontDescriptorCIDType0', 'FontDescriptorCIDType2', 'CIDFontDescriptorMetrics'];
        const included = SIX.flatMap((o) => model.get(o).rows.filter((row) => keyExclusion(row) === null)
            .map((row) => `${o}/${row.Key}`));
        const cases = r.cases.filter((c) => SIX.includes(c.case.split('/')[0]));
        expect(cases.map((c) => c.case).sort()).toEqual(included.sort());
        expect(cases.filter((c) => !c.ok)).toEqual([]);
        // 21 + 21 + 18 + 24 + 25 + 16 rows in the vendored model, none excluded
        expect(cases.length).toBe(125);
    });

    test('streams: every stream object carries typeStreamEntries, and every Table 5 entry of them is handled', () => {
        const streams = [...model.values()].filter((o) => o.kind === 'dict' && isStreamObject(o)).map((o) => o.name);
        expect([...STREAM_OBJECTS]).toEqual(streams);
        for (const o of streams) expect(BINDINGS[o].map((x) => x.typer)).toContain('pdfFilterDispatch.typeStreamEntries');
        const TABLE5 = new Set(['Length', 'Filter', 'DecodeParms', 'F', 'FFilter', 'FDecodeParms', 'DL']);
        const cases = r.cases.filter((c) => streams.includes(c.case.split('/')[0]) && TABLE5.has(c.case.split('/')[1]));
        expect(cases.filter((c) => !c.ok)).toEqual([]);
        expect([streams.length, cases.length]).toEqual([36, 250]);
    });

    test('viewer preferences: every key handled by typeViewerPreferences', () => {
        expect(r.bound).toContain('ViewerPreferences');
        expect(r.cases.filter((c) => c.case.startsWith('ViewerPreferences/')).map((c) => c.ok)).toEqual(Array(18).fill(true));
    });

    test('an unbound object counts every included key as not handled', () => {
        const o = r.unbound[0];
        expect(fails(`${o}/`).length).toBeGreaterThan(0);
        expect(fails(`${o}/`).every((c) => c.detail === 'no typer')).toBe(true);
    });
});

describe('the surfaced measure: keys that reach the typed record (pinned)', () => {
    const ruled = measure(model);
    const s = measure(model, BINDINGS, { surfaced: true });
    const okRuled = new Set(ruled.cases.filter((c) => c.ok).map((c) => c.case));
    const okSurfaced = new Set(s.cases.filter((c) => c.ok).map((c) => c.case));

    test('same keys, objects and skips as the ruled measure; its own score', () => {
        expect(s.cases.map((c) => c.case)).toEqual(ruled.cases.map((c) => c.case));
        expect([s.bound, s.unbound, s.skipped]).toEqual([ruled.bound, ruled.unbound, ruled.skipped]);
        expect(okSurfaced.size).toBe(3280);
    });

    test('every surfaced key is handled; 9 handled keys never reach the record, each for a stated reason', () => {
        expect([...okSurfaced].filter((k) => !okRuled.has(k))).toEqual([]);
        const knownOnly = [...okRuled].filter((k) => !okSurfaced.has(k)).sort();
        expect(knownOnly).toEqual([
            // a direct dictionary cannot name the parent annotation: only the reference form is typed
            // (a widget's /Parent, its field, reaches the field companion's record)
            'AnnotPopup/Parent',
            // the public-key security handler is not claimed (Standard handler only)
            'EncryptionPublicKey/EncryptMetadata', 'EncryptionPublicKey/Filter',
            'EncryptionPublicKey/P', 'EncryptionPublicKey/SubFilter',
            // the stream form would widen the values of the existing v and dv fields (a major change)
            'FieldTx/DV', 'FieldTx/V',
            // one attribute, two spellings (PDF 1.7 checked, ISO 32000-2 Checked) read into one field:
            // the measure's dictionary holds both, so removing either leaves the field as it was
            'StructureAttributesDict/Checked', 'StructureAttributesDict/checked'
        ]);
    });
});
