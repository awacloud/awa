// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { mdErrors } from './errors.js';

const { MdError, ParseError, RenderError, ContractError, isMdError } = mdErrors.factory();

describe('errors', () => {
    test('MdError carries code/message/context/cause', () => {
        const cause = new Error('root');
        const e = new MdError('md/x', 'boom', { context: { line: 3 }, cause });
        expect(e.code).toBe('md/x');
        expect(e.message).toBe('boom');
        expect(e.context).toEqual({ line: 3 });
        expect(e.cause).toBe(cause);
        expect(e.name).toBe('MdError');
    });

    test('subclasses inherit & expose their own name', () => {
        expect(new ParseError('p', '').name).toBe('ParseError');
        expect(new RenderError('r', '').name).toBe('RenderError');
        expect(new ContractError('c', '').name).toBe('ContractError');
        expect(new ParseError('p', '') instanceof MdError).toBe(true);
    });

    test('mdErrors factory exposes the four classes + isMdError', () => {
        const api = mdErrors.factory();
        expect(api.MdError.name).toBe('MdError');
        expect(api.ParseError.name).toBe('ParseError');
        expect(api.RenderError.name).toBe('RenderError');
        expect(api.ContractError.name).toBe('ContractError');
        expect(new api.ParseError('p', '') instanceof api.MdError).toBe(true);
        expect(api.isMdError(new api.ParseError('p', ''))).toBe(true);
        expect(api.isMdError(new Error('x'))).toBe(false);
    });

    test('mdErrors factory worker-safe', () => {
        expect(mdErrors.factory.toString()).toContain('function');
        expect(mdErrors.dependencies).toEqual([]);
    });

    test('classes from independent factory calls share shape but not identity', () => {
        const a = mdErrors.factory();
        const b = mdErrors.factory();
        expect(a.MdError).not.toBe(b.MdError);
        expect(new a.ParseError('x', 'y')).toBeInstanceOf(a.MdError);
    });
});
