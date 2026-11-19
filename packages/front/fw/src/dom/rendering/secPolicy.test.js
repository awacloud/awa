// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Co-located tests of the security policy primitives. The predicates are also
// reached through sanitize, template and render; here each one is pinned on
// its own, rule by rule, in the order its documentation gives.

import { describe, test, expect } from 'bun:test';
import { secPolicy } from './secPolicy.js';

const sp = secPolicy.factory();

describe('secPolicy', () => {
    describe('descriptor', () => {
        test('is a dependency-free fw.dom.rendering module', () => {
            expect(secPolicy.name).toBe('secPolicy');
            expect(secPolicy.type).toBe('fw.dom.rendering');
            expect(secPolicy.dependencies).toEqual([]);
        });
    });

    describe('isSafeUrl — the documented order', () => {
        test('1. a non-string is unsafe', () => {
            for (const v of [null, undefined, 42, {}, ['https://x']]) expect(sp.isSafeUrl(v)).toBe(false);
        });

        test('2. empty (after stripping control characters) is safe', () => {
            expect(sp.isSafeUrl('')).toBe(true);
            expect(sp.isSafeUrl(' \t\n\x00')).toBe(true);
        });

        test('3. anchor and relative prefixes are safe', () => {
            for (const v of ['#top', '/a/b', '?q=1', './x', '../y']) expect(sp.isSafeUrl(v)).toBe(true);
        });

        test('4. the dangerous schemes are refused, obfuscated or not', () => {
            for (const v of [
                'javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'java\tscript:alert(1)', ' javascript:x',
                'vbscript:x', 'file:///etc/passwd', 'jar:http://x!/', 'data:text/html,<b>', 'data:application/json,{}',
            ]) {
                expect(sp.isSafeUrl(v)).toBe(false);
            }
        });

        test('5. data:image is accepted by default, refused only by an explicit false', () => {
            const png = 'data:image/png;base64,iVBORw0KGgo=';
            expect(sp.isSafeUrl(png)).toBe(true);
            expect(sp.isSafeUrl(png, undefined, true)).toBe(true);
            expect(sp.isSafeUrl(png, undefined, false)).toBe(false);
            expect(sp.isSafeUrl('data:image/tiff;base64,AAAA')).toBe(false);
            expect(sp.isSafeUrl('data:,hello')).toBe(false);
        });

        test('6. no colon is a relative URL', () => {
            expect(sp.isSafeUrl('page.html')).toBe(true);
        });

        test('7. a colon after a slash is a path', () => {
            expect(sp.isSafeUrl('a/b:c')).toBe(true);
        });

        test('8. otherwise the scheme must be allowed (default SAFE_SCHEMES)', () => {
            for (const v of ['http://x', 'https://x', 'mailto:a@b', 'tel:+33', 'ftp://x']) expect(sp.isSafeUrl(v)).toBe(true);
            for (const v of ['gopher://x', 'intent://x', 'chrome://settings']) expect(sp.isSafeUrl(v)).toBe(false);
            expect([...sp.SAFE_SCHEMES].sort()).toEqual(['ftp', 'http', 'https', 'mailto', 'tel']);
        });
    });

    describe('isSafeUrl — the scheme override', () => {
        test('an array replaces the defaults', () => {
            expect(sp.isSafeUrl('https://x', ['https'])).toBe(true);
            expect(sp.isSafeUrl('http://x', ['https'])).toBe(false);
            expect(sp.isSafeUrl('gopher://x', ['gopher'])).toBe(true);
        });

        test('a Set replaces the defaults exactly like an array', () => {
            expect(sp.isSafeUrl('https://x', new Set(['https']))).toBe(true);
            expect(sp.isSafeUrl('http://x', new Set(['https']))).toBe(false);
            expect(sp.isSafeUrl('mailto:a@b', new Set(['https']))).toBe(false);
            expect(sp.isSafeUrl('gopher://x', new Set(['gopher']))).toBe(true);
        });

        test('an override never re-admits a dangerous scheme', () => {
            expect(sp.isSafeUrl('javascript:x', ['javascript'])).toBe(false);
            expect(sp.isSafeUrl('javascript:x', new Set(['javascript']))).toBe(false);
        });
    });

    describe('DATA_IMAGE_RE — RFC 2397 forms', () => {
        test('the parameter-less form is accepted for every listed type', () => {
            for (const mime of ['png', 'jpeg', 'jpg', 'gif', 'webp', 'svg+xml', 'bmp', 'ico', 'avif', 'apng']) {
                expect(sp.isSafeUrl('data:image/' + mime + ',AAAA')).toBe(true);
                expect(sp.isSafeUrl('data:image/' + mime + ';base64,AAAA')).toBe(true);
            }
            expect(sp.isSafeUrl('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E')).toBe(true);
            expect(sp.isSafeUrl('data:image/svg+xml;utf8,<svg/>')).toBe(true);
        });

        test('a near-miss MIME is still refused', () => {
            for (const v of ['data:image/svgxml,AAAA', 'data:image/pngx,AAAA', 'data:image/png', 'data:image/,AAAA']) {
                expect(sp.isSafeUrl(v)).toBe(false);
            }
        });

        test('the parameter-less form is refused where data:image is not allowed', () => {
            expect(sp.isSafeUrl('data:image/png,AAAA', undefined, false)).toBe(false);
        });
    });

    describe('DOM clobbering', () => {
        test('id and name with a document property name are clobbering pairs', () => {
            for (const v of ['cookie', 'location', 'body', 'forms', 'submit']) {
                expect(sp.isClobberValue('id', v)).toBe(true);
                expect(sp.isClobberValue('name', v)).toBe(true);
            }
        });

        test('other attributes or ordinary values are not', () => {
            expect(sp.isClobberValue('class', 'cookie')).toBe(false);
            expect(sp.isClobberValue('id', 'main')).toBe(false);
        });
    });

    describe('attribute names', () => {
        test('on* handlers are event attributes, whatever the case', () => {
            for (const n of ['onclick', 'ONLOAD', 'onError']) {
                expect(sp.isEventAttr(n)).toBe(true);
                expect(sp.isSafeAttrName(n)).toBe(false);
            }
            expect(sp.isEventAttr(42)).toBe(false);
        });

        test('a safe name starts with a letter and is not a handler', () => {
            for (const n of ['class', 'data-x', 'aria-label', 'xlink:href']) expect(sp.isSafeAttrName(n)).toBe(true);
            for (const n of ['1x', '-x', '', ':x', null]) expect(sp.isSafeAttrName(n)).toBe(false);
        });
    });

    describe('blocked tags', () => {
        test('script, object, embed and iframe are blocked; others are not', () => {
            for (const t of ['script', 'object', 'embed', 'iframe']) expect(sp.isBlockedTag(t)).toBe(true);
            for (const t of ['div', 'img', 'scripts', 'svg', null]) expect(sp.isBlockedTag(t)).toBe(false);
        });
    });

    describe('CSS', () => {
        test('blocked property names are refused whatever the value', () => {
            expect(sp.isSafeCss('behavior', 'x')).toBe(false);
            expect(sp.isSafeCss('-MS-BEHAVIOR', 'x')).toBe(false);
        });

        test('dangerous values are refused, obfuscated or not', () => {
            for (const v of [
                'expression(alert(1))', 'expre\nssion(alert(1))', 'url(javascript:alert(1))',
                "url('JAVA\tSCRIPT:x')", 'url(vbscript:x)', 'url("data:text/html,x")',
            ]) {
                expect(sp.isSafeCss('background', v)).toBe(false);
            }
        });

        test('ordinary values, and a missing value, are safe', () => {
            expect(sp.isSafeCss('color', 'red')).toBe(true);
            expect(sp.isSafeCss('background', 'url(/img.png)')).toBe(true);
            expect(sp.isSafeCss('background', 'url(data:image/png;base64,AAAA)')).toBe(true);
            expect(sp.isSafeCss('color', null)).toBe(true);
        });
    });
});
