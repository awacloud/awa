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
