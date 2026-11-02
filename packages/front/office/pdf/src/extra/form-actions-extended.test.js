// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfFormActionsExtended } from './form-actions-extended.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
import { pdfSandbox } from './pdf-sandbox.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const { typeExtendedAction, EXTENDED_ACTION_SUBTYPES } =
    pdfFormActionsExtended.factory(_errors, _parserObj);
function bytes(s) { return new Uint8Array([...s].map(c => c.charCodeAt(0))); }
function action(s, extra) {
    return obj.dict({ Type: obj.name('Action'), S: obj.name(s), ...extra });
}

describe('typeExtendedAction', () => {
    test('GoTo3DView minimal', () => {
        const d = action('GoTo3DView', { TA: obj.ref(1, 0), V: obj.name('F') });
        const r = typeExtendedAction(d);
        expect(r.kind).toBe('GoTo3DView');
        expect(r.ta.num).toBe(1);
    });

    test('SetOCGState with state + extras', () => {
        const d = action('SetOCGState', {
            State: obj.array([obj.name('ON'), obj.ref(5, 0)]),
            PreserveRB: obj.bool(false),
            Custom: obj.int(1)
        });
        const r = typeExtendedAction(d);
        expect(r.state.length).toBe(2);
        expect(r.preserveRB).toBe(false);
        expect(r._extras.Custom.value).toBe(1);
    });

    test('Trans', () => {
        const d = action('Trans', { Trans: obj.dict({ S: obj.name('Fade') }) });
        const r = typeExtendedAction(d);
        expect(r.trans).toBeTruthy();
    });

    test('Rendition with OP', () => {
        const d = action('Rendition', {
            R: obj.ref(1, 0), AN: obj.ref(2, 0), OP: obj.int(0)
        });
        const r = typeExtendedAction(d);
        expect(r.op).toBe(0);
    });

    test('Hide with /T as string', () => {
        const d = action('Hide', { T: obj.string(bytes('field.1')), H: obj.bool(false) });
        const r = typeExtendedAction(d);
        expect(r.targets.length).toBe(1);
        expect(r.h).toBe(false);
    });

    test('Hide with /T as array', () => {
        const d = action('Hide', {
            T: obj.array([obj.string(bytes('f1')), obj.string(bytes('f2'))])
        });
        const r = typeExtendedAction(d);
        expect(r.targets.length).toBe(2);
        expect(r.h).toBe(true);
    });

    test('SubmitForm', () => {
        const d = action('SubmitForm', {
            F: obj.dict({}), Flags: obj.int(4),
            Fields: obj.array([obj.string(bytes('f1'))])
        });
        const r = typeExtendedAction(d);
        expect(r.flags).toBe(4);
        expect(r.fields.length).toBe(1);
    });

    test('ResetForm', () => {
        const d = action('ResetForm', { Flags: obj.int(1) });
        const r = typeExtendedAction(d);
        expect(r.flags).toBe(1);
    });

    test('ImportData', () => {
        const d = action('ImportData', { F: obj.dict({}) });
        const r = typeExtendedAction(d);
        expect(r.file).toBeTruthy();
    });

    test('JavaScript sandboxed', () => {
        const d = action('JavaScript', { JS: obj.string(bytes('app.alert(1)')) });
        const r = typeExtendedAction(d);
        expect(r.sandboxed).toBe(true);
    });

    // A stream inside a dictionary is always an indirect reference
    // (ISO 32000-2 7.3.8): a script held in a stream reaches the typer as one.
    test('JavaScript with /JS by reference keeps the reference', () => {
        const r = typeExtendedAction(action('JavaScript', { JS: obj.ref(12, 0) }));
        expect(r.kind).toBe('JavaScript');
        expect(r.js).toEqual({ type: 'ref', num: 12, gen: 0 });
        expect(r.sandboxed).toBe(true);
        expect(() => typeExtendedAction(action('JavaScript', { JS: obj.int(1) })))
            .toThrow(expect.objectContaining({ code: 'pdf/extra/action-ext/bad-js' }));
    });

    test('Rendition with /JS by reference keeps the reference', () => {
        const r = typeExtendedAction(action('Rendition', { OP: obj.int(0), JS: obj.ref(12, 0) }));
        expect(r.js).toEqual({ type: 'ref', num: 12, gen: 0 });
        expect(r.sandboxed).toBe(true);
        // another type is still not a script
        const other = typeExtendedAction(action('Rendition', { OP: obj.int(0), JS: obj.int(1) }));
        expect([other.js, other.sandboxed]).toEqual([null, undefined]);
    });

    test('the sandbox linter sees a stream script held by reference', () => {
        const { lintActions } = pdfSandbox.factory(_errors);
        const records = [
            typeExtendedAction(action('JavaScript', { JS: obj.ref(12, 0) })),
            typeExtendedAction(action('Rendition', { OP: obj.int(0), JS: obj.ref(13, 0) }))
        ];
        expect(lintActions(records).issues.map((i) => i.code))
            .toEqual(['pdf/sandbox/active-javascript', 'pdf/sandbox/active-rendition']);
    });

    test('malformed: missing required entries throw', () => {
        expect(() => typeExtendedAction(obj.array([]))).toThrow(ParseError);
        expect(() => typeExtendedAction(obj.dict({ S: obj.name('XYZ') }))).toThrow(ParseError);
        expect(() => typeExtendedAction(action('Hide', {}))).toThrow(ParseError);
        expect(() => typeExtendedAction(action('SubmitForm', {}))).toThrow(ParseError);
        expect(() => typeExtendedAction(action('ImportData', {}))).toThrow(ParseError);
        expect(() => typeExtendedAction(action('JavaScript', {}))).toThrow(ParseError);
        expect(() => typeExtendedAction(action('SetOCGState', { State: obj.int(1) }))).toThrow(ParseError);
        expect(() => typeExtendedAction(action('Trans', { Trans: obj.int(1) }))).toThrow(ParseError);
    });
});

describe('factory', () => {
    test('shape', () => {
        expect(pdfFormActionsExtended.name).toBe('pdfFormActionsExtended');
        expect(pdfFormActionsExtended.dependencies).toEqual(['pdfErrors', 'pdfParserObj']);
        expect(pdfFormActionsExtended.factory.toString()).toContain('function');
        const api = pdfFormActionsExtended.factory(_pdfErrors_TD1, { isType: () => false });
        expect(typeof api.typeExtendedAction).toBe('function');
        expect(api.EXTENDED_ACTION_SUBTYPES.has('Hide')).toBe(true);
    });
});

describe('EXTENDED_ACTION_SUBTYPES', () => {
    test('contains expected', () => {
        expect(EXTENDED_ACTION_SUBTYPES.has('JavaScript')).toBe(true);
    });
});

describe('A38d: the remaining action subtypes and the additional actions', () => {
    const { typeAdditionalActions } = pdfFormActionsExtended.factory(_errors, _parserObj);
    const { ContractError } = _errors;
    const u8 = (s) => new TextEncoder().encode(s);
    const act = (s, entries) => typeExtendedAction(obj.dict({ S: obj.name(s), ...entries }));

    test('Thread, Sound, Movie, RichMediaExecute, GoToDp', () => {
        expect(act('Thread', { F: obj.string(u8('a.pdf')), D: obj.int(2), B: obj.dict({}) })).toMatchObject({ kind: 'Thread', f: u8('a.pdf'), d: 2, b: { type: 'dict' } });
        expect(act('Thread', { D: obj.string(u8('Chapter 1')) }).d).toEqual(u8('Chapter 1'));
        expect(act('Sound', { Sound: obj.ref(5, 0), Volume: obj.real(0.5), Synchronous: obj.bool(true), Repeat: obj.bool(false), Mix: obj.bool(true) }))
            .toMatchObject({ sound: { type: 'ref' }, volume: 0.5, synchronous: true, repeat: false, mix: true });
        expect(act('Movie', { Annotation: obj.dict({}), T: obj.string(u8('m')), Operation: obj.name('Play') })).toMatchObject({ t: u8('m'), operation: 'Play' });
        expect(act('RichMediaExecute', { TA: obj.dict({}), TI: obj.dict({}), CMD: obj.dict({}) })).toMatchObject({ ta: { type: 'dict' }, cmd: { type: 'dict' } });
        const dp = act('GoToDp', { Dp: obj.ref(9, 0), Foo: obj.int(1) });
        expect([dp.dp.type, dp._extras]).toEqual(['ref', { Foo: obj.int(1) }]);
    });

    test('the PDF 1.2 SetState and NOP', () => {
        expect(act('SetState', { T: obj.array([]), AS: obj.name('On') })).toMatchObject({ kind: 'SetState', t: { type: 'array' }, as: 'On' });
        const nop = act('NOP', { Next: obj.dict({}) });
        expect([nop.kind, nop._extras]).toEqual(['NOP', {}]);
        expect(EXTENDED_ACTION_SUBTYPES.has('Thread') && EXTENDED_ACTION_SUBTYPES.has('NOP')).toBe(true);
    });

    test('typeAdditionalActions: each trigger as read, by kind', () => {
        const w = typeAdditionalActions(obj.dict({ E: obj.dict({}), Fo: obj.ref(2, 0), Bl: obj.dict({}), PI: obj.dict({}), K: obj.dict({}) }), 'widgetAnnotation');
        expect([w.e.type, w.fo.type, w.bl.type, w.pi.type]).toEqual(['dict', 'ref', 'dict', 'dict']);
        expect(Object.keys(w._extras)).toEqual(['K']);
        const c = typeAdditionalActions(obj.dict({ WS: obj.dict({}), DP: obj.dict({}) }), 'catalog');
        expect([c.ws.type, c.dp.type]).toEqual(['dict', 'dict']);
        expect(typeAdditionalActions(obj.dict({ K: obj.dict({}), V: obj.name('x') }), 'formField')).toMatchObject({ k: { type: 'dict' }, v: null });
        expect(typeAdditionalActions(obj.dict({ O: obj.dict({}) }), 'pageObject').o.type).toBe('dict');
        expect(typeAdditionalActions(obj.dict({ PV: obj.dict({}) }), 'screenAnnotation').pv.type).toBe('dict');
        const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };
        expect(code(() => typeAdditionalActions(obj.array([]), 'catalog'))).toEqual([ParseError.name, 'pdf/extra/action-ext/aa-not-dict']);
        expect(code(() => typeAdditionalActions(obj.dict({}), 'page'))).toEqual([ContractError.name, 'pdf/extra/action-ext/aa-kind']);
    });
});

describe('typeFieldEntries (A39d)', () => {
    const { typeFieldEntries } = pdfFormActionsExtended.factory(_errors, _parserObj);
    const u8 = (s) => new TextEncoder().encode(s);

    test('the shared field keys and the rich text, by value or as read', () => {
        const d = obj.dict({ Parent: obj.ref(2, 0), Kids: obj.array([]), T: obj.string(u8('name')), TU: obj.string(u8('Name')),
            TM: obj.string(u8('n')), Ff: obj.int(4096), AA: obj.dict({}), DS: obj.string(u8('font: 12pt')), RV: obj.stream(obj.dict({}), new Uint8Array()), FT: obj.name('Tx') });
        const r = typeFieldEntries(d);
        expect([r.parent.type, r.kids.type, r.ff, r.aa.type, r.rv.type]).toEqual(['ref', 'array', 4096, 'dict', 'stream']);
        expect([r.t, r.tu, r.tm, r.ds]).toEqual([u8('name'), u8('Name'), u8('n'), u8('font: 12pt')]);
        expect('ft' in r || '_extras' in r).toBe(false);
        expect(typeFieldEntries(obj.dict({ RV: obj.string(u8('<p/>')), Ff: obj.real(1.5) }))).toMatchObject({ rv: u8('<p/>'), ff: null });
        let err = null;
        try { typeFieldEntries(obj.array([])); } catch (e) { err = e; }
        expect([err instanceof ParseError, err.code]).toEqual([true, 'pdf/extra/action-ext/field-not-dict']);
    });
});
