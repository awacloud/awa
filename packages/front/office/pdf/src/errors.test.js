// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfErrors } from './errors.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const { PdfError, ParseError, RenderError, ContractError, EncryptionError } =
    _pdfErrors_TD1;

describe('pdfErrors module', () => {
    test('exposes name + dependencies + factory', () => {
        expect(pdfErrors.name).toBe('pdfErrors');
        expect(pdfErrors.dependencies).toEqual([]);
        expect(typeof pdfErrors.factory).toBe('function');
    });

    test('factory returns the five classes + isPdfError', () => {
        const e = _pdfErrors_TD1;
        // Classes are module-scope singletons captured by closure — same
        // identities are returned across factory calls.
        expect(e.PdfError).toBe(PdfError);
        expect(e.ParseError).toBe(ParseError);
        expect(e.RenderError).toBe(RenderError);
        expect(e.ContractError).toBe(ContractError);
        expect(e.EncryptionError).toBe(EncryptionError);
        expect(typeof e.isPdfError).toBe('function');
    });

    test('factory.toString() embeds source for worker transport', () => {
        // worker-safe contract: factory.toString() must be a real function source.
        expect(pdfErrors.factory.toString()).toContain('function');
    });

    test('isPdfError() classifies correctly', () => {
        const { isPdfError } = _pdfErrors_TD1;
        expect(isPdfError(new ParseError('pdf/x', 'x'))).toBe(true);
        expect(isPdfError(new Error('plain'))).toBe(false);
    });
});

describe('PdfError', () => {
    test('carries code + message + context + cause', () => {
        const cause = new Error('inner');
        const err = new PdfError('pdf/test', 'oops', {
            context: { offset: 42 },
            cause
        });
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(PdfError);
        expect(err.code).toBe('pdf/test');
        expect(err.message).toBe('oops');
        expect(err.context).toEqual({ offset: 42 });
        expect(err.cause).toBe(cause);
        expect(err.name).toBe('PdfError');
    });

    test('omits context + cause when not provided', () => {
        const err = new PdfError('pdf/min', 'bare');
        expect(err.context).toBeUndefined();
        expect(err.cause).toBeUndefined();
    });
});

describe('subclasses', () => {
    test('preserve their name + inherit base', () => {
        const cases = [
            [ParseError,      'ParseError'],
            [RenderError,     'RenderError'],
            [ContractError,   'ContractError'],
            [EncryptionError, 'EncryptionError'],
        ];
        for (const [Cls, name] of cases) {
            const e = new Cls('pdf/x', 'msg');
            expect(e).toBeInstanceOf(PdfError);
            expect(e).toBeInstanceOf(Cls);
            expect(e.name).toBe(name);
        }
    });
});
