// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { mdEmoji, DEFAULT_EMOJI_TABLE, expandEmojiInAst, createMd } from '../../tests/_helpers/build.js';

describe('mdEmoji', () => {
    test('expands a known shortcode in a paragraph', () => {
        const m = createMd().use(mdEmoji);
        const html = m.renderHtml('Hello :smile: world\n');
        expect(html).toBe('<p>Hello 😄 world</p>\n');
    });

    test('expands multiple shortcodes in one paragraph', () => {
        const m = createMd().use(mdEmoji);
        const html = m.renderHtml('a :fire: b :rocket: c\n');
        expect(html).toBe('<p>a 🔥 b 🚀 c</p>\n');
    });

    test('leaves unknown shortcodes alone', () => {
        const m = createMd().use(mdEmoji);
        const html = m.renderHtml(':not_a_real_emoji:\n');
        expect(html).toBe('<p>:not_a_real_emoji:</p>\n');
    });

    test('does not touch code spans', () => {
        const m = createMd().use(mdEmoji);
        const html = m.renderHtml('`:smile:`\n');
        expect(html).toBe('<p><code>:smile:</code></p>\n');
    });

    test('install accepts custom table override', () => {
        const m = createMd().use({
            name: 'custom',
            install(md) {
                mdEmoji.install(md, { table: { foo: '🎯' } });
            }
        });
        const html = m.renderHtml(':foo: and :smile:\n');
        expect(html).toBe('<p>🎯 and 😄</p>\n');
    });

    test('default table contains essentials', () => {
        expect(DEFAULT_EMOJI_TABLE.smile).toBe('😄');
        expect(DEFAULT_EMOJI_TABLE.heart).toBe('❤️');
        expect(DEFAULT_EMOJI_TABLE.rocket).toBe('🚀');
        expect(DEFAULT_EMOJI_TABLE['+1']).toBe('👍');
    });
});

describe('mdEmoji — Map-backed lookup', () => {
    test('parity: Map#get matches plain-object indexing for every DEFAULT_EMOJI_TABLE entry', () => {
        // Old lookup was `table[key]` on the plain object; new lookup is
        // `map.get(key)` on a Map built from the same entries. Both must
        // agree, key for key, over the full ~70-entry table.
        const map = new Map(Object.entries(DEFAULT_EMOJI_TABLE));
        const keys = Object.keys(DEFAULT_EMOJI_TABLE);
        expect(keys.length).toBeGreaterThan(0);
        for (const key of keys) {
            expect(map.get(key)).toBe(DEFAULT_EMOJI_TABLE[key]);
        }
        expect(map.size).toBe(keys.length);
    });

    test('happy path — a known shortcode resolves via expandEmojiInAst with a plain-object table', () => {
        const m = createMd();
        const ast = m.parse(':fire:\n');
        expandEmojiInAst(ast, DEFAULT_EMOJI_TABLE);
        expect(m.render(ast)).toBe('<p>🔥</p>\n');
    });

    test('miss — an unknown shortcode is left untouched, including an Object.prototype key name', () => {
        const m = createMd().use(mdEmoji);
        // A plain-object lookup table resolves `{}['constructor']` to the
        // inherited `Object` constructor instead of `undefined`; the
        // Map-backed lookup must not (Map#get never walks the prototype
        // chain). `constructor` has no underscore, so it is not split by
        // CommonMark's emphasis-delimiter tokenizing — an apples-to-apples
        // single-text-node case.
        expect(m.renderHtml(':not_a_real_emoji:\n')).toBe('<p>:not_a_real_emoji:</p>\n');
        expect(m.renderHtml(':constructor:\n')).toBe('<p>:constructor:</p>\n');
    });

    test('expandEmojiInAst accepts a Map directly (internal call shape)', () => {
        const m = createMd();
        const ast = m.parse(':fire:\n');
        expandEmojiInAst(ast, new Map(Object.entries({ fire: '🔥' })));
        expect(m.render(ast)).toBe('<p>🔥</p>\n');
    });

    test('prototype safety — a plain-object table never leaks an inherited member', () => {
        // The decisive regression case for the object→Map change: with the
        // old `table[key]` lookup, an EMPTY plain-object table still resolved
        // `:constructor:` to `Object.prototype.constructor` (a function), and
        // the replacement was stringified into the document. `Object.entries`
        // copies own enumerable keys only, so the Map is empty and `get`
        // returns `undefined` → the shortcode is left verbatim.
        for (const key of ['constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
            const m = createMd();
            const ast = m.parse(`:${key}:\n`);
            expandEmojiInAst(ast, {});
            expect(m.render(ast)).toBe(`<p>:${key}:</p>\n`);
        }
    });

    test('prototype safety — an own key shadowing a prototype member still resolves', () => {
        // Symmetric half: Map#get must not become over-strict either. An
        // OWN `constructor` entry is a legitimate shortcode and must expand.
        const m = createMd();
        const ast = m.parse(':constructor:\n');
        expandEmojiInAst(ast, { constructor: '🏗️' });
        expect(m.render(ast)).toBe('<p>🏗️</p>\n');
    });

    test('install merges a custom table over the defaults without losing them', () => {
        // `install()` spreads DEFAULT_EMOJI_MAP then the custom entries into a
        // fresh Map: a custom key must override the default of the same name
        // while every other default survives.
        const m = createMd().use({
            name: 'custom-override',
            install(md) {
                mdEmoji.install(md, { table: { fire: '🧯', brandnew: '🆕' } });
            }
        });
        expect(m.renderHtml(':fire: :smile: :brandnew:\n')).toBe('<p>🧯 😄 🆕</p>\n');
    });

    test('DEFAULT_EMOJI_TABLE stays a plain object (public shape unchanged)', () => {
        // The internal lookup structure changed; the exported table did not.
        // Consumers documented to spread it (`{ ...DEFAULT_EMOJI_TABLE }`)
        // must keep working.
        expect(DEFAULT_EMOJI_TABLE).not.toBeInstanceOf(Map);
        expect(typeof DEFAULT_EMOJI_TABLE).toBe('object');
        const merged = { ...DEFAULT_EMOJI_TABLE, target: '🎯' };
        const m = createMd();
        const ast = m.parse(':target: :smile:\n');
        expandEmojiInAst(ast, merged);
        expect(m.render(ast)).toBe('<p>🎯 😄</p>\n');
    });
});

describe('mdEmoji — runs of adjacent text nodes (underscore shortcodes)', () => {
    const underscored = Object.keys(DEFAULT_EMOJI_TABLE).filter(k => k.includes('_'));

    test('the table holds at least ten underscore-bearing defaults', () => {
        expect(underscored.length).toBeGreaterThanOrEqual(10);
    });

    test('every underscore-bearing default expands through createMd().use(mdEmoji)', () => {
        const m = createMd().use(mdEmoji);
        for (const key of underscored) {
            expect(m.renderHtml(`:${key}:\n`)).toBe(`<p>${DEFAULT_EMOJI_TABLE[key]}</p>\n`);
        }
    });

    test('an underscore shortcode expands inside text surrounded by prose', () => {
        const m = createMd().use(mdEmoji);
        expect(m.renderHtml('a :heart_eyes: b :fire: c\n')).toBe('<p>a 😍 b 🔥 c</p>\n');
    });

    test('an underscore shortcode expands inside emphasis', () => {
        const m = createMd().use(mdEmoji);
        expect(m.renderHtml('*:heart_eyes:*\n')).toBe('<p><em>😍</em></p>\n');
    });

    test('real emphasis stays a boundary and a neighbouring underscore shortcode expands', () => {
        const m = createMd().use(mdEmoji);
        expect(m.renderHtml('_x_ :fox_face:\n')).toBe('<p><em>x</em> 🦊</p>\n');
    });

    test('unknown underscore shortcodes and prototype names stay verbatim', () => {
        const m = createMd().use(mdEmoji);
        expect(m.renderHtml(':not_a_real_emoji:\n')).toBe('<p>:not_a_real_emoji:</p>\n');
        expect(m.renderHtml(':constructor:\n')).toBe('<p>:constructor:</p>\n');
        expect(m.renderHtml(':heart_eyes: :not_a_real_emoji:\n')).toBe('<p>😍 :not_a_real_emoji:</p>\n');
    });

    test('a hand-built run of three text nodes collapses to one text node per segment', () => {
        const m = createMd();
        const ast = m.parse('x\n');
        const para = ast.firstChild;
        const old = para.firstChild;
        for (const lit of [':heart', '_', 'eyes: end']) {
            const n = new old.constructor(old.type);
            n.literal = lit;
            old.insertBefore(n);
        }
        old.unlink();
        expect(expandEmojiInAst(ast, DEFAULT_EMOJI_TABLE)).toBe(ast);
        const kids = [];
        for (let n = para.firstChild; n; n = n.next) kids.push(n.literal);
        expect(kids).toEqual(['😍', ' end']);
    });

    test('a run without any replacement is left untouched (node identity kept)', () => {
        const m = createMd();
        const ast = m.parse(':nope_nope: tail\n');
        const before = [];
        for (let n = ast.firstChild.firstChild; n; n = n.next) before.push(n);
        expandEmojiInAst(ast, DEFAULT_EMOJI_TABLE);
        const after = [];
        for (let n = ast.firstChild.firstChild; n; n = n.next) after.push(n);
        expect(after).toEqual(before);
        expect(m.render(ast)).toBe('<p>:nope_nope: tail</p>\n');
    });
});
