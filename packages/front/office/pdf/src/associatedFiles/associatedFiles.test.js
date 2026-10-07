// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfAssociatedFiles } from './associatedFiles.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfAssociatedFiles_m = pdfAssociatedFiles.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeAssociatedFiles } = _pdfAssociatedFiles_m;

const u8 = (s) => new TextEncoder().encode(s);

describe('typeAssociatedFiles', () => {
    test('empty array', () => {
        expect(typeAssociatedFiles(obj.array([]))).toEqual([]);
    });

    test('inline filespec with standard relationship', () => {
        const r = typeAssociatedFiles(obj.array([
            obj.dict({
                F: obj.string(u8('data.csv')),
                AFRelationship: obj.name('Data')
            })
        ]));
        expect(r[0].relationship).toBe('Data');
        expect(r[0].standard).toBe(true);
    });

    test('non-standard relationship marked', () => {
        const r = typeAssociatedFiles(obj.array([
            obj.dict({
                F: obj.string(u8('x')),
                AFRelationship: obj.name('Mystery')
            })
        ]));
        expect(r[0].standard).toBe(false);
    });

    test('missing relationship null', () => {
        const r = typeAssociatedFiles(obj.array([
            obj.dict({ F: obj.string(u8('x')) })
        ]));
        expect(r[0].relationship).toBeNull();
    });

    test('ref without resolver kept unresolved', () => {
        const r = typeAssociatedFiles(obj.array([obj.ref(5, 0)]));
        expect(r[0].resolved).toBe(false);
        expect(r[0].ref.num).toBe(5);
    });

    test('ref with resolver', () => {
        const dict = obj.dict({
            F: obj.string(u8('a')),
            AFRelationship: obj.name('Source')
        });
        const r = typeAssociatedFiles(obj.array([obj.ref(5, 0)]),
            () => dict);
        expect(r[0].relationship).toBe('Source');
        expect(r[0].ref).toEqual({ num: 5, gen: 0 });
    });

    test('rejects non-array', () => {
        expect(() => typeAssociatedFiles(obj.dict({}))).toThrow(ParseError);
    });
    test('rejects non-dict entry', () => {
        expect(() => typeAssociatedFiles(obj.array([obj.int(1)]))).toThrow(ParseError);
    });
    test('rejects bad /AFRelationship type', () => {
        expect(() => typeAssociatedFiles(obj.array([obj.dict({
            AFRelationship: obj.int(1)
        })]))).toThrow(ParseError);
    });
});

describe('pdfAssociatedFiles module', () => {
    test('module shape + worker safety', () => {
        expect(pdfAssociatedFiles.name).toBe('pdfAssociatedFiles');
        expect(pdfAssociatedFiles.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfAssociatedFiles.factory.toString()).toContain('function');
        const m = pdfAssociatedFiles.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeAssociatedFiles).toBe('function');
    });
});
