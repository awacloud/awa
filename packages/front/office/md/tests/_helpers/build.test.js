// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import {
    buildMd, buildMdFull, parseAndRender, expectAstEquivalent
} from './build.js';

describe('tests/_helpers/build', () => {
    test('buildMd returns a fresh md instance', () => {
        const a = buildMd();
        const b = buildMd();
        expect(a).not.toBe(b);
        expect(typeof a.parse).toBe('function');
        expect(typeof a.renderHtml).toBe('function');
    });

    test('buildMdFull returns a fresh md instance with all extras', () => {
        const a = buildMdFull();
        const b = buildMdFull();
        expect(a).not.toBe(b);
        expect(a.extensions.length).toBe(10);
    });

    test('parseAndRender supports html', () => {
        expect(parseAndRender('# h\n', 'html')).toBe('<h1>h</h1>\n');
    });

    test('parseAndRender supports markdown roundtrip', () => {
        const out = parseAndRender('hi\n', 'markdown');
        expect(typeof out).toBe('string');
        expect(out).toContain('hi');
    });

    test('parseAndRender supports xml', () => {
        const out = parseAndRender('# h\n', 'xml');
        expect(out).toContain('<?xml');
        expect(out).toContain('<heading');
    });

    test('parseAndRender throws on unknown format', () => {
        expect(() => parseAndRender('x', 'pdf')).toThrow(TypeError);
    });

    test('expectAstEquivalent passes when ASTs are structurally identical', () => {
        const md = buildMd();
        const a = md.parse('# hi\n');
        const b = md.parse('# hi\n');
        expect(() => expectAstEquivalent(a, b)).not.toThrow();
    });

    test('expectAstEquivalent throws when ASTs differ', () => {
        const md = buildMd();
        const a = md.parse('# a\n');
        const b = md.parse('# b\n');
        expect(() => expectAstEquivalent(a, b)).toThrow();
    });
});
