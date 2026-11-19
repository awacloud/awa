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
            node('image', { name: 'logo.png', alt: 'Logo' }),
            node('field', { name: 'page', text: '1' }),
            node('note', { class: 'footnote' }, [node('paragraph', {}, [node('run', { text: 'a note' })])])
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

    test('IR_VERSION is oconv-ir/v2 and matches the export', () => {
        expect(ir.IR_VERSION).toBe('oconv-ir/v2');
        expect(IR_VERSION).toBe(ir.IR_VERSION);
    });

    test("KINDS is the v1 vocabulary plus v2's field (T80) and note (T81)", () => {
        expect([...KINDS].sort()).toEqual([
            'blockquote', 'cell', 'codeBlock', 'document', 'field', 'heading', 'hr',
            'image', 'list', 'listItem', 'note', 'paragraph', 'row', 'run', 'table'
        ]);
    });
});

describe('oconvIr — node()', () => {
    test('fills the frozen defaults of every prop', () => {
        expect(node('run')).toEqual({
            kind: 'run', text: '', bold: false, italic: false,
            strike: false, code: false, link: null, size: null, font: null, color: null, underline: false, script: null
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

// T27 (a), D36 B: oconv-ir/v2 is v1 plus optional typed props; (a) adds the
// document's page.
describe('oconvIr — v2: document.page (T27 a)', () => {
    const page = { width: 595.3, height: 841.9, orientation: 'portrait', margins: { top: 72, right: 72, bottom: 72, left: 72 } };

    test('node() defaults page to null; a given page is stored as given', () => {
        expect(doc([])).toEqual({ kind: 'document', page: null, header: null, footer: null, children: [] });
        expect(doc([], { page }).page).toBe(page);
        expect(validate(doc([], { page })).ok).toBe(true);
        expect(validate(doc([], { page: { ...page, orientation: 'landscape', margins: null } })).ok).toBe(true);
    });

    test('a v1-shaped document, with no page key, validates unchanged', () => {
        expect(validate({ kind: 'document', children: [{ kind: 'hr' }] })).toEqual({ ok: true, errors: [] });
        expect(validate(fullTree()).ok).toBe(true);
    });

    test.each([
        ['a string', 'A4'],
        ['no width', { height: 10, orientation: 'portrait', margins: null }],
        ['a zero height', { ...page, height: 0 }],
        ['an infinite width', { ...page, width: Infinity }],
        ['a bad orientation', { ...page, orientation: 'square' }],
        ['a negative margin', { ...page, margins: { ...page.margins, left: -1 } }],
        ['a missing margin side', { ...page, margins: { top: 1, right: 1, bottom: 1 } }],
        ['margins not an object', { ...page, margins: 3 }],
        ['an array', [595, 842]]
    ])('a page that is %s fails with bad-prop', (_, bad) => {
        const v = validate({ kind: 'document', page: bad, children: [] });
        expect(v.ok).toBe(false);
        expect(v.errors[0]).toMatchObject({ path: '$', code: 'bad-prop', message: 'document.page must be page' });
    });
});

// T27 (b), D36 B: paragraph and heading alignment and the page break before.
describe('oconvIr — v2: align and breakBefore (T27 b)', () => {
    test('node() defaults align to null and breakBefore to false on paragraph and heading', () => {
        expect(node('paragraph')).toEqual({ kind: 'paragraph', align: null, breakBefore: false, children: [] });
        expect(node('heading', { level: 2 })).toEqual({ kind: 'heading', level: 2, align: null, breakBefore: false, children: [] });
        const p = node('paragraph', { align: 'center', breakBefore: true });
        expect([p.align, p.breakBefore]).toEqual(['center', true]);
        for (const align of ['start', 'center', 'end', 'justify', null]) {
            expect(validate(doc([node('heading', { level: 1, align })])).ok).toBe(true);
        }
    });

    test('v1-shaped paragraphs and headings, without the keys, validate', () => {
        expect(validate({ kind: 'document', children: [{ kind: 'paragraph', children: [] }, { kind: 'heading', level: 1, children: [] }] }).ok).toBe(true);
    });

    test.each([
        ['align', 'left'], ['align', 'CENTER'], ['align', 1], ['breakBefore', 'yes'], ['breakBefore', null], ['breakBefore', 1]
    ])('a paragraph whose %s is %p fails with bad-prop', (key, value) => {
        const v = validate({ kind: 'document', children: [{ kind: 'paragraph', [key]: value, children: [] }] });
        expect(v.ok).toBe(false);
        expect(v.errors[0]).toMatchObject({ code: 'bad-prop', path: '$.children[0]' });
    });
});

// T27 (c), D36 B: run size, font, colour, underline and script.
describe('oconvIr — v2: the run props (T27 c)', () => {
    test('node() defaults them: size, font, color and script null, underline false', () => {
        expect(node('run', { text: 'x' })).toEqual({
            kind: 'run', text: 'x', bold: false, italic: false, strike: false, code: false, link: null,
            size: null, font: null, color: null, underline: false, script: null
        });
        const r = node('run', { text: 'y', size: 10.5, font: 'Liberation Serif', color: '#1f4e79', underline: true, script: 'super' });
        expect(validate(doc([node('paragraph', {}, [r])])).ok).toBe(true);
        expect(validate(doc([node('paragraph', {}, [node('run', { script: 'sub' })])])).ok).toBe(true);
    });

    test('a v1-shaped run, without the keys, validates', () => {
        expect(validate({ kind: 'document', children: [{ kind: 'paragraph', children: [{ kind: 'run', text: 'a', bold: false, italic: false, strike: false, code: false, link: null }] }] }).ok).toBe(true);
    });

    test.each([
        ['size', 0], ['size', -2], ['size', Infinity], ['size', '12'],
        ['font', ''], ['font', 3],
        ['color', 'red'], ['color', '#1F4E79'], ['color', '#12345'],
        ['underline', null], ['underline', 'single'],
        ['script', 'superscript'], ['script', true]
    ])('a run whose %s is %p fails with bad-prop', (key, value) => {
        const v = validate({ kind: 'document', children: [{ kind: 'paragraph', children: [{ kind: 'run', text: 'a', bold: false, italic: false, strike: false, code: false, link: null, [key]: value }] }] });
        expect(v.ok).toBe(false);
        expect(v.errors[0]).toMatchObject({ code: 'bad-prop' });
    });
});

// T80: the header and footer regions, the field kind.
describe('oconvIr — v2: header, footer and field (T80)', () => {
    const para = (text) => node('paragraph', {}, [node('run', { text })]);

    test('node() defaults header and footer to null and a field to page, empty text', () => {
        expect(doc([]).header).toBeNull();
        expect(doc([]).footer).toBeNull();
        expect(node('field')).toEqual({ kind: 'field', name: 'page', text: '', bold: false, italic: false, strike: false, code: false, size: null, font: null, color: null, underline: false, script: null });
        expect(node('field', { name: 'pages', text: '12' })).toMatchObject({ kind: 'field', name: 'pages', text: '12' });
        expect(Object.hasOwn(node('field'), 'children')).toBe(false);
    });

    test('the three slots validate: default blocks, first and even null or blocks', () => {
        const header = { default: [para('h')], first: null, even: [] };
        const footer = { default: [], first: [node('paragraph', {}, [node('run', { text: 'p. ' }), node('field', { text: '1' })])], even: null };
        const d = doc([para('body')], { header, footer });
        expect(d.header).toBe(header);
        expect(validate(d)).toEqual({ ok: true, errors: [] });
        expect(validate(doc([], { header: { default: [para('h')] } })).ok).toBe(true);
    });

    test.each([
        ['a string', 'h'],
        ['an array', [para('h')]],
        ['no default', { first: null, even: null }],
        ['a null default', { default: null, first: null, even: null }],
        ['a first that is an object', { default: [], first: {}, even: null }],
        ['an even that is a string', { default: [], first: null, even: 'x' }]
    ])('a header that is %s fails with bad-prop', (_, bad) => {
        const v = validate({ kind: 'document', header: bad, children: [] });
        expect(v.ok).toBe(false);
        expect(v.errors[0]).toMatchObject({ path: '$', code: 'bad-prop', message: 'document.header must be region' });
    });

    test("a slot's blocks are checked as the body's, with their paths", () => {
        const v = validate({ kind: 'document', footer: { default: [node('run', { text: 'x' })], first: [para('a'), { kind: 'paragraph', children: [{ kind: 'hr' }] }], even: null }, children: [] });
        expect(v.ok).toBe(false);
        expect(v.errors.map((e) => [e.path, e.code])).toEqual([
            ['$.footer.default[0]', 'bad-child'],
            ['$.footer.first[1].children[0]', 'bad-child']
        ]);
    });

    test.each([
        ['name', 'date'], ['name', null], ['text', 3], ['text', null]
    ])('a field whose %s is %p fails with bad-prop', (key, value) => {
        const v = validate(doc([node('paragraph', {}, [{ kind: 'field', name: 'page', text: '', [key]: value }])]));
        expect(v.ok).toBe(false);
        expect(v.errors[0]).toMatchObject({ code: 'bad-prop', path: '$.children[0].children[0]' });
    });

    test('a field is inline only', () => {
        const v = validate(doc([node('field')]));
        expect(v.errors[0]).toMatchObject({ code: 'bad-child', path: '$.children[0]' });
        expect(validate(doc([node('heading', { level: 1 }, [node('field', { name: 'pages' })])])).ok).toBe(true);
    });

    test('withFieldsAsRuns returns a tree without a field as it is', () => {
        const d = doc([para('a')], { header: { default: [para('h')], first: null, even: null } });
        expect(ir.withFieldsAsRuns(d)).toBe(d);
    });

    test('withFieldsAsRuns turns each field into a plain run of its text, in the body and the slots', () => {
        const kept = para('kept');
        const d = doc([kept, node('paragraph', { align: 'center' }, [node('run', { text: 'p. ', bold: true }), node('field', { text: '3' })])],
            { footer: { default: [node('paragraph', {}, [node('field', { name: 'pages', text: '9' })])], first: null, even: [kept] } });
        const out = ir.withFieldsAsRuns(d);
        expect(out).not.toBe(d);
        expect(out.children[0]).toBe(kept);
        expect(out.children[1].align).toBe('center');
        expect(out.children[1].children[1]).toEqual(node('run', { text: '3' }));
        expect(out.footer.default[0].children[0]).toEqual(node('run', { text: '9' }));
        expect(out.footer.even[0]).toBe(kept);
        expect(validate(out).ok).toBe(true);
        expect(d.children[1].children[1].kind).toBe('field');
    });
});

// T80, amended: a field carries a run's formatting props.
describe("oconvIr — v2: a field's run props (T80, amended)", () => {
    test("a field states a run's props, checked as a run's; it has no link", () => {
        const f = node('field', { text: '3', bold: true, size: 9, font: 'Liberation Sans', color: '#1f4e79', underline: true, script: 'super', link: 'x' });
        expect(f).toMatchObject({ bold: true, size: 9, font: 'Liberation Sans', color: '#1f4e79', underline: true, script: 'super' });
        expect(Object.hasOwn(f, 'link')).toBe(false);
        expect(validate(doc([node('paragraph', {}, [f])])).ok).toBe(true);
        for (const [key, value] of [['size', 0], ['bold', 'yes'], ['color', 'red']]) {
            const v = validate(doc([node('paragraph', {}, [{ ...node('field'), [key]: value }])]));
            expect(v.errors[0]).toMatchObject({ code: 'bad-prop', path: '$.children[0].children[0]' });
        }
    });

    test("withFieldsAsRuns gives the run the field's props", () => {
        const d = doc([node('paragraph', {}, [node('field', { text: '7', bold: true, size: 9 })])]);
        expect(ir.withFieldsAsRuns(d).children[0].children[0]).toEqual(node('run', { text: '7', bold: true, size: 9 }));
    });
});

// T81: the inline note, holding its blocks.
describe('oconvIr — v2: the note (T81)', () => {
    const body = () => [node('paragraph', {}, [node('run', { text: 'n' })])];

    test('node() defaults a note to a footnote with an automatic mark; it holds blocks', () => {
        expect(node('note')).toEqual({ kind: 'note', class: 'footnote', mark: null, children: [] });
        const n = node('note', { class: 'endnote', mark: '*' }, body());
        expect(validate(doc([node('paragraph', {}, [node('run', { text: 'x' }), n])])).ok).toBe(true);
    });

    test.each([
        ['class', 'sidenote'], ['class', null], ['mark', ''], ['mark', 3]
    ])('a note whose %s is %p fails with bad-prop', (key, value) => {
        const v = validate(doc([node('paragraph', {}, [{ ...node('note', {}, body()), [key]: value }])]));
        expect(v.errors[0]).toMatchObject({ code: 'bad-prop', path: '$.children[0].children[0]' });
    });

    test("a note's blocks are checked under its path; a note is inline only", () => {
        const v = validate(doc([node('paragraph', {}, [node('note', {}, [node('run', { text: 'x' })])])]));
        expect(v.errors[0]).toMatchObject({ code: 'bad-child', path: '$.children[0].children[0].children[0]' });
        expect(validate(doc([node('note')])).errors[0]).toMatchObject({ code: 'bad-child', path: '$.children[0]' });
    });

    test("walk reaches a note's body", () => {
        const seen = [];
        walk(doc([node('paragraph', {}, [node('note', {}, body())])]), (n) => { seen.push(n.kind); });
        expect(seen).toEqual(['document', 'paragraph', 'note', 'paragraph', 'run']);
    });

    test('withoutNotes returns a tree without a note as it is', () => {
        const d = doc([node('paragraph', {}, [node('run', { text: 'a' })])]);
        const out = ir.withoutNotes(d);
        expect(out.ir).toBe(d);
        expect(out.dropped).toEqual([]);
    });

    test('withoutNotes removes each note, in the body and the regions, and lists their classes in order', () => {
        const kept = node('paragraph', {}, [node('run', { text: 'kept' })]);
        const d = doc([node('paragraph', {}, [node('run', { text: 'a' }), node('note', {}, body()), node('run', { text: 'b' })]), kept,
            node('paragraph', {}, [node('note', { class: 'endnote' }, body())])],
            { footer: { default: [node('paragraph', {}, [node('note', {}, body())])], first: null, even: null } });
        const out = ir.withoutNotes(d);
        expect(out.dropped).toEqual(['footnote', 'endnote', 'footnote']);
        expect(out.ir.children[0].children.map((c) => c.text)).toEqual(['a', 'b']);
        expect(out.ir.children[1]).toBe(kept);
        // The third paragraph held only a note: it goes with it.
        expect(out.ir.children).toHaveLength(2);
        expect(out.ir.footer.default).toEqual([]);
        expect(d.children[0].children).toHaveLength(3);
    });
});
