// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfActionLaunch } from './launch.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfActionLaunch_m = pdfActionLaunch.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeLaunch } = _pdfActionLaunch_m;

const u8 = (s) => new TextEncoder().encode(s);

describe('typeLaunch', () => {
    test('reads /F + flags + emits security warning + sandboxed flag', () => {
        const r = typeLaunch(obj.dict({
            F: obj.string(u8('virus.exe')),
            NewWindow: obj.bool(true)
        }));
        expect(r.kind).toBe('Launch');
        expect(typeof r.securityWarning).toBe('string');
        expect(r.sandboxed).toBe(true);
        expect(r.newWindow).toBe(true);
    });
    test('reads platform-specific dicts', () => {
        const r = typeLaunch(obj.dict({
            Win:  obj.dict({}),
            Mac:  obj.dict({}),
            Unix: obj.dict({})
        }));
        expect(r.win.type).toBe('dict');
        expect(r.mac.type).toBe('dict');
        expect(r.unix.type).toBe('dict');
    });
    test('rejects non-dict', () => {
        expect(() => typeLaunch(obj.array([]))).toThrow(ParseError);
    });
    test('rejects empty target', () => {
        expect(() => typeLaunch(obj.dict({}))).toThrow(ParseError);
    });
});

describe('pdfActionLaunch module', () => {
    test('module shape + worker safety', () => {
        expect(pdfActionLaunch.name).toBe('pdfActionLaunch');
        expect(pdfActionLaunch.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfActionLaunch.factory.toString()).toContain('function');
        const m = pdfActionLaunch.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeLaunch).toBe('function');
    });
});
