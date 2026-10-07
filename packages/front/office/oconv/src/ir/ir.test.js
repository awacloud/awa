// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { oconvIr, IR_VERSION } from './ir.js';

// `oconvIr` declares no dependencies, so the factory is callable directly —
// no ModuleRuntime needed for a unit test of a pure data module.
const ir = oconvIr.factory();
const { node, doc, walk, validate, KINDS } = ir;

/** A tree covering every frozen node kind exactly once (at least). */
function fullTree() {
    return doc([
        node('heading', { level: 2 }, [node('run', { text: 'Title' })]),
        node('paragraph', {}, [
            node('run', { text: 'bold', bold: true }),
            node('run', { text: 'em', italic: true }),
            node('run', { text: 'gone', strike: true }),
            node('run', { text: 'x()', code: true }),
            node('run', { text: 'site', link: 'https://example.test/' }),
            node('image', { name: 'logo.png', alt: 'Logo' })
        ]),
        node('list', { ordered: true }, [
            node('listItem', {}, [
                node('paragraph', {}, [node('run', { text: 'item' })])
            ])
        ]),
        node('table', {}, [
            node('row', { header: true }, [
                node('cell', {}, [
                    node('paragraph', {}, [node('run', { text: 'h' })])
                ])
            ]),
            node('row', {}, [
                node('cell', {}, [
                    node('paragraph', {}, [node('run', { text: 'v' })])
                ])
            ])
        ]),
        node('codeBlock', { info: 'js', text: 'const a = 1;\n' }),
        node('blockquote', {}, [
            node('paragraph', {}, [node('run', { text: 'quoted' })])
        ]),
        node('hr')
    ]);
}

describe('oconvIr — descriptor', () => {
    test('is a dependency-free fw module descriptor', () => {
        expect(oconvIr.name).toBe('oconvIr');
        expect(oconvIr.dependencies).toEqual([]);
        expect(typeof oconvIr.factory).toBe('function');
    });

    test('IR_VERSION is frozen at oconv-ir/v1 and matches the export', () => {
        expect(ir.IR_VERSION).toBe('oconv-ir/v1');
        expect(IR_VERSION).toBe(ir.IR_VERSION);
    });

    test('KINDS is the frozen v1 vocabulary', () => {
        expect([...KINDS].sort()).toEqual([
            'blockquote', 'cell', 'codeBlock', 'document', 'heading', 'hr',
            'image', 'list', 'listItem', 'paragraph', 'row', 'run', 'table'
        ]);
    });
});

describe('oconvIr — node()', () => {
    test('fills the frozen defaults of every prop', () => {
        expect(node('run')).toEqual({
            kind: 'run', text: '', bold: false, italic: false,
            strike: false, code: false, link: null
        });
        expect(node('heading').level).toBe(1);
        expect(node('list').ordered).toBe(false);
        expect(node('codeBlock')).toEqual({ kind: 'codeBlock', info: '', text: '' });
    });

    test('containers get a children array, leaves get none', () => {
        expect(node('paragraph').children).toEqual([]);
        expect(Object.hasOwn(node('hr'), 'children')).toBe(false);
        expect(Object.hasOwn(node('run'), 'children')).toBe(false);
    });

    test('throws on an unknown kind', () => {
        expect(() => node('marquee')).toThrow(/unknown node kind/);
    });
});

describe('oconvIr — validate()', () => {
    test('accepts a tree covering every node kind', () => {
        const seen = new Set();
        walk(fullTree(), (n) => { seen.add(n.kind); });
        expect([...seen].sort()).toEqual([...KINDS].sort());

        const res = validate(fullTree());
        expect(res.errors).toEqual([]);
        expect(res.ok).toBe(true);
    });

    test('rejects an unknown kind', () => {
        const res = validate({ kind: 'marquee', children: [] });
        expect(res.ok).toBe(false);
        expect(res.errors[0].code).toBe('unknown-kind');
        expect(res.errors[0].path).toBe('$');
    });

    test('rejects a child of a kind the parent does not accept', () => {
        const bad = doc([node('run', { text: 'inline at block level' })]);
        const res = validate(bad);
        expect(res.ok).toBe(false);
        expect(res.errors.some(
            (e) => e.code === 'bad-child' && e.path === '$.children[0]'
        )).toBe(true);
    });

    test('rejects a malformed (non-object) child', () => {
        const res = validate(doc(['nope']));
        expect(res.ok).toBe(false);
        expect(res.errors.some(
            (e) => e.code === 'not-an-object' && e.path === '$.children[0]'
        )).toBe(true);
    });

    test('rejects a bad prop type and an out-of-range heading level', () => {
        expect(validate(node('heading', { level: 9 })).errors[0].code).toBe('bad-prop');
        expect(validate(node('run', { text: 42 })).errors[0].code).toBe('bad-prop');
        expect(validate(node('list', { ordered: 'yes' })).errors[0].code).toBe('bad-prop');
    });

    test('rejects children on a leaf and a non-array children on a container', () => {
        expect(validate({ kind: 'hr', children: [] }).errors[0].code)
            .toBe('unexpected-children');
        expect(validate({ kind: 'document', children: 'x' }).errors[0].code)
            .toBe('bad-children');
    });

    test('rejects a non-object escapes bag', () => {
        const res = validate(node('hr', { escapes: 'nope' }));
        expect(res.errors[0].code).toBe('bad-escapes');
    });

    test('reports nested errors with their path', () => {
        const tree = doc([node('blockquote', {}, [node('heading', { level: 0 })])]);
        const res = validate(tree);
        expect(res.ok).toBe(false);
        expect(res.errors[0].path).toBe('$.children[0].children[0]');
    });
});

describe('oconvIr — walk()', () => {
    test('visits depth-first in document order', () => {
        const tree = doc([
            node('heading', { level: 1 }, [node('run', { text: 'a' })]),
            node('blockquote', {}, [
                node('paragraph', {}, [
                    node('run', { text: 'b' }),
                    node('run', { text: 'c' })
                ])
            ]),
            node('hr')
        ]);
        const order = [];
        walk(tree, (n, parent, depth) => {
            order.push(`${depth}:${n.kind}${n.text ? `(${n.text})` : ''}`);
            if (depth === 0) expect(parent).toBeNull();
        });
        expect(order).toEqual([
            '0:document',
            '1:heading', '2:run(a)',
            '1:blockquote', '2:paragraph', '3:run(b)', '3:run(c)',
            '1:hr'
        ]);
    });

    test('reports the real parent of each node', () => {
        const run = node('run', { text: 'a' });
        const p = node('paragraph', {}, [run]);
        const tree = doc([p]);
        const parents = new Map();
        walk(tree, (n, parent) => { parents.set(n, parent); });
        expect(parents.get(tree)).toBeNull();
        expect(parents.get(p)).toBe(tree);
        expect(parents.get(run)).toBe(p);
    });

    test('returning false skips the subtree', () => {
        const tree = doc([
            node('paragraph', {}, [node('run', { text: 'skipped' })]),
            node('hr')
        ]);
        const seen = [];
        walk(tree, (n) => {
            seen.push(n.kind);
            return n.kind !== 'paragraph';
        });
        expect(seen).toEqual(['document', 'paragraph', 'hr']);
    });
});

describe('oconvIr — escapes bag', () => {
    test('survives construction by reference, untouched', () => {
        const bag = { docx: { rPr: { rFonts: 'Consolas' } }, list: [1, 2] };
        const n = node('run', { text: 'x', escapes: bag });
        expect(n.escapes).toBe(bag);
        expect(n.escapes.docx).toBe(bag.docx);
        expect(validate(n).ok).toBe(true);
    });

    test('is absent when not supplied, and never invented', () => {
        expect(Object.hasOwn(node('run', { text: 'x' }), 'escapes')).toBe(false);
    });

    test('an arbitrary opaque payload does not affect validation', () => {
        const n = node('hr', { escapes: { anything: Symbol('opaque') } });
        expect(validate(n).ok).toBe(true);
    });
});

describe('oconvIr — format agnosticism (F2)', () => {
    test('ir.js imports no @awacloud/ package', () => {
        const src = readFileSync(fileURLToPath(new URL('./ir.js', import.meta.url)), 'utf8');
        const specifiers = [...src.matchAll(/^\s*import\s[^\n]*?from\s*['"]([^'"]+)['"]/gm)]
            .map((m) => m[1]);
        expect(specifiers).toEqual([]);
        expect(src).not.toMatch(/from\s*['"]@awacloud\//);
        expect(src).not.toMatch(/import\s*\(\s*['"]@awacloud\//);
    });
});
