// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { odfErrors } from './errors.js';

const { OdfError, ParseError, RenderError, ContractError, isOdfError } = odfErrors.factory();

describe('odfErrors module', () => {
    test('has the expected factory shape', () => {
        expect(odfErrors.name).toBe('odfErrors');
        expect(odfErrors.dependencies).toEqual([]);
        expect(typeof odfErrors.factory).toBe('function');
    });

    test('factory returns the four classes', () => {
        const e = odfErrors.factory();
        expect(typeof e.OdfError).toBe('function');
        expect(typeof e.ParseError).toBe('function');
        expect(typeof e.RenderError).toBe('function');
        expect(typeof e.ContractError).toBe('function');
        expect(typeof e.isOdfError).toBe('function');
    });

    test('each factory call returns fresh class identities', () => {
        // Classes are declared inside the factory body, so two
        // independent instantiations produce distinct class identities.
        const a = odfErrors.factory();
        const b = odfErrors.factory();
        expect(a.OdfError).not.toBe(b.OdfError);
        // But instanceof still works within the same factory result.
        const err = new a.ParseError('x/y', 'msg');
        expect(err).toBeInstanceOf(a.OdfError);
        expect(err).toBeInstanceOf(a.ParseError);
    });
});

describe('OdfError', () => {
    test('carries code + message + context + cause', () => {
        const cause = new Error('inner');
        const err = new OdfError('odt/test', 'oops', {
            context: { part: 'content.xml' },
            cause
        });
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(OdfError);
        expect(err.code).toBe('odt/test');
        expect(err.message).toBe('oops');
        expect(err.context).toEqual({ part: 'content.xml' });
        expect(err.cause).toBe(cause);
        expect(err.name).toBe('OdfError');
    });

    test('subclasses preserve their name + inherit base', () => {
        const p = new ParseError('odt/no-body', 'no body');
        expect(p).toBeInstanceOf(OdfError);
        expect(p).toBeInstanceOf(ParseError);
        expect(p.name).toBe('ParseError');

        const r = new RenderError('ods/bad-cell', 'bad cell');
        expect(r).toBeInstanceOf(OdfError);
        expect(r.name).toBe('RenderError');

        const c = new ContractError('odp/bad-arg', 'bad arg');
        expect(c).toBeInstanceOf(OdfError);
        expect(c.name).toBe('ContractError');
    });

    test('catchable on base class', () => {
        try {
            throw new ParseError('x/y', 'msg');
        } catch (e) {
            expect(e instanceof OdfError).toBe(true);
            expect(e.code).toBe('x/y');
        }
    });

    test('isOdfError discriminates correctly', () => {
        expect(isOdfError(new ParseError('a/b', 'm'))).toBe(true);
        expect(isOdfError(new Error('plain'))).toBe(false);
    });
});
