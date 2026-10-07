// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { ooxmlErrors } from './errors.js';

const { OoxmlError, ParseError, RenderError, ContractError, isOoxmlError } = ooxmlErrors.factory();

describe('ooxmlErrors module', () => {
    test('exposes name + dependencies + factory', () => {
        expect(ooxmlErrors.name).toBe('ooxmlErrors');
        expect(ooxmlErrors.dependencies).toEqual([]);
        expect(typeof ooxmlErrors.factory).toBe('function');
    });

    test('factory returns the four classes + isOoxmlError', () => {
        const e = ooxmlErrors.factory();
        expect(typeof e.OoxmlError).toBe('function');
        expect(typeof e.ParseError).toBe('function');
        expect(typeof e.RenderError).toBe('function');
        expect(typeof e.ContractError).toBe('function');
        expect(typeof e.isOoxmlError).toBe('function');
        expect(new e.ParseError('x/y', 'm')).toBeInstanceOf(e.OoxmlError);
        expect(new e.RenderError('x/y', 'm')).toBeInstanceOf(e.OoxmlError);
        expect(new e.ContractError('x/y', 'm')).toBeInstanceOf(e.OoxmlError);
        expect(new e.OoxmlError('x/y', 'm')).toBeInstanceOf(Error);
        expect(e.isOoxmlError(new e.ParseError('x/y', 'm'))).toBe(true);
        expect(e.isOoxmlError(new Error('plain'))).toBe(false);
    });

    test('classes from independent factory calls share shape but not identity', () => {
        const a = ooxmlErrors.factory();
        const b = ooxmlErrors.factory();
        expect(a.OoxmlError).not.toBe(b.OoxmlError);
        // But each set is internally consistent.
        expect(new a.ParseError('x', 'y')).toBeInstanceOf(a.OoxmlError);
    });
});

describe('OoxmlError', () => {
    test('carries code + message + context + cause', () => {
        const cause = new Error('inner');
        const err = new OoxmlError('docx/test', 'oops', {
            context: { part: 'word/document.xml' },
            cause
        });
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(OoxmlError);
        expect(err.code).toBe('docx/test');
        expect(err.message).toBe('oops');
        expect(err.context).toEqual({ part: 'word/document.xml' });
        expect(err.cause).toBe(cause);
        expect(err.name).toBe('OoxmlError');
    });

    test('subclasses preserve their name + inherit base', () => {
        const p = new ParseError('docx/no-body', 'no body');
        expect(p).toBeInstanceOf(OoxmlError);
        expect(p).toBeInstanceOf(ParseError);
        expect(p.name).toBe('ParseError');

        const r = new RenderError('xlsx/bad-cell', 'bad cell');
        expect(r).toBeInstanceOf(OoxmlError);
        expect(r.name).toBe('RenderError');

        const c = new ContractError('pptx/bad-arg', 'bad arg');
        expect(c).toBeInstanceOf(OoxmlError);
        expect(c.name).toBe('ContractError');
    });

    test('catchable on base class', () => {
        try {
            throw new ParseError('x/y', 'msg');
        } catch (e) {
            expect(isOoxmlError(e)).toBe(true);
            expect(e.code).toBe('x/y');
        }
    });
});
