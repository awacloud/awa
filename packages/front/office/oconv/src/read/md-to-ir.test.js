// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require as mdFwRequire, modules as mdModules } from '@awacloud/md';
import { mdFrontmatter } from '@awacloud/md/extra/frontmatter.js';
import { oconvIr } from '../ir/ir.js';
import { oconvMdToIr } from './md-to-ir.js';

// Spike-proven pattern (`docx-to-ir.test.js`): a unit test hand-registers
// the needed descriptors on a local `ModuleRuntime` rather than going
// through a package composition root (task 04's concern). `md`'s own
// `fw_require`/`modules` plus the opt-in `mdFrontmatter` extra are
// registered exactly the way the plan's "Tests to cover" section
// prescribes.
let mdToIr;
let validate;

beforeAll(() => {
    const runtime = new ModuleRuntime();
    runtime.registerAll(mdFwRequire);
    runtime.registerAll(mdModules);
    runtime.register(mdFrontmatter);
    runtime.register(oconvIr);
    runtime.register(oconvMdToIr);

    ({ mdToIr } = runtime.resolve('oconvMdToIr'));
    ({ validate } = runtime.resolve('oconvIr'));
});

/** IR `run` node literal builder, matching `oconvIr.node('run', …)` defaults. */
function run(text, flags) {
    const f = flags || {};
    return {
        kind: 'run', text,
        bold: !!f.bold, italic: !!f.italic, strike: !!f.strike, code: !!f.code,
        link: f.link === undefined ? null : f.link
    };
}

describe('oconvMdToIr — descriptor', () => {
    test('is a fw module descriptor with the prescribed dependencies', () => {
        expect(oconvMdToIr.name).toBe('oconvMdToIr');
        expect(oconvMdToIr.dependencies).toEqual(['oconvIr', 'md', 'mdFrontmatter']);
        expect(typeof oconvMdToIr.factory).toBe('function');
    });
});

describe('oconvMdToIr — throw / empty input', () => {
    test('throws on a non-string input', () => {
        expect(() => mdToIr(42)).toThrow('oconv: markdown must be a string');
    });

    test('empty string → empty IR document, no throw', () => {
        const { ir, losses, frontmatter } = mdToIr('');
        expect(validate(ir).ok).toBe(true);
        expect(ir).toEqual({ kind: 'document', children: [] });
        expect(losses).toEqual([]);
        expect(frontmatter).toBeNull();
    });

    test('whitespace-only string → empty IR document, no throw', () => {
        const { ir, losses } = mdToIr('   \n\t\n  \n');
        expect(validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([]);
        expect(losses).toEqual([]);
    });
});

describe('oconvMdToIr — composite structural fixture', () => {
    const FULL_MD = [
        '# Doc Title',
        '',
        '## Section Two',
        '',
        '### Section Three',
        '',
        'Plain **bold** *italic* ~~strike~~ `code` text.',
        '',
        'A [link](https://example.test/) here.',
        '',
        '- bullet one',
        '- bullet two',
        '  - nested bullet',
        '',
        '1. ordered one',
        '2. ordered two',
        '',
        '| Name | Score |',
        '| --- | --- |',
        '| Alice | 10 |',
        '| Bob | 20 |',
        '',
        '![A figure](figure.png)',
        ''
    ].join('\n');

    let ir;
    let losses;

    beforeAll(() => {
        ({ ir, losses } = mdToIr(FULL_MD));
    });

    test('validates against the frozen oconv-ir/v1 schema', () => {
        const res = validate(ir);
        expect(res.errors).toEqual([]);
        expect(res.ok).toBe(true);
    });

    test('produces no losses on this construct (non-vacuity control)', () => {
        expect(losses).toEqual([]);
    });

    test('maps h1/h2/h3 headings by level', () => {
        expect(ir.children[0]).toEqual({
            kind: 'heading', level: 1, children: [run('Doc Title')]
        });
        expect(ir.children[1]).toEqual({
            kind: 'heading', level: 2, children: [run('Section Two')]
        });
        expect(ir.children[2]).toEqual({
            kind: 'heading', level: 3, children: [run('Section Three')]
        });
    });

    test('flattens nested emphasis/strike/code into per-run flag sets', () => {
        expect(ir.children[3]).toEqual({
            kind: 'paragraph',
            children: [
                run('Plain '),
                run('bold', { bold: true }),
                run(' '),
                run('italic', { italic: true }),
                run(' '),
                run('strike', { strike: true }),
                run(' '),
                run('code', { code: true }),
                run(' text.')
            ]
        });
    });

    test('resolves the link target onto the run(s) inside it', () => {
        expect(ir.children[4]).toEqual({
            kind: 'paragraph',
            children: [
                run('A '),
                run('link', { link: 'https://example.test/' }),
                run(' here.')
            ]
        });
    });

    test('groups the bullet list, preserving the nested list under its listItem', () => {
        const list1 = ir.children[5];
        expect(list1.kind).toBe('list');
        expect(list1.ordered).toBe(false);
        expect(list1.children).toHaveLength(2);
        expect(list1.children[0]).toEqual({
            kind: 'listItem',
            children: [{ kind: 'paragraph', children: [run('bullet one')] }]
        });
        const item2 = list1.children[1];
        expect(item2.kind).toBe('listItem');
        expect(item2.children).toHaveLength(2);
        expect(item2.children[0]).toEqual({
            kind: 'paragraph', children: [run('bullet two')]
        });
        expect(item2.children[1]).toEqual({
            kind: 'list', ordered: false,
            children: [{
                kind: 'listItem',
                children: [{ kind: 'paragraph', children: [run('nested bullet')] }]
            }]
        });
    });

    test('maps the ordered list with ordered:true and no start loss (start=1)', () => {
        const list2 = ir.children[6];
        expect(list2.kind).toBe('list');
        expect(list2.ordered).toBe(true);
        expect(list2.children).toEqual([
            { kind: 'listItem', children: [{ kind: 'paragraph', children: [run('ordered one')] }] },
            { kind: 'listItem', children: [{ kind: 'paragraph', children: [run('ordered two')] }] }
        ]);
    });

    test('maps the GFM table, header row flagged, cells wrapped in one paragraph', () => {
        const table = ir.children[7];
        expect(table.kind).toBe('table');
        expect(table.children).toHaveLength(3);
        const [header, row1, row2] = table.children;
        expect(header.kind).toBe('row');
        expect(header.header).toBe(true);
        expect(header.children).toEqual([
            { kind: 'cell', children: [{ kind: 'paragraph', children: [run('Name')] }] },
            { kind: 'cell', children: [{ kind: 'paragraph', children: [run('Score')] }] }
        ]);
        expect(row1.header).toBe(false);
        expect(row1.children[0].children[0].children[0].text).toBe('Alice');
        expect(row1.children[1].children[0].children[0].text).toBe('10');
        expect(row2.header).toBe(false);
        expect(row2.children[0].children[0].children[0].text).toBe('Bob');
        expect(row2.children[1].children[0].children[0].text).toBe('20');
    });

    test('maps the standalone image reference, wrapped in its paragraph', () => {
        expect(ir.children[8]).toEqual({
            kind: 'paragraph',
            children: [{ kind: 'image', name: 'figure.png', alt: 'A figure' }]
        });
    });
});

describe('oconvMdToIr — front matter', () => {
    test('yaml fence (---) is stripped, lang recorded, loss pushed', () => {
        const { ir, losses, frontmatter } = mdToIr('---\ntitle: X\n---\n# Body\n');
        expect(frontmatter).not.toBeNull();
        expect(frontmatter.lang).toBe('yaml');
        expect(frontmatter.content.trim()).toBe('title: X');
        expect(losses).toEqual([{ code: 'frontmatter/stripped', detail: 'yaml' }]);
        expect(ir.children).toEqual([{ kind: 'heading', level: 1, children: [run('Body')] }]);
    });

    test('toml fence (+++) is stripped, lang recorded', () => {
        const { losses, frontmatter } = mdToIr("+++\nlang = 'toml'\n+++\n# Body\n");
        expect(frontmatter.lang).toBe('toml');
        expect(losses).toEqual([{ code: 'frontmatter/stripped', detail: 'toml' }]);
    });

    test('json fence (;;;) is stripped, lang recorded', () => {
        const { losses, frontmatter } = mdToIr(';;;\n{"a":1}\n;;;\n# Body\n');
        expect(frontmatter.lang).toBe('json');
        expect(losses).toEqual([{ code: 'frontmatter/stripped', detail: 'json' }]);
    });

    test('document without front matter → frontmatter null, no such loss', () => {
        const { losses, frontmatter } = mdToIr('# Body\n');
        expect(frontmatter).toBeNull();
        expect(losses).toEqual([]);
    });

    test('a "---" not at position 0 parses as content (thematic break), not front matter', () => {
        const { ir, losses, frontmatter } = mdToIr('Body text\n\n---\n');
        expect(frontmatter).toBeNull();
        expect(losses).toEqual([]);
        expect(ir.children).toEqual([
            { kind: 'paragraph', children: [run('Body text')] },
            { kind: 'hr' }
        ]);
    });
});

describe('oconvMdToIr — loss ledger falsification', () => {
    test('list/start-dropped: an ordered list starting above 1', () => {
        const { ir, losses } = mdToIr('3. three\n4. four\n');
        expect(ir.children[0].ordered).toBe(true);
        expect(losses).toEqual([{ code: 'list/start-dropped', detail: 'start=3' }]);
    });

    test('table/align-dropped: a GFM table declaring column alignment', () => {
        const md = [
            '| A | B |',
            '| :---: | --- |',
            '| a | b |',
            ''
        ].join('\n');
        const { losses } = mdToIr(md);
        expect(losses).toEqual([{ code: 'table/align-dropped', detail: 'center,' }]);
    });

    test('inline/linebreak-degraded: a trailing-double-space hard break', () => {
        const { ir, losses } = mdToIr('line one  \nline two\n');
        expect(losses).toEqual([{ code: 'inline/linebreak-degraded', detail: 'hard break' }]);
        expect(ir.children[0]).toEqual({
            kind: 'paragraph', children: [run('line one line two')]
        });
    });

    test('block/dropped: an <div> html block', () => {
        const { ir, losses } = mdToIr('<div>\nhello\n</div>\n');
        expect(losses).toEqual([{ code: 'block/dropped', detail: 'html_block' }]);
        expect(ir.children).toEqual([]);
    });

    test('list/task-marker-dropped: a GFM task-list checkbox', () => {
        const { ir, losses } = mdToIr('- [x] done\n- [ ] todo\n');
        expect(losses).toEqual([
            { code: 'list/task-marker-dropped', detail: '[x]' },
            { code: 'list/task-marker-dropped', detail: '[ ]' }
        ]);
        const items = ir.children[0].children;
        expect(items[0].children[0].children[0].text).toBe('done');
        expect(items[1].children[0].children[0].text).toBe('todo');
    });

    test('non-vacuity control: a plain loss-free fixture records zero losses', () => {
        const { losses } = mdToIr('Hello world.\n\nSecond paragraph.\n');
        expect(losses).toEqual([]);
    });

    test('inline/dropped (link-title): a non-empty link title is dropped, target kept', () => {
        const { ir, losses } = mdToIr('A [link](https://example.test/ "a title") here.\n');
        expect(losses).toEqual([{ code: 'inline/dropped', detail: 'link-title' }]);
        expect(ir.children[0]).toEqual({
            kind: 'paragraph',
            children: [
                run('A '),
                run('link', { link: 'https://example.test/' }),
                run(' here.')
            ]
        });
    });

    test('a link with no title records no inline/dropped loss', () => {
        const { losses } = mdToIr('[link](https://example.test/)\n');
        expect(losses).toEqual([]);
    });
});

describe('oconvMdToIr — inline exhaustive-else guard', () => {
    test('an unmapped inline node (html_inline) is recorded, never silent', () => {
        const { ir, losses } = mdToIr('Text <span>inline</span> more.\n');
        expect(ir.children[0].kind).toBe('paragraph');
        const dropped = losses.filter(l => l.code === 'inline/dropped');
        expect(dropped).toEqual([
            { code: 'inline/dropped', detail: 'html_inline' },
            { code: 'inline/dropped', detail: 'html_inline' }
        ]);
    });
});

describe('oconvMdToIr — block exhaustive-else guard', () => {
    // Constructed via a hand-built (plain-object, duck-typed) AST document
    // fed through a stub `md`/`mdFrontmatter` pair on a dedicated runtime —
    // `md.parse` never itself produces an unrecognised node type, so the
    // walker's exhaustive-else branch is only reachable this way (plan
    // "Tests to cover": "constructed via mdNode or a plain object").
    test('an unknown block node kind is recorded as block/dropped, never thrown', () => {
        const stubMd = {
            name: 'md',
            dependencies: [],
            factory() {
                return {
                    parse() {
                        return {
                            type: 'document',
                            firstChild: { type: 'mystery_block', firstChild: null, next: null },
                            next: null
                        };
                    }
                };
            }
        };
        const stubFrontmatter = {
            name: 'mdFrontmatter',
            dependencies: [],
            factory() {
                return { stripFrontmatter: (text) => ({ rest: text, frontmatter: null }) };
            }
        };

        const runtime = new ModuleRuntime();
        runtime.register(oconvIr);
        runtime.register(stubMd);
        runtime.register(stubFrontmatter);
        runtime.register(oconvMdToIr);

        const { mdToIr: stubMdToIr } = runtime.resolve('oconvMdToIr');
        const { validate: stubValidate } = runtime.resolve('oconvIr');

        expect(() => stubMdToIr('irrelevant — parse() is stubbed')).not.toThrow();
        const { ir, losses } = stubMdToIr('irrelevant — parse() is stubbed');
        expect(stubValidate(ir).ok).toBe(true);
        expect(ir.children).toEqual([]);
        expect(losses).toEqual([{ code: 'block/dropped', detail: 'mystery_block' }]);
    });
});
