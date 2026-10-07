// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfAction } from './action.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfAction_m = pdfAction.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeAction } = _pdfAction_m;

describe('typeAction', () => {
    test('dispatches to typer when provided', () => {
        const typers = { GoTo: (d) => ({ kind: 'GoTo', dest: d.entries.D, raw: d }) };
        const r = typeAction(obj.dict({
            Type: obj.name('Action'),
            S: obj.name('GoTo'),
            D: obj.array([obj.ref(1, 0), obj.name('Fit')])
        }), typers);
        expect(r.kind).toBe('GoTo');
        expect(r.dest.type).toBe('array');
    });

    test('falls back to generic record', () => {
        const r = typeAction(obj.dict({
            S: obj.name('JavaScript'),
            JS: obj.string(new Uint8Array([1, 2, 3]))
        }));
        expect(r.kind).toBe('JavaScript');
        expect(r._extras.JS).toBeDefined();
    });

    test('marks vendor extensions', () => {
        const r = typeAction(obj.dict({ S: obj.name('AcmeFlash') }));
        expect(r.kind).toBe('AcmeFlash');
        expect(r.vendor).toBe(true);
    });

    test('walks /Next array', () => {
        const r = typeAction(obj.dict({
            S: obj.name('Named'),
            Next: obj.array([
                obj.dict({ S: obj.name('NextPage') }),
                obj.dict({ S: obj.name('FirstPage') })
            ])
        }));
        expect(r.next.length).toBe(2);
        expect(r.next[0].kind).toBe('NextPage');
    });

    test('walks single /Next dict', () => {
        const r = typeAction(obj.dict({
            S: obj.name('Named'),
            Next: obj.dict({ S: obj.name('NextPage') })
        }));
        expect(r.next.length).toBe(1);
    });

    test('rejects non-dict', () => {
        expect(() => typeAction(obj.array([]))).toThrow(ParseError);
    });
    test('rejects missing /S', () => {
        expect(() => typeAction(obj.dict({}))).toThrow(ParseError);
    });
    test('rejects wrong /Type', () => {
        expect(() => typeAction(obj.dict({
            Type: obj.name('Annot'), S: obj.name('GoTo')
        }))).toThrow(ParseError);
    });
    test('rejects bad /Next type', () => {
        expect(() => typeAction(obj.dict({
            S: obj.name('Named'), Next: obj.int(1)
        }))).toThrow(ParseError);
    });
    test('detects cycles', () => {
        const a = obj.dict({ S: obj.name('Named') });
        a.entries.Next = a;
        expect(() => typeAction(a)).toThrow(ParseError);
    });
});

describe('pdfAction module', () => {
    test('module shape + worker safety', () => {
        expect(pdfAction.name).toBe('pdfAction');
        expect(pdfAction.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfAction.factory.toString()).toContain('function');
        const m = pdfAction.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeAction).toBe('function');
    });
});
