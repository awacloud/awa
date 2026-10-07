// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { stripFrontmatter, mdFrontmatter, createMd } from '../../tests/_helpers/build.js';

describe('stripFrontmatter', () => {
    test('detects YAML fence', () => {
        const { rest, frontmatter } = stripFrontmatter('---\ntitle: foo\n---\nbody\n');
        expect(frontmatter).toEqual({ lang: 'yaml', content: 'title: foo' });
        expect(rest).toBe('body\n');
    });

    test('detects TOML fence', () => {
        const { rest, frontmatter } = stripFrontmatter('+++\ntitle = "x"\n+++\n\nbody\n');
        expect(frontmatter.lang).toBe('toml');
        expect(frontmatter.content).toBe('title = "x"');
        expect(rest).toBe('\nbody\n');
    });

    test('detects JSON fence', () => {
        const { rest, frontmatter } = stripFrontmatter(';;;\n{"a":1}\n;;;\nbody\n');
        expect(frontmatter.lang).toBe('json');
    });

    test('handles BOM', () => {
        const { frontmatter } = stripFrontmatter('﻿---\nk: v\n---\n');
        expect(frontmatter.content).toBe('k: v');
    });

    test('returns null when absent', () => {
        const { rest, frontmatter } = stripFrontmatter('# h\nbody\n');
        expect(frontmatter).toBeNull();
        expect(rest).toBe('# h\nbody\n');
    });

    test('rejects fence without close', () => {
        const { frontmatter } = stripFrontmatter('---\ntitle: foo\nbody\n');
        expect(frontmatter).toBeNull();
    });

    test('rejects mid-document fence (header line not first)', () => {
        const { frontmatter } = stripFrontmatter('\n---\nk: v\n---\n');
        expect(frontmatter).toBeNull();
    });
});

describe('mdFrontmatter extension', () => {
    test('installs and attaches frontmatter to ast.data', () => {
        const m = createMd().use(mdFrontmatter);
        const ast = m.parse('---\ntitle: T\n---\n\n# h\n');
        expect(ast.data.frontmatter).toEqual({ lang: 'yaml', content: 'title: T' });
        // Body still parses normally.
        expect(ast.firstChild.type).toBe('heading');
    });

    test('absent frontmatter -> data.frontmatter = null', () => {
        const m = createMd().use(mdFrontmatter);
        const ast = m.parse('plain\n');
        expect(ast.data.frontmatter).toBeNull();
    });
});
