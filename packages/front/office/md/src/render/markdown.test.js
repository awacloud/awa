// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Roundtrip tests for the Markdown renderer.
 *
 * Strategy : parse → render → re-parse → assert structural equivalence
 * of the two ASTs (ignoring sourcepos / stringContent / open flag /
 * sibling pointers — comparing only essential semantic content).
 */

import { test, expect, describe } from 'bun:test';
import {
    md, renderMarkdown, makeNode,
    T_SUBSCRIPT, T_SUPERSCRIPT, T_HIGHLIGHT, T_MATH_INLINE, T_MATH_BLOCK,
    T_FOOTNOTE_REF, T_FOOTNOTE_DEF, T_ADMONITION
} from '../../tests/_helpers/build.js';

function astSig(node) {
    if (!node) return null;
    const sig = { type: node.type };
    if (node.level != null)       sig.level = node.level;
    if (node.literal != null)     sig.literal = node.literal;
    if (node.info != null && node.info !== '') sig.info = node.info;
    if (node.destination != null) sig.destination = node.destination;
    if (node.title)               sig.title = node.title;
    if (node.listType)            sig.listType = node.listType;
    if (node.listStart != null && node.type === 'list') sig.listStart = node.listStart;
    if (node.listTight !== true && node.type === 'list') sig.listTight = node.listTight;
    if (node.checked != null)     sig.checked = node.checked;
    if (node.cellAlign)           sig.cellAlign = node.cellAlign;
    if (node.isHeader)            sig.isHeader = node.isHeader;
    if (node.align)               sig.align = node.align;
    const children = [];
    let c = node.firstChild;
    while (c) {
        children.push(astSig(c));
        c = c.next;
    }
    if (children.length) sig.children = children;
    return sig;
}

function roundtrip(input) {
    const ast1 = md.parse(input);
    const rendered = renderMarkdown(ast1);
    const ast2 = md.parse(rendered);
    return { rendered, sig1: astSig(ast1), sig2: astSig(ast2) };
}

describe('markdown renderer roundtrip', () => {
    const cases = [
        ['heading h1',          '# Hello\n'],
        ['heading h3',          '### Deep heading\n'],
        ['paragraph',           'Just a paragraph.\n'],
        ['paragraph emph',      'A *word* and **bold** and `code`.\n'],
        ['strikethrough',       'Some ~~struck~~ text.\n'],
        ['link',                '[link](https://example.com)\n'],
        ['image',               '![alt](img.png)\n'],
        ['thematic break',      'Above\n\n---\n\nBelow\n'],
        ['blockquote',          '> A quote\n> spanning lines\n'],
        ['bullet list tight',   '- one\n- two\n- three\n'],
        ['ordered list',        '1. first\n2. second\n'],
        ['fenced code',         '```js\nconst x = 1;\n```\n'],
        ['task list',           '- [ ] todo\n- [x] done\n'],
        ['table',               '| h1 | h2 |\n| --- | --- |\n| a | b |\n'],
        ['table aligned',       '| L | C | R |\n| :--- | :---: | ---: |\n| a | b | c |\n'],
        ['nested emph',         '***bold-italic***\n']
    ];

    for (const [name, input] of cases) {
        test(name, () => {
            const { sig1, sig2 } = roundtrip(input);
            expect(sig2).toEqual(sig1);
        });
    }
});

// ---------------------------------------------------------------------------
// BL-1598 (office/BATCH_49/02) — a paragraph whose text starts a LINE with a
// block marker must render escaped, so it re-parses as the same paragraph.
// Escaped at the start of every line of the paragraph (the first line and
// after each soft / hard break): an ordered-list delimiter (`1\.`, `2\)`),
// a bullet (`\-`, `\+`), an ATX heading (`\#`), a blockquote (`\>`).
//
// Red before the fix (measured 2026-10-02): `1\. Step One` rendered as
// `1. Step One` and re-parsed as an ordered list; `\- item` as `- item` (a
// bullet list); `\# x` as `# x` (a heading); `a` + soft break + `2\) b`
// rendered `a\n2) b`. The blockquote case already passed: `escapeText`
// escapes every `>`.
// ---------------------------------------------------------------------------

/** Type of the document's only block, after parsing `text`. */
function onlyBlockType(text) {
    const doc = md.parse(text);
    expect(doc.firstChild).not.toBeNull();
    expect(doc.firstChild.next).toBeNull();
    return doc.firstChild.type;
}

describe('markdown renderer — leading block markers in a paragraph are escaped (BL-1598)', () => {
    // [name, Markdown source (a single paragraph), expected rendering]
    const cases = [
        ['ordered `.` on the first line',  '1\\. Step One\n',      '1\\. Step One\n'],
        ['ordered `)` on the first line',  '12\\) Step\n',         '12\\) Step\n'],
        ['bullet `-` on the first line',   '\\- item\n',           '\\- item\n'],
        ['bullet `+` on the first line',   '\\+ item\n',           '\\+ item\n'],
        ['bullet `*` on the first line',   '\\* item\n',           '\\* item\n'],
        ['heading `#` on the first line',  '\\# x\n',              '\\# x\n'],
        ['heading `######` on the first line', '\\###### x\n',     '\\###### x\n'],
        ['blockquote `>` on the first line', '\\> q\n',            '\\> q\n'],
        ['a lone marker line',             '\\-\n',                '\\-\n'],
        ['ordered `)` after a soft break', 'a\n2\\) b\n',          'a\n2\\) b\n'],
        ['bullet after a soft break',      'a\n\\- b\n',           'a\n\\- b\n'],
        ['heading after a soft break',     'a\n\\# b\n',           'a\n\\# b\n'],
        ['blockquote after a soft break',  'a\n\\> b\n',           'a\n\\> b\n'],
        ['ordered after a hard break',     'a\\\n1\\. b\n',        'a\\\n1\\. b\n'],
        ['bullet after a hard break',      'a\\\n\\+ b\n',         'a\\\n\\+ b\n'],
        ['heading after a hard break',     'a\\\n\\## b\n',        'a\\\n\\## b\n'],
        // BL-1913 — setext underline / thematic break at a line start.
        // Red before the fix (measured 2026-10-04, renderer at HEAD): the
        // paragraph `a` + soft break + `---` rendered `a\n---`, which
        // re-parses as a level-2 setext heading; `a\n===` as a level-1 one;
        // a lone `\---` rendered `---` (a thematic break).
        ['setext `---` after a soft break', 'a\n\\---\n',          'a\n\\---\n'],
        ['setext `===` after a soft break', 'a\n\\===\n',          'a\n\\===\n'],
        ['lone `---` paragraph',            '\\---\n',             '\\---\n'],
        ['setext `---` after a hard break', 'a\\\n\\---\n',        'a\\\n\\---\n']
    ];

    for (const [name, input, expected] of cases) {
        test(`${name}: renders escaped and re-parses as one paragraph`, () => {
            expect(onlyBlockType(input)).toBe('paragraph');
            const { rendered, sig1, sig2 } = roundtrip(input);
            expect(rendered).toBe(expected);
            expect(onlyBlockType(rendered)).toBe('paragraph');
            expect(sig2).toEqual(sig1);
        });
    }

    test('a paragraph inside a list item and a blockquote is escaped too', () => {
        for (const [input, expected] of [['- 1\\. inner\n', '- 1\\. inner\n'], ['> \\- inner\n', '> \\- inner\n']]) {
            const { rendered, sig1, sig2 } = roundtrip(input);
            // The blockquote renderer's own trailing `>` line is unrelated.
            expect(rendered.startsWith(expected)).toBe(true);
            // sig1 holds the inner paragraph: an equal sig2 proves no
            // nested list / heading appeared on re-parse.
            expect(sig2).toEqual(sig1);
        }
    });

    test('render → parse → render is stable (idempotent) for every marker case', () => {
        for (const [, input] of cases) {
            const once = renderMarkdown(md.parse(input));
            const twice = renderMarkdown(md.parse(once));
            expect(twice).toBe(once);
        }
    });
});

describe('markdown renderer — non-marker line starts are byte-identical (BL-1598)', () => {
    // None of these starts a line with a block marker: the rendering must
    // not change (no escape added).
    const unchanged = [
        'Just a paragraph.\n',
        '1.5 million\n',
        '1234567890. ten digits is not a marker\n',
        '#hashtag\n',
        '####### seven hashes\n',
        '-dash\n',
        '+plus\n',
        'Step 1. inside\n',
        'a\nb - c\n',
        'a\\\nb # c\n'
    ];
    for (const input of unchanged) {
        test(`unchanged: ${JSON.stringify(input)}`, () => {
            expect(onlyBlockType(input)).toBe('paragraph');
            const { rendered, sig1, sig2 } = roundtrip(input);
            expect(rendered).toBe(input);
            expect(sig2).toEqual(sig1);
        });
    }

    // BL-1913 — a `-` / `=` run that is NOT the whole line stays unescaped.
    for (const input of ['a\n-- b\n', 'a\n= b\n', 'a\n--x\n', 'a\n---b\n']) {
        test(`unchanged (dash / equals run, not a whole line): ${JSON.stringify(input)}`, () => {
            expect(onlyBlockType(input)).toBe('paragraph');
            const { rendered, sig1, sig2 } = roundtrip(input);
            expect(rendered).toBe(input);
            expect(sig2).toEqual(sig1);
        });
    }
});

// ---------------------------------------------------------------------------
// Hand-built ASTs (no parser): link destinations, indented line starts and
// extension nodes. A PARSED destination never carries whitespace — the inline
// parser percent-encodes it (`<Grafik 1>` is stored as `Grafik%201`) — so the
// `<…>` destination form is reached only by a hand-built or converter-built
// node (e.g. oconv's IR → Markdown writer).
// ---------------------------------------------------------------------------

/** Build a node of `type`, assign `props`, append `children`. */
function node(type, props, ...children) {
    const n = makeNode(type);
    Object.assign(n, props || {});
    for (const c of children) n.appendChild(c);
    return n;
}
const text = (literal) => node('text', { literal });
const doc = (...blocks) => node('document', null, ...blocks);
const para = (...inlines) => node('paragraph', null, ...inlines);

/** Render a one-paragraph document holding `inlines`. */
const renderPara = (...inlines) => renderMarkdown(doc(para(...inlines)));

describe('markdown renderer — link and image destinations (BL-1240)', () => {
    test('an image destination with a space is wrapped in <…> (red before: `Grafik\\ 1`, re-parsed as text)', () => {
        const out = renderPara(node('image', { destination: 'Grafik 1' }, text('alt')));
        expect(out).toBe('![alt](<Grafik 1>)\n');
        // The `<…>` form re-parses as an image (the parser percent-encodes the space).
        const img = md.parse(out).firstChild.firstChild;
        expect(img.type).toBe('image');
        expect(img.destination).toBe('Grafik%201');
        // …and the parsed form is a fixpoint of the renderer.
        expect(renderMarkdown(md.parse(out))).toBe('![alt](Grafik%201)\n');
    });

    test('a link with a spaced destination and a title keeps both', () => {
        const out = renderPara(node('link', { destination: 'x y', title: 't' }, text('a')));
        expect(out).toBe('[a](<x y> "t")\n');
        const link = md.parse(out).firstChild.firstChild;
        expect(link.type).toBe('link');
        expect(link.title).toBe('t');
    });

    test('a parsed `<x y>` destination renders from its percent-encoded form', () => {
        expect(renderMarkdown(md.parse('[a](<x y> "t")\n'))).toBe('[a](x%20y "t")\n');
    });

    test('`<`, `>` inside a destination are escaped in the <…> form', () => {
        const out = renderPara(node('link', { destination: 'a<b>c' }, text('t')));
        expect(out).toBe('[t](<a\\<b\\>c>)\n');
        expect(md.parse(out).firstChild.firstChild.type).toBe('link');
    });

    test('a destination starting with `<` is wrapped', () => {
        const out = renderPara(node('link', { destination: '<x' }, text('t')));
        expect(out).toBe('[t](<\\<x>)\n');
        expect(md.parse(out).firstChild.firstChild.type).toBe('link');
    });

    test('a control character triggers the <…> form', () => {
        const out = renderPara(node('link', { destination: 'a\u0001b' }, text('t')));
        expect(out).toBe('[t](<a\u0001b>)\n');
    });

    test('a line ending in a destination becomes %0A inside <…> and the result re-parses as a link', () => {
        for (const dest of ['a\nb', 'a\r\nb', 'a\rb']) {
            const out = renderPara(node('link', { destination: dest }, text('t')));
            expect(out).toBe('[t](<a%0Ab>)\n');
            const link = md.parse(out).firstChild.firstChild;
            expect(link.type).toBe('link');
        }
    });

    test('a backslash inside the <…> form is escaped', () => {
        expect(renderPara(node('link', { destination: 'a b\\c' }, text('t')))).toBe('[t](<a b\\\\c>)\n');
    });

    test('destinations without whitespace, `<` or control characters are unchanged (bare form)', () => {
        expect(renderPara(node('link', { destination: 'foo(bar)' }, text('a')))).toBe('[a](foo\\(bar\\))\n');
        expect(renderPara(node('link', { destination: 'logo.png' }, text('a')))).toBe('[a](logo.png)\n');
        expect(renderPara(node('link', { destination: '' }, text('a')))).toBe('[a]()\n');
        expect(renderPara(node('link', { destination: null }, text('a')))).toBe('[a]()\n');
        expect(renderMarkdown(md.parse('[a]()\n'))).toBe('[a]()\n');
        expect(renderMarkdown(md.parse('![a](logo.png "t")\n'))).toBe('![a](logo.png "t")\n');
    });
});

describe('markdown renderer — indented line starts (BL-2101)', () => {
    test('a bullet marker preceded by spaces keeps the indent and is escaped after it', () => {
        const out = renderPara(text('  - x'));
        expect(out).toBe('  \\- x\n');
        expect(md.parse(out).firstChild.type).toBe('paragraph');
        expect(md.parse(out).firstChild.next).toBeNull();
    });

    test('an ordered marker after a soft break, preceded by spaces, is escaped', () => {
        const out = renderPara(text('a\n  1. b'));
        expect(out).toBe('a\n  1\\. b\n');
        const ast = md.parse(out);
        expect(ast.firstChild.type).toBe('paragraph');
        expect(ast.firstChild.next).toBeNull();
    });

    test('1-3 spaces before a heading / quote / setext marker are escaped, 4+ are out of scope', () => {
        expect(renderPara(text(' # h'))).toBe(' \\# h\n');
        expect(renderPara(text('   > q'))).toBe('   \\> q\n');
        expect(renderPara(text('a\n  ---'))).toBe('a\n  \\---\n');
        expect(renderPara(text('a\n  ==='))).toBe('a\n  \\===\n');
        // Four spaces: an indented-code start, not a marker — left alone.
        expect(renderPara(text('    - x'))).toBe('    - x\n');
    });

    test('indented cases are stable under render → parse → render', () => {
        for (const literal of ['  - x', 'a\n  1. b', 'a\n  ---', ' # h']) {
            const once = renderPara(text(literal));
            const twice = renderMarkdown(md.parse(once));
            expect(renderMarkdown(md.parse(twice))).toBe(twice);
            expect(md.parse(once).firstChild.next).toBeNull();
        }
    });

    test('indented non-markers are unchanged', () => {
        expect(renderPara(text('  hello'))).toBe('  hello\n');
        expect(renderPara(text('  -x'))).toBe('  -x\n');
    });
});

describe('markdown renderer — extension nodes (BL-2101)', () => {
    test('subscript, superscript and highlight are serialised', () => {
        expect(renderPara(text('H'), node(T_SUBSCRIPT, null, text('2')), text('O'))).toBe('H~2~O\n');
        expect(renderPara(text('E=mc'), node(T_SUPERSCRIPT, null, text('2')))).toBe('E=mc^2^\n');
        expect(renderPara(node(T_HIGHLIGHT, null, text('m')))).toBe('==m==\n');
    });

    test('their content is rendered recursively (nested emphasis, inside a table cell)', () => {
        expect(renderPara(node(T_HIGHLIGHT, null, node('emph', null, text('m'))))).toBe('==*m*==\n');
        const cell = node('table_cell', null, node(T_SUBSCRIPT, null, text('ab')));
        const row = node('table_row', { isHeader: true }, cell);
        const table = node('table', { align: [null] }, row);
        expect(renderMarkdown(doc(table))).toBe('| ~ab~ |\n| --- |\n');
    });

    test('math_inline stays dropped (pins the documented limit)', () => {
        expect(T_MATH_INLINE).toBe('math_inline');
        expect(renderPara(text('a'), node(T_MATH_INLINE, { literal: 'x^2' }), text('b'))).toBe('ab\n');
    });

    test('footnote_ref and an unknown inline type stay dropped', () => {
        expect(renderPara(text('a'), node(T_FOOTNOTE_REF, { literal: '1' }), text('b'))).toBe('ab\n');
        expect(renderPara(text('a'), node('nonsense', { literal: 'zz' }), text('b'))).toBe('ab\n');
    });

    test('math_block, footnote_def and admonition blocks stay dropped, content included', () => {
        const mathBlock = node(T_MATH_BLOCK, { literal: 'x^2' });
        const adm = node(T_ADMONITION, null, para(text('inside')));
        const fn = node(T_FOOTNOTE_DEF, null, para(text('note')));
        expect(renderMarkdown(doc(mathBlock))).toBe('');
        expect(renderMarkdown(doc(adm))).toBe('');
        expect(renderMarkdown(doc(fn))).toBe('');
    });
});

/**
 * Asserts the emitted Markdown of `source`, that it renders to the same HTML
 * as the source, and that it is a fixed point of parse → render.
 */
function expectTableRoundtrip(source, emitted) {
    const once = renderMarkdown(md.parse(source));
    if (emitted !== undefined) expect(once).toBe(emitted);
    expect(md.renderHtml(once)).toBe(md.renderHtml(source));
    expect(renderMarkdown(md.parse(once))).toBe(once);
}

describe('markdown renderer — table-cell pipes are escaped exactly once (BL-2147)', () => {
    test('a pipe in cell text is emitted as one `\\|` and keeps the same HTML', () => {
        expectTableRoundtrip('| a\\|b |\n|---|\n', '| a\\|b |\n| --- |\n');
    });

    test('a literal backslash before a pipe in cell text round-trips', () => {
        expectTableRoundtrip('| a\\\\\\|b |\n|---|\n');
        expect(md.renderHtml('| a\\\\\\|b |\n|---|\n')).toContain('<th>a\\|b</th>');
    });

    test('a pipe in a code span round-trips', () => {
        expectTableRoundtrip('| `a\\|b` |\n|---|\n', '| `a\\|b` |\n| --- |\n');
    });

    test('a backslash and a pipe in a code span round-trip', () => {
        expectTableRoundtrip('| `a\\\\|b` |\n|---|\n');
    });

    test('a cell ending with a literal backslash round-trips', () => {
        expectTableRoundtrip('| a\\\\ | b |\n|---|---|\n');
    });

    test('a link whose text holds a pipe round-trips', () => {
        expectTableRoundtrip('| [a\\|b](http://x.test) |\n|---|\n');
    });

    test('a body-row cell with a pipe round-trips', () => {
        expectTableRoundtrip('| h |\n|---|\n| x\\|y |\n', '| h |\n| --- |\n| x\\|y |\n');
    });

    test('a pipe outside a table is not escaped as a cell pipe', () => {
        expect(renderMarkdown(md.parse('a|b\n'))).toBe('a|b\n');
    });
});

describe('markdown renderer — strikethrough tildes follow delimiterCount (BL-2150)', () => {
    test('a single-tilde source stays single-tilde', () => {
        expect(renderMarkdown(md.parse('~x~\n'))).toBe('~x~\n');
    });

    test('a double-tilde source stays double-tilde', () => {
        expect(renderMarkdown(md.parse('~~x~~\n'))).toBe('~~x~~\n');
    });

    test('a mixed paragraph keeps each run style', () => {
        const source = '~x y~ and ~~z~~\n';
        const once = renderMarkdown(md.parse(source));
        expect(once).toBe(source);
        expect(md.renderHtml(once)).toBe(md.renderHtml(source));
        expect(renderMarkdown(md.parse(once))).toBe(once);
    });

    test('a hand-built node without delimiterCount serialises with two tildes', () => {
        expect(renderPara(node('strikethrough', null, text('x')))).toBe('~~x~~\n');
    });

    test('a node with delimiterCount 2 serialises with two tildes', () => {
        expect(renderPara(node('strikethrough', { delimiterCount: 2 }, text('x')))).toBe('~~x~~\n');
    });

    test('a node with delimiterCount 1 serialises with one tilde', () => {
        expect(renderPara(node('strikethrough', { delimiterCount: 1 }, text('x')))).toBe('~x~\n');
    });
});
