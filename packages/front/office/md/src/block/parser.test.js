// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for the block parser (`./parser.js`).
 *
 * Each test calls `blockParser.factory().parse(text)` and asserts on
 * the shape of the resulting document tree.
 */

import { describe, test, expect } from 'bun:test';
import { testRuntime } from './_test-runtime.js';

const bp = testRuntime.resolve('blockParser');
const parse = (s) => bp.parse(s);

describe('blockParser — ATX headings', () => {
    test('# foo → h1', () => {
        const { document } = parse('# foo\n');
        const h = document.firstChild;
        expect(h.type).toBe('heading');
        expect(h.level).toBe(1);
        expect(h.firstChild.type).toBe('text');
        expect(h.firstChild.literal).toBe('foo');
    });

    test('## bar → h2', () => {
        const h = parse('## bar\n').document.firstChild;
        expect(h.type).toBe('heading');
        expect(h.level).toBe(2);
    });

    test('levels 1..6', () => {
        for (let i = 1; i <= 6; i++) {
            const src = '#'.repeat(i) + ' x\n';
            const h = parse(src).document.firstChild;
            expect(h.type).toBe('heading');
            expect(h.level).toBe(i);
        }
    });

    test('trailing #s are stripped', () => {
        const h = parse('# foo ###\n').document.firstChild;
        expect(h.type).toBe('heading');
        expect(h.firstChild.literal).toBe('foo');
    });

    test('7 #s is NOT a heading', () => {
        const p = parse('####### foo\n').document.firstChild;
        expect(p.type).toBe('paragraph');
    });
});

describe('blockParser — Setext headings', () => {
    test('Foo\\n=== → h1', () => {
        const h = parse('Foo\n===\n').document.firstChild;
        expect(h.type).toBe('heading');
        expect(h.level).toBe(1);
    });

    test('Foo\\n--- → h2', () => {
        const h = parse('Foo\n---\n').document.firstChild;
        expect(h.type).toBe('heading');
        expect(h.level).toBe(2);
    });
});

describe('blockParser — Thematic breaks', () => {
    test('---', () => {
        const t = parse('---\n').document.firstChild;
        expect(t.type).toBe('thematic_break');
    });
    test('***', () => {
        expect(parse('***\n').document.firstChild.type).toBe('thematic_break');
    });
    test('___', () => {
        expect(parse('___\n').document.firstChild.type).toBe('thematic_break');
    });
    test('up to 3 spaces of indent', () => {
        expect(parse('   ---\n').document.firstChild.type).toBe('thematic_break');
    });
    test('4 spaces becomes code block', () => {
        expect(parse('    ---\n').document.firstChild.type).toBe('code_block');
    });
});

describe('blockParser — Fenced code', () => {
    test('``` ... ``` with info', () => {
        const c = parse('```js\nconsole.log(1)\n```\n').document.firstChild;
        expect(c.type).toBe('code_block');
        expect(c.isFenced).toBe(true);
        expect(c.info).toBe('js');
        expect(c.literal).toBe('console.log(1)\n');
    });

    test('tilde fences', () => {
        const c = parse('~~~\nhi\n~~~\n').document.firstChild;
        expect(c.type).toBe('code_block');
        expect(c.literal).toBe('hi\n');
    });
});

describe('blockParser — Indented code', () => {
    test('4 spaces', () => {
        const c = parse('    foo\n    bar\n').document.firstChild;
        expect(c.type).toBe('code_block');
        expect(c.isFenced).toBe(false);
        expect(c.literal).toBe('foo\nbar\n');
    });
});

describe('blockParser — Block quote', () => {
    test('> foo\\n> bar', () => {
        const bq = parse('> foo\n> bar\n').document.firstChild;
        expect(bq.type).toBe('block_quote');
        const p = bq.firstChild;
        expect(p.type).toBe('paragraph');
        expect(p.firstChild.literal).toBe('foo\nbar');
    });
});

describe('blockParser — Lists', () => {
    test('bullet list', () => {
        const list = parse('- a\n- b\n').document.firstChild;
        expect(list.type).toBe('list');
        expect(list.listType).toBe('bullet');
        expect(list.listBulletChar).toBe('-');
        expect(list.firstChild.type).toBe('item');
        expect(list.lastChild.type).toBe('item');
    });

    test('ordered list with start', () => {
        const list = parse('1. a\n2. b\n').document.firstChild;
        expect(list.type).toBe('list');
        expect(list.listType).toBe('ordered');
        expect(list.listStart).toBe(1);
        expect(list.listDelimiter).toBe('.');
    });

    test('ordered list with delimiter )', () => {
        const list = parse('3) a\n4) b\n').document.firstChild;
        expect(list.listDelimiter).toBe(')');
        expect(list.listStart).toBe(3);
    });

    test('tight list', () => {
        const list = parse('- a\n- b\n').document.firstChild;
        expect(list.listTight).toBe(true);
    });

    test('loose list (blank line between items)', () => {
        const list = parse('- a\n\n- b\n').document.firstChild;
        expect(list.type).toBe('list');
        expect(list.listTight).toBe(false);
    });
});

describe('blockParser — Nested structures', () => {
    test('blockquote containing list', () => {
        const bq = parse('> - a\n> - b\n').document.firstChild;
        expect(bq.type).toBe('block_quote');
        const list = bq.firstChild;
        expect(list.type).toBe('list');
        expect(list.firstChild.type).toBe('item');
    });

    test('list containing blockquote', () => {
        const list = parse('- > inner\n').document.firstChild;
        expect(list.type).toBe('list');
        const item = list.firstChild;
        expect(item.type).toBe('item');
        expect(item.firstChild.type).toBe('block_quote');
    });
});

describe('blockParser — HTML blocks', () => {
    test('type 6 : <div>', () => {
        const h = parse('<div>\nhello\n</div>\n').document.firstChild;
        expect(h.type).toBe('html_block');
        expect(h.htmlBlockType).toBe(6);
        expect(h.literal).toContain('<div>');
    });

    test('type 2 : HTML comment', () => {
        const h = parse('<!-- hi -->\n').document.firstChild;
        expect(h.type).toBe('html_block');
        expect(h.htmlBlockType).toBe(2);
    });
});

describe('blockParser — Link reference definitions', () => {
    test('definition is captured in refmap', () => {
        const { document, refmap } = parse('[foo]: /url "title"\n\n[foo]\n');
        expect(refmap.FOO).toBeDefined();
        expect(refmap.FOO.destination).toBe('/url');
        expect(refmap.FOO.title).toBe('title');
        // The first node should be the paragraph containing [foo] —
        // the definition-only paragraph is removed.
        expect(document.firstChild.type).toBe('paragraph');
    });

    test('definition without title', () => {
        const { refmap } = parse('[bar]: /baz\n');
        expect(refmap.BAR).toBeDefined();
        expect(refmap.BAR.destination).toBe('/baz');
        expect(refmap.BAR.title).toBeNull();
    });

    test('normalized label (case-fold)', () => {
        const { refmap } = parse('[FOO]: /x\n');
        expect(refmap.FOO).toBeDefined();
    });
});

describe('blockParser — Paragraphs', () => {
    test('adjacent lines merged into one paragraph', () => {
        const p = parse('foo\nbar\nbaz\n').document.firstChild;
        expect(p.type).toBe('paragraph');
        expect(p.firstChild.literal).toBe('foo\nbar\nbaz');
    });

    test('blank line separates paragraphs', () => {
        const doc = parse('foo\n\nbar\n').document;
        expect(doc.firstChild.type).toBe('paragraph');
        expect(doc.firstChild.next.type).toBe('paragraph');
    });
});

describe('blockParser — Empty / edge cases', () => {
    test('empty document', () => {
        const doc = parse('').document;
        expect(doc.type).toBe('document');
        expect(doc.firstChild).toBeNull();
    });

    test('only whitespace', () => {
        const doc = parse('   \n\n').document;
        expect(doc.firstChild).toBeNull();
    });

    test('parse throws on non-string input', () => {
        expect(() => parse(123)).toThrow();
    });
});
