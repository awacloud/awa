// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { mdSubsuper, createMd, cloneNode, walk } from '../../tests/_helpers/build.js';

// `install` works on the parsed AST: the source is never rewritten, and the
// `<sub>` / `<sup>` nodes are built with `mdNode.trustedHtmlInline`, so the
// extra renders under the `safe` default. RAW is kept for parity legs only.
const RAW = { safe: false };

function nodesOfType(ast, type) {
    const out = [];
    for (const { node, entering } of walk(ast)) if (entering && node.type === type) out.push(node);
    return out;
}

describe('mdSubsuper', () => {
    test('renders ~x~ as <sub>', () => {
        const m = createMd().use(mdSubsuper);
        const html = m.renderHtml('H~2~O\n');
        expect(html).toBe('<p>H<sub>2</sub>O</p>\n');
    });

    test('renders ^x^ as <sup>', () => {
        const m = createMd().use(mdSubsuper);
        const html = m.renderHtml('E=mc^2^\n');
        expect(html).toBe('<p>E=mc<sup>2</sup></p>\n');
    });

    test('combined sub and sup in one line', () => {
        const m = createMd().use(mdSubsuper);
        const html = m.renderHtml('a~i~ and b^j^\n');
        expect(html).toContain('<sub>i</sub>');
        expect(html).toContain('<sup>j</sup>');
    });

    test('leaves ~~strike~~-style intact', () => {
        const m = createMd().use(mdSubsuper);
        const html = m.renderHtml('~~strike~~\n');
        expect(html).not.toContain('<sub>');
    });

    test('whitespace inside body is not parsed', () => {
        const m = createMd().use(mdSubsuper);
        const html = m.renderHtml('a ~b c~ d\n');
        expect(html).not.toContain('<sub>');
    });

    test('escapes special chars in subscript', () => {
        const m = createMd().use(mdSubsuper);
        const html = m.renderHtml('x~a&b~y\n');
        expect(html).toContain('<sub>a&amp;b</sub>');
    });

    test('multiple subscripts in a paragraph', () => {
        const m = createMd().use(mdSubsuper);
        const html = m.renderHtml('a~1~b~2~c\n');
        expect(html).toContain('<sub>1</sub>');
        expect(html).toContain('<sub>2</sub>');
    });

    test('safe: false renders the same tags (parity leg)', () => {
        const m = createMd(RAW).use(mdSubsuper);
        expect(m.renderHtml('a~1~b^2^c\n')).toBe('<p>a<sub>1</sub>b<sup>2</sup>c</p>\n');
    });
});

describe('mdSubsuper — under the safe default', () => {
    const FIXTURE = 'H~2~O and E=mc^2^\n';

    test('benign output under the default equals { safe: false }', () => {
        const m = createMd().use(mdSubsuper);
        expect(m.renderHtml(FIXTURE)).toBe(m.renderHtml(FIXTURE, RAW));
    });

    test('H~2~O and E=mc^2^ keep every character (the c is kept)', () => {
        const m = createMd().use(mdSubsuper);
        expect(m.renderHtml(FIXTURE)).toBe('<p>H<sub>2</sub>O and E=mc<sup>2</sup></p>\n');
    });

    test('author raw HTML in the same document is stripped', () => {
        const m = createMd().use(mdSubsuper);
        const src = 'H~2~O <img src=y onerror=alert(2)>\n\n<img src=x onerror=alert(1)>\n';
        const html = m.renderHtml(src);
        expect(html).not.toContain('<img');
        expect(html).toContain('<sub>2</sub>');
        expect(m.renderHtml(src, RAW)).toContain('<img src=x onerror');
    });

    test('author raw <sub> next to the syntax is stripped, the extra tags are kept', () => {
        const m = createMd().use(mdSubsuper);
        const html = m.renderHtml('<sub>x</sub> H~2~O\n');
        expect(html).toBe('<p>x H<sub>2</sub>O</p>\n');
        expect(m.renderHtml('<sub>x</sub> H~2~O\n', RAW)).toBe('<p><sub>x</sub> H<sub>2</sub>O</p>\n');
    });

    test('nodes lowered by lowerSubSupToHtml are trusted under the default', () => {
        const m = createMd();
        const ast = m.parse('x^2^\n');
        mdSubsuper.expandSubSupInAst(ast);
        mdSubsuper.lowerSubSupToHtml(ast);
        expect(m.render(ast)).toContain('<sup>2</sup>');
    });
});

describe('mdSubsuper — code, links and URLs keep their bytes', () => {
    const m = createMd().use(mdSubsuper);

    test('a code span keeps ^x^', () => {
        expect(m.renderHtml('`a^b^c`\n')).toBe('<p><code>a^b^c</code></p>\n');
    });

    test('a code span keeps ~x~', () => {
        expect(m.renderHtml('`H~2~O`\n')).toBe('<p><code>H~2~O</code></p>\n');
    });

    test('an angle autolink keeps its href and text', () => {
        const html = m.renderHtml('<https://ex.org/~a/~b/>\n');
        expect(html).toBe('<p><a href="https://ex.org/~a/~b/">https://ex.org/~a/~b/</a></p>\n');
        expect(html).not.toContain('<sub>');
    });

    test('a bare URL keeps its href and text', () => {
        const html = m.renderHtml('https://ex.org/~a/~b/\n');
        expect(html).toBe('<p><a href="https://ex.org/~a/~b/">https://ex.org/~a/~b/</a></p>\n');
        expect(html).not.toContain('<sub>');
    });

    test('a ^x^ inside an autolink stays literal (normalised destination)', () => {
        const html = m.renderHtml('<https://ex.org/^a^/> www.ex.org/^b^/\n');
        expect(html).not.toContain('<sup>');
        expect(html).toContain('>https://ex.org/^a^/</a>');
        expect(html).toContain('>www.ex.org/^b^/</a>');
    });

    test('^x^ in a link text becomes <sup> inside the link', () => {
        expect(m.renderHtml('[x^2^](u)\n')).toBe('<p><a href="u">x<sup>2</sup></a></p>\n');
    });

    test('a fenced code block is untouched', () => {
        expect(m.renderHtml('```\n^a^ ~b~\n```\n')).toBe('<pre><code>^a^ ~b~\n</code></pre>\n');
    });
});

describe('mdSubsuper — escapes keep protecting', () => {
    const m = createMd().use(mdSubsuper);

    test('\\~2\\~ stays literal', () => {
        expect(m.renderHtml('H\\~2\\~O\n')).toBe('<p>H~2~O</p>\n');
    });

    test('\\^2\\^ stays literal although the joined text reads ^2^', () => {
        const ast = createMd().parse('x\\^2\\^\n');
        const joined = nodesOfType(ast, 'text').map(n => n.literal).join('');
        expect(joined).toBe('x^2^');               // a naive scan of the joined run would match
        expect(m.renderHtml('x\\^2\\^\n')).toBe('<p>x^2^</p>\n');
    });

    test('&#94;2&#94; stays literal', () => {
        expect(m.renderHtml('x&#94;2&#94;\n')).toBe('<p>x^2^</p>\n');
    });
});

describe('mdSubsuper — GFM strike-through', () => {
    test('~~x~~ stays <del> with the extra', () => {
        const m = createMd().use(mdSubsuper);
        expect(m.renderHtml('~~x~~\n')).toBe('<p><del>x</del></p>\n');
    });

    test('~a b~ stays <del>a b</del> with the extra', () => {
        const m = createMd().use(mdSubsuper);
        expect(m.renderHtml('~a b~\n')).toBe('<p><del>a b</del></p>\n');
    });

    test('~x~ without the extra is still <del>', () => {
        const m = createMd();
        expect(m.renderHtml('~x~\n')).toBe('<p><del>x</del></p>\n');
    });
});

describe('strikethrough delimiterCount', () => {
    test('the parser records the tilde run length (1 or 2)', () => {
        const ast = createMd().parse('~a~ ~~b~~\n');
        const strikes = nodesOfType(ast, 'strikethrough');
        expect(strikes.map(s => s.delimiterCount)).toEqual([1, 2]);
    });

    test('cloneNode preserves it', () => {
        const ast = createMd().parse('~a~ ~~b~~\n');
        const [one, two] = nodesOfType(ast, 'strikethrough');
        expect(cloneNode(one, true).delimiterCount).toBe(1);
        expect(cloneNode(two, false).delimiterCount).toBe(2);
    });

    test('it is absent on emph and strong', () => {
        const ast = createMd().parse('*a* **b**\n');
        const nodes = nodesOfType(ast, 'emph').concat(nodesOfType(ast, 'strong'));
        expect(nodes.length).toBe(2);
        for (const n of nodes) expect(Object.prototype.hasOwnProperty.call(n, 'delimiterCount')).toBe(false);
    });
});

describe('mdSubsuper — renderMarkdown round-trip', () => {
    test('the parsed AST serialises back to H~2~O E=mc^2^', () => {
        const m = createMd().use(mdSubsuper);
        const ast = m.parse('H~2~O E=mc^2^\n');
        expect(nodesOfType(ast, 'subscript').length).toBe(1);
        expect(nodesOfType(ast, 'superscript').length).toBe(1);
        expect(m.renderMarkdown(ast)).toBe('H~2~O E=mc^2^\n');
    });
});
