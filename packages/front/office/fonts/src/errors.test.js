// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { fontErrors } from './errors.js';

describe('fontErrors module', () => {
    test('module metadata', () => {
        expect(fontErrors.name).toBe('fontErrors');
        expect(fontErrors.dependencies).toEqual([]);
        expect(typeof fontErrors.factory).toBe('function');
    });

    test('factory exports the four classes', () => {
        const e = fontErrors.factory();
        expect(e.FontError.name).toBe('FontError');
        expect(e.ParseError.name).toBe('ParseError');
        expect(e.RenderError.name).toBe('RenderError');
        expect(e.ContractError.name).toBe('ContractError');
        expect(new e.ParseError('x/y', 'm') instanceof e.FontError).toBe(true);
        expect(e.isFontError(new e.ParseError('x/y', 'm'))).toBe(true);
        expect(e.isFontError(new Error('plain'))).toBe(false);
    });

    test('inheritance chain (via factory)', () => {
        const { FontError, ParseError } = fontErrors.factory();
        const pe = new ParseError('fonts/bad-magic', 'wrong magic', { context: { magic: 0 } });
        expect(pe).toBeInstanceOf(FontError);
        expect(pe).toBeInstanceOf(Error);
        expect(pe.name).toBe('ParseError');
        expect(pe.code).toBe('fonts/bad-magic');
        expect(pe.context).toEqual({ magic: 0 });
    });

    test('cause is preserved (via factory)', () => {
        const { RenderError } = fontErrors.factory();
        const inner = new Error('underlying');
        const re = new RenderError('fonts/encode', 'msg', { cause: inner });
        expect(re.cause).toBe(inner);
    });

    test('factory produces fresh class identities per call (strict pure)', () => {
        const a = fontErrors.factory();
        const b = fontErrors.factory();
        // Strict pure factory : each invocation declares fresh classes.
        // Cross-module instanceof stability is provided by `ModuleRuntime`
        // (which caches the resolved instance), not by the descriptor itself.
        expect(a.FontError).not.toBe(b.FontError);
        expect(a.ParseError).not.toBe(b.ParseError);
        // Within a single factory call, the hierarchy is consistent.
        expect(new a.ParseError('x', 'y') instanceof a.FontError).toBe(true);
    });
});
