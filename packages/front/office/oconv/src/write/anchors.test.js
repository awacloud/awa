// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { oconvIr } from '../ir/ir.js';
import { slugify, inlineText, anchorIndex } from './anchors.js';

// `oconvIr` is dependency-free, so the frozen factory is callable directly —
// no ModuleRuntime needed to hand-build IR trees.
const { node, doc } = oconvIr.factory();

/** `heading` of `level` carrying a single text run. */
function heading(level, text) {
    return node('heading', { level }, [node('run', { text })]);
}

describe('slugify — profile v1 slug algorithm', () => {
    test('lowercases and collapses non-alphanumerics to a single dash', () => {
        expect(slugify('Sovereign RAG Ingestion')).toBe('sovereign-rag-ingestion');
        expect(slugify('Why  air-gap   matters!')).toBe('why-air-gap-matters');
        expect(slugify('A/B  &  C')).toBe('a-b-c');
    });

    test('NFKD-decomposes then strips combining marks (ASCII-only output)', () => {
        expect(slugify('Étude déjà vu')).toBe('etude-deja-vu');
        expect(slugify('Ünïcödé')).toBe('unicode');
        // Pre-composed and decomposed spellings must slug identically.
        expect(slugify('étude')).toBe(slugify('étude'));
        expect(slugify('Ⅻ ligature ﬁ')).toBe('xii-ligature-fi');
    });

    test('trims leading/trailing dashes', () => {
        expect(slugify('  — Annexe —  ')).toBe('annexe');
        expect(slugify('...Notes...')).toBe('notes');
    });

    test('falls back to "section" when nothing survives', () => {
        expect(slugify('')).toBe('section');
        expect(slugify('!!!')).toBe('section');
        expect(slugify('日本語')).toBe('section');
    });

    test('is deterministic and pure — same input, same output', () => {
        expect(slugify('Étude')).toBe(slugify('Étude'));
    });
});

describe('inlineText', () => {
    test('concatenates run text in document order', () => {
        const h = node('heading', { level: 2 }, [
            node('run', { text: 'Why ' }),
            node('run', { text: 'air-gap', bold: true }),
            node('run', { text: ' matters' })
        ]);
        expect(inlineText(h)).toBe('Why air-gap matters');
    });

    test('images contribute nothing (alt is not heading text)', () => {
        const h = node('heading', { level: 1 }, [
            node('image', { name: 'logo.png', alt: 'Logo' }),
            node('run', { text: 'Title' })
        ]);
        expect(inlineText(h)).toBe('Title');
    });

    test('is defensive about non-nodes', () => {
        expect(inlineText(null)).toBe('');
        expect(inlineText(undefined)).toBe('');
        expect(inlineText(node('hr'))).toBe('');
    });
});

describe('anchorIndex — the profile v1 `anchors:` block', () => {
    test('indexes headings in document order with their level', () => {
        const ir = doc([
            heading(1, 'Sovereign RAG ingestion'),
            node('paragraph', {}, [node('run', { text: 'body' })]),
            heading(2, 'Why air-gap matters'),
            heading(3, 'Chunking')
        ]);
        expect(anchorIndex(ir)).toEqual([
            { level: 1, anchor: 'sovereign-rag-ingestion' },
            { level: 2, anchor: 'why-air-gap-matters' },
            { level: 3, anchor: 'chunking' }
        ]);
    });

    test('suffixes collisions -1, -2 … in document order', () => {
        const ir = doc([
            heading(2, 'Notes'),
            heading(2, 'Notes'),
            heading(3, 'notes'),
            heading(2, 'Nôtes')
        ]);
        expect(anchorIndex(ir)).toEqual([
            { level: 2, anchor: 'notes' },
            { level: 2, anchor: 'notes-1' },
            { level: 3, anchor: 'notes-2' },
            { level: 2, anchor: 'notes-3' }
        ]);
    });

    test('accented duplicates share one slug family', () => {
        const ir = doc([heading(1, 'Étude'), heading(2, 'Etude')]);
        expect(anchorIndex(ir)).toEqual([
            { level: 1, anchor: 'etude' },
            { level: 2, anchor: 'etude-1' }
        ]);
    });

    test('reaches headings nested in blocks, still in document order', () => {
        const ir = doc([
            heading(1, 'Top'),
            node('blockquote', {}, [heading(2, 'Quoted')]),
            node('list', { ordered: false }, [
                node('listItem', {}, [heading(3, 'In a list')])
            ])
        ]);
        expect(anchorIndex(ir).map(a => a.anchor)).toEqual([
            'top', 'quoted', 'in-a-list'
        ]);
    });

    test('skips table cells — their headings render as inline cell text', () => {
        const ir = doc([
            heading(1, 'Top'),
            node('table', {}, [
                node('row', { header: true }, [
                    node('cell', {}, [heading(4, 'In a cell')])
                ])
            ])
        ]);
        expect(anchorIndex(ir).map(a => a.anchor)).toEqual(['top']);
    });

    test('clamps the level into 1..6 and never emits an empty anchor', () => {
        const ir = doc([
            { kind: 'heading', level: 0, children: [node('run', { text: '???' })] },
            { kind: 'heading', level: 42, children: [node('run', { text: '' })] }
        ]);
        expect(anchorIndex(ir)).toEqual([
            { level: 1, anchor: 'section' },
            { level: 6, anchor: 'section-1' }
        ]);
    });

    test('returns an empty index for a document without headings', () => {
        expect(anchorIndex(doc([node('hr')]))).toEqual([]);
        expect(anchorIndex(null)).toEqual([]);
    });
});
