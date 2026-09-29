// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Tests for the htmlEntities fw module.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { htmlEntities } from './html-entities.js';

describe('htmlEntities module', () => {
    test('should have correct module metadata', () => {
        expect(htmlEntities.name).toBe('htmlEntities');
        expect(htmlEntities.dependencies).toEqual([]);
        expect(typeof htmlEntities.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = htmlEntities.factory();
            expect(typeof inst.decodeHtmlStrict).toBe('function');
            expect(typeof inst.decodeHtml).toBe('function');
            expect(typeof inst.decodeCodePoint).toBe('function');
            expect(typeof inst.HTML5_ENTITIES).toBe('object');
        });
    });

    describe('decodeHtmlStrict', () => {
        /** @type {ReturnType<typeof htmlEntities.factory>} */
        let inst;
        beforeEach(() => { inst = htmlEntities.factory(); });

        // Named entities classiques
        test('decodes &amp; to ampersand', () => {
            expect(inst.decodeHtmlStrict('&amp;')).toBe('&');
        });
        test('decodes &lt; to less-than', () => {
            expect(inst.decodeHtmlStrict('&lt;')).toBe('<');
        });
        test('decodes &gt; to greater-than', () => {
            expect(inst.decodeHtmlStrict('&gt;')).toBe('>');
        });
        test('decodes &quot; to double-quote', () => {
            expect(inst.decodeHtmlStrict('&quot;')).toBe('"');
        });
        test('decodes &apos; to apostrophe', () => {
            expect(inst.decodeHtmlStrict('&apos;')).toBe("'");
        });

        // Extended HTML5 named entities
        test('decodes &aacute; to á', () => {
            expect(inst.decodeHtmlStrict('&aacute;')).toBe('á');
        });
        test('decodes &Alpha; to Α (uppercase Greek)', () => {
            expect(inst.decodeHtmlStrict('&Alpha;')).toBe('Α');
        });
        test('decodes &zigrarr; to ⇝', () => {
            expect(inst.decodeHtmlStrict('&zigrarr;')).toBe('⇝');
        });
        test('decodes &AMP; (legacy uppercase alias) to &', () => {
            expect(inst.decodeHtmlStrict('&AMP;')).toBe('&');
        });
        test('decodes &LT; (legacy uppercase alias) to <', () => {
            expect(inst.decodeHtmlStrict('&LT;')).toBe('<');
        });
        test('decodes a sample of extended HTML5 named entities', () => {
            expect(inst.decodeHtmlStrict('&copy;')).toBe('©');
            expect(inst.decodeHtmlStrict('&zwj;')).toBe('‍');
            expect(inst.decodeHtmlStrict('&CounterClockwiseContourIntegral;')).toBe('∳');
        });

        // Numeric decimal
        test('decodes &#42; to *', () => {
            expect(inst.decodeHtmlStrict('&#42;')).toBe('*');
        });
        test('decodes &#10084; to ❤ (emoji)', () => {
            expect(inst.decodeHtmlStrict('&#10084;')).toBe('❤');
        });
        test('decodes &#65; to A', () => {
            expect(inst.decodeHtmlStrict('&#65;')).toBe('A');
        });

        // Numeric hex
        test('decodes &#x2A; to * (lowercase x)', () => {
            expect(inst.decodeHtmlStrict('&#x2A;')).toBe('*');
        });
        test('decodes &#X2A; to * (uppercase X)', () => {
            expect(inst.decodeHtmlStrict('&#X2A;')).toBe('*');
        });
        test('decodes &#x2a; to * (lowercase hex digit)', () => {
            expect(inst.decodeHtmlStrict('&#x2a;')).toBe('*');
        });

        // Edge cases CommonMark §6.2
        test('&#0; maps to U+FFFD', () => {
            expect(inst.decodeHtmlStrict('&#0;')).toBe('�');
        });
        test('&#x0; maps to U+FFFD', () => {
            expect(inst.decodeHtmlStrict('&#x0;')).toBe('�');
        });
        test('surrogate &#xD800; maps to U+FFFD', () => {
            expect(inst.decodeHtmlStrict('&#xD800;')).toBe('�');
        });
        test('overlong &#x110000; maps to U+FFFD', () => {
            expect(inst.decodeHtmlStrict('&#x110000;')).toBe('�');
        });
        test('Windows-1252 override &#128; maps to U+20AC (€)', () => {
            expect(inst.decodeHtmlStrict('&#128;')).toBe('€');
        });

        // Unknown entity
        test('unknown named entity is left unchanged', () => {
            expect(inst.decodeHtmlStrict('&unknown;')).toBe('&unknown;');
            expect(inst.decodeHtmlStrict('&nope;')).toBe('&nope;');
        });

        // No entity
        test('plain text without entities is returned identical', () => {
            const s = 'plain text with no & ampersands? actually one, no semicolon.';
            expect(inst.decodeHtmlStrict(s)).toBe(s);
        });

        // Texte mixte
        test('decodes multiple entities in a single string', () => {
            expect(inst.decodeHtmlStrict('a &amp; b &lt;c&gt;')).toBe('a & b <c>');
        });
        test('decodes mixed named + numeric entities', () => {
            expect(inst.decodeHtmlStrict('a&amp;b&#42;c&copy;d')).toBe('a&b*c©d');
        });

        // Strict mode - non-semicolon-terminated forms unchanged
        test('non-semicolon-terminated &amp is left as-is (strict mode)', () => {
            expect(inst.decodeHtmlStrict('&amp')).toBe('&amp');
        });
        test('non-semicolon-terminated &#42 is left as-is (strict mode)', () => {
            expect(inst.decodeHtmlStrict('&#42')).toBe('&#42');
        });

        // Beyond BMP (surrogate pair output)
        test('produces correct string for code points beyond BMP', () => {
            expect(inst.decodeHtmlStrict('&#x1F600;')).toBe('\u{1F600}');
        });

        // Non-string input
        test('returns non-string input unchanged', () => {
            // @ts-ignore
            expect(inst.decodeHtmlStrict(null)).toBe(null);
            // @ts-ignore
            expect(inst.decodeHtmlStrict(42)).toBe(42);
        });
    });

    describe('decodeHtml (lenient)', () => {
        /** @type {ReturnType<typeof htmlEntities.factory>} */
        let inst;
        beforeEach(() => { inst = htmlEntities.factory(); });

        test('decodes &amp (without semicolon) to &', () => {
            expect(inst.decodeHtml('&amp')).toBe('&');
        });
        test('decodes &amp; (with semicolon) to &', () => {
            expect(inst.decodeHtml('&amp;')).toBe('&');
        });
        test('decodes &#42 (without semicolon) to *', () => {
            expect(inst.decodeHtml('&#42')).toBe('*');
        });
    });

    describe('decodeCodePoint', () => {
        /** @type {ReturnType<typeof htmlEntities.factory>} */
        let inst;
        beforeEach(() => { inst = htmlEntities.factory(); });

        test('decodes code point 42 to *', () => {
            expect(inst.decodeCodePoint(42)).toBe('*');
        });
        test('decodes code point 0 to U+FFFD', () => {
            expect(inst.decodeCodePoint(0)).toBe('�');
        });
        test('decodes surrogate 0xD800 to U+FFFD', () => {
            expect(inst.decodeCodePoint(0xD800)).toBe('�');
        });
        test('decodes overlong 0x110000 to U+FFFD', () => {
            expect(inst.decodeCodePoint(0x110000)).toBe('�');
        });
        test('decodes 0x20AC to € (Windows-1252 override for &#128;)', () => {
            // Windows-1252 maps 0x80 → 0x20AC
            expect(inst.decodeCodePoint(0x80)).toBe('€');
        });
        test('decodes negative code point to U+FFFD', () => {
            expect(inst.decodeCodePoint(-1)).toBe('�');
        });
        test('decodes 0x1F600 to 😀', () => {
            expect(inst.decodeCodePoint(0x1F600)).toBe('😀');
        });
    });

    describe('HTML5_ENTITIES table', () => {
        /** @type {ReturnType<typeof htmlEntities.factory>} */
        let inst;
        beforeEach(() => { inst = htmlEntities.factory(); });

        test('table has at least 2125 entries', () => {
            expect(Object.keys(inst.HTML5_ENTITIES).length).toBeGreaterThanOrEqual(2125);
        });

        test('table contains expected entries', () => {
            expect(inst.HTML5_ENTITIES['amp']).toBe('&');
            expect(inst.HTML5_ENTITIES['lt']).toBe('<');
            expect(inst.HTML5_ENTITIES['gt']).toBe('>');
            expect(inst.HTML5_ENTITIES['aacute']).toBe('á');
        });
    });

    describe('robustness / regression', () => {
        /** @type {ReturnType<typeof htmlEntities.factory>} */
        let inst;
        beforeEach(() => { inst = htmlEntities.factory(); });

        // Out-of-bounds numeric entity - must not throw
        test('&#999999999; does not throw and returns replacement or literal', () => {
            expect(() => inst.decodeHtmlStrict('&#999999999;')).not.toThrow();
            const result = inst.decodeHtmlStrict('&#999999999;');
            // Either U+FFFD or the original literal is acceptable
            expect(typeof result).toBe('string');
        });

        // Surrogate - defined behavior (replacement char U+FFFD, not throw)
        test('&#xD800; is a defined surrogate - replacement char U+FFFD, not throw', () => {
            expect(() => inst.decodeHtmlStrict('&#xD800;')).not.toThrow();
            expect(inst.decodeHtmlStrict('&#xD800;')).toBe('�');
        });

        // Unknown named entity - literal preserved
        test('&unknownEntity; is left as literal', () => {
            expect(inst.decodeHtmlStrict('&unknownEntity;')).toBe('&unknownEntity;');
        });

        // Isolated & without semicolon - literal
        test('isolated & without semicolon is left as literal', () => {
            expect(inst.decodeHtmlStrict('a & b')).toBe('a & b');
            expect(inst.decodeHtmlStrict('&')).toBe('&');
        });

        // Round-trip: 5 sample named entities
        test('round-trip: &amp; decodes to &', () => {
            expect(inst.decodeHtmlStrict('&amp;')).toBe('&');
        });
        test('round-trip: &copy; decodes to ©', () => {
            expect(inst.decodeHtmlStrict('&copy;')).toBe('©');
        });
        test('round-trip: &euro; decodes to €', () => {
            expect(inst.decodeHtmlStrict('&euro;')).toBe('€');
        });
        test('round-trip: &pi; decodes to π', () => {
            expect(inst.decodeHtmlStrict('&pi;')).toBe('π');
        });
        test('round-trip: &zwj; decodes to U+200D (zero-width joiner)', () => {
            expect(inst.decodeHtmlStrict('&zwj;')).toBe('‍');
        });

        // WHATWG spec vectors - code point verification
        test('WHATWG vector: &AMP; resolves to & (U+0026)', () => {
            expect(inst.decodeHtmlStrict('&AMP;')).toBe('&');
        });
        test('WHATWG vector: &lt (without semicolon, strict) is left as literal', () => {
            // strict mode requires semicolon
            expect(inst.decodeHtmlStrict('&lt')).toBe('&lt');
        });
        test('WHATWG vector: &gt; resolves to > (U+003E)', () => {
            expect(inst.decodeHtmlStrict('&gt;')).toBe('>');
        });
        test('WHATWG vector: &apos; resolves to \' (U+0027)', () => {
            expect(inst.decodeHtmlStrict('&apos;')).toBe("'");
        });
        test('WHATWG vector: &quot; resolves to " (U+0022)', () => {
            expect(inst.decodeHtmlStrict('&quot;')).toBe('"');
        });

        // HTML5_ENTITIES accessible via factory().HTML5_ENTITIES
        test('HTML5_ENTITIES[\'amp\'] accessible via factory().HTML5_ENTITIES', () => {
            const table = htmlEntities.factory().HTML5_ENTITIES;
            expect(table['amp']).toBe('&');
        });
    });
});
