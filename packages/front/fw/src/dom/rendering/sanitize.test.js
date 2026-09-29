// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { sanitize } from './sanitize.js';
import { secPolicy } from './secPolicy.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function mkSanitizer() {
    return sanitize.factory(secPolicy.factory());
}

// ── 1. Module metadata ───────────────────────────────────────────────────────

describe('sanitize module', () => {

    test('has correct module metadata', () => {
        expect(sanitize.name).toBe('sanitize');
        expect(sanitize.dependencies).toEqual(['secPolicy']);
        expect(typeof sanitize.factory).toBe('function');
    });

    // ── 2. Factory API ───────────────────────────────────────────────────────

    describe('factory', () => {
        test('returns object with expected API', () => {
            const s = mkSanitizer();
            expect(typeof s.sanitizeHtml).toBe('function');
            expect(typeof s.isSafeUrl).toBe('function');
            expect(typeof s.defaultAllowlist).toBe('object');
        });
    });

    // ── 3. defaultAllowlist shape ────────────────────────────────────────────

    describe('defaultAllowlist', () => {
        let s;
        beforeEach(() => { s = mkSanitizer(); });

        test('has non-empty tags Set', () => {
            expect(s.defaultAllowlist.tags).toBeInstanceOf(Set);
            expect(s.defaultAllowlist.tags.size).toBeGreaterThan(0);
            expect(s.defaultAllowlist.tags.has('p')).toBe(true);
            expect(s.defaultAllowlist.tags.has('a')).toBe(true);
        });

        test('has attributes record', () => {
            expect(typeof s.defaultAllowlist.attributes).toBe('object');
            expect(s.defaultAllowlist.attributes['*']).toBeInstanceOf(Set);
        });

        test('has urlSchemes array', () => {
            expect(Array.isArray(s.defaultAllowlist.urlSchemes)).toBe(true);
            expect(s.defaultAllowlist.urlSchemes.length).toBeGreaterThan(0);
            expect(s.defaultAllowlist.urlSchemes).toContain('https');
        });
    });

    // ── 4. sanitizeHtml - basic ──────────────────────────────────────────────

    describe('sanitizeHtml', () => {
        let s;
        beforeEach(() => { s = mkSanitizer(); });

        test('returns empty string for empty input', () => {
            expect(s.sanitizeHtml('')).toBe('');
        });

        test('returns empty string for non-string input', () => {
            expect(s.sanitizeHtml(null)).toBe('');
            expect(s.sanitizeHtml(undefined)).toBe('');
            expect(s.sanitizeHtml(42)).toBe('');
        });

        test('passes through plain text unchanged', () => {
            expect(s.sanitizeHtml('hello world')).toBe('hello world');
        });

        test('preserves allowed tags', () => {
            expect(s.sanitizeHtml('<p>hello</p>')).toBe('<p>hello</p>');
            expect(s.sanitizeHtml('<em>x</em>')).toBe('<em>x</em>');
            expect(s.sanitizeHtml('<strong>x</strong>')).toBe('<strong>x</strong>');
        });

        // ── 5. Tag stripping ─────────────────────────────────────────────────

        describe('tag stripping', () => {
            test('strips <script> tag and content', () => {
                expect(s.sanitizeHtml('<p>hello <script>alert(1)</script></p>')).toBe('<p>hello </p>');
            });

            test('strips <script> with type attribute', () => {
                expect(s.sanitizeHtml('<script type="text/javascript">evil()</script>')).toBe('');
            });

            test('strips <iframe>', () => {
                const out = s.sanitizeHtml('<iframe src="https://evil.com"></iframe>');
                expect(out).not.toContain('<iframe');
            });

            test('strips <object>', () => {
                const out = s.sanitizeHtml('<object data="evil.swf"></object>');
                expect(out).not.toContain('<object');
            });

            test('strips <embed>', () => {
                const out = s.sanitizeHtml('<embed src="evil.swf" />');
                expect(out).not.toContain('<embed');
            });

            test('strips <form>', () => {
                const out = s.sanitizeHtml('<form action="https://evil.com"><input></form>');
                expect(out).not.toContain('<form');
            });

            test('strips <style> tag and its content', () => {
                const out = s.sanitizeHtml('<style>body{color:red}</style><p>x</p>');
                expect(out).not.toContain('<style');
                expect(out).not.toContain('color:red');
                expect(out).toContain('<p>x</p>');
            });

            test('strips <svg>', () => {
                const out = s.sanitizeHtml('<svg><script>alert(1)</script></svg>');
                expect(out).not.toContain('<svg');
                expect(out).not.toContain('alert');
            });

            test('strips <noscript>', () => {
                const out = s.sanitizeHtml('<noscript><img src=x onerror=alert(1)></noscript>');
                expect(out).not.toContain('<noscript');
            });

            test('strips <link>', () => {
                const out = s.sanitizeHtml('<link rel="stylesheet" href="evil.css">');
                expect(out).not.toContain('<link');
            });

            test('strips <meta>', () => {
                const out = s.sanitizeHtml('<meta http-equiv="refresh" content="0;url=evil.com">');
                expect(out).not.toContain('<meta');
            });

            test('drops unknown tags but preserves text content', () => {
                expect(s.sanitizeHtml('<unknown>text</unknown>')).toBe('text');
            });
        });

        // ── 6. Attribute stripping ───────────────────────────────────────────

        describe('attribute stripping', () => {
            test('strips onclick handler', () => {
                expect(s.sanitizeHtml('<p onclick="alert(1)">hi</p>')).toBe('<p>hi</p>');
            });

            test('strips onerror handler', () => {
                expect(s.sanitizeHtml('<img src="x" onerror="alert(1)" />')).toBe('<img src="x" />');
            });

            test('strips onload handler', () => {
                expect(s.sanitizeHtml('<body onload="evil()"><p>x</p>')).toBe('<p>x</p>');
            });

            test('strips onmouseover handler', () => {
                expect(s.sanitizeHtml('<span onmouseover="evil()">x</span>')).toBe('<span>x</span>');
            });

            test('strips all on* event attributes', () => {
                const events = ['onclick', 'ondblclick', 'onmousedown', 'onmouseup',
                    'onkeydown', 'onkeyup', 'onkeypress', 'onsubmit', 'onreset',
                    'onfocus', 'onblur', 'onchange', 'oninput', 'onscroll'];
                for (const ev of events) {
                    const out = s.sanitizeHtml(`<p ${ev}="evil()">x</p>`);
                    expect(out).not.toContain(ev);
                }
            });

            test('strips style attribute', () => {
                expect(s.sanitizeHtml('<p style="color:red">x</p>')).toBe('<p>x</p>');
            });

            test('strips srcdoc attribute', () => {
                const out = s.sanitizeHtml('<iframe srcdoc="<script>evil()</script>"></iframe>');
                expect(out).not.toContain('srcdoc');
            });

            test('strips formaction attribute', () => {
                const out = s.sanitizeHtml('<button formaction="https://evil.com">x</button>');
                expect(out).not.toContain('formaction');
            });

            test('keeps allowed attributes (class, id, title)', () => {
                const out = s.sanitizeHtml('<p class="foo" id="bar" title="baz">x</p>');
                expect(out).toContain('class="foo"');
                expect(out).toContain('id="bar"');
                expect(out).toContain('title="baz"');
            });

            test('keeps href on <a> for safe URL', () => {
                const out = s.sanitizeHtml('<a href="https://example.com">link</a>');
                expect(out).toContain('href="https://example.com"');
            });

            test('keeps src on <img> for safe URL', () => {
                const out = s.sanitizeHtml('<img src="https://example.com/img.png" alt="x" />');
                expect(out).toContain('src="https://example.com/img.png"');
            });
        });

        // ── 7. URL safety ────────────────────────────────────────────────────

        describe('URL safety in href/src', () => {
            test('strips javascript: href', () => {
                const out = s.sanitizeHtml('<a href="javascript:alert(1)">link</a>');
                expect(out).not.toContain('javascript');
                expect(out).not.toContain('href');
                expect(out).toContain('link');
            });

            test('strips vbscript: href', () => {
                const out = s.sanitizeHtml('<a href="vbscript:msgbox(1)">link</a>');
                expect(out).not.toContain('href');
            });

            test('strips data:text/html href', () => {
                const out = s.sanitizeHtml('<a href="data:text/html,<script>evil()</script>">x</a>');
                expect(out).not.toContain('data:text');
            });

            test('allows https:// href', () => {
                const out = s.sanitizeHtml('<a href="https://safe.com">link</a>');
                expect(out).toContain('href="https://safe.com"');
            });

            test('allows http:// href', () => {
                const out = s.sanitizeHtml('<a href="http://safe.com">link</a>');
                expect(out).toContain('href="http://safe.com"');
            });

            test('allows mailto: href', () => {
                const out = s.sanitizeHtml('<a href="mailto:user@example.com">mail</a>');
                expect(out).toContain('href="mailto:user@example.com"');
            });

            test('allows tel: href', () => {
                const out = s.sanitizeHtml('<a href="tel:+1234567890">call</a>');
                expect(out).toContain('href="tel:+1234567890"');
            });

            test('allows #anchor href', () => {
                const out = s.sanitizeHtml('<a href="#section">link</a>');
                expect(out).toContain('href="#section"');
            });

            test('allows relative path href', () => {
                const out = s.sanitizeHtml('<a href="/about">link</a>');
                expect(out).toContain('href="/about"');
            });

            test('allows relative path without leading slash', () => {
                const out = s.sanitizeHtml('<a href="./page.html">link</a>');
                expect(out).toContain('href="./page.html"');
            });

            test('strips data:image/png src when allowDataImage not set', () => {
                const out = s.sanitizeHtml('<img src="data:image/png;base64,iVBOR==" alt="x" />');
                expect(out).not.toContain('data:image');
            });

            test('strips data:application/javascript src', () => {
                const out = s.sanitizeHtml('<img src="data:application/javascript;base64,abc" alt="x" />');
                expect(out).not.toContain('data:application');
            });
        });

        // ── 8. Encoding tricks ───────────────────────────────────────────────

        describe('encoding tricks', () => {
            test('no bypass via nested <scr<script>ipt>', () => {
                // Browser-style recursive attack: "<scr<script>ipt>alert(1)</scr</script>ipt>"
                // After script removal, remaining tags should not form a valid script.
                const out = s.sanitizeHtml('<scr<script>ipt>alert(1)</scr</script>ipt>');
                expect(out).not.toContain('<script');
                expect(out).not.toContain('alert(1)');
            });

            test('already-encoded entities stay literal', () => {
                const out = s.sanitizeHtml('&lt;script&gt;alert(1)&lt;/script&gt;');
                expect(out).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
            });

            test('null-byte in tag name does not bypass', () => {
                const out = s.sanitizeHtml('<scr\x00ipt>evil()</scr\x00ipt>');
                expect(out).not.toContain('evil()');
            });

            test('uppercase tag name is blocked', () => {
                const out = s.sanitizeHtml('<SCRIPT>evil()</SCRIPT>');
                expect(out).not.toContain('evil()');
                expect(out).not.toContain('<SCRIPT');
            });

            test('mixed-case tag name is blocked', () => {
                const out = s.sanitizeHtml('<ScRiPt>evil()</ScRiPt>');
                expect(out).not.toContain('evil()');
            });

            test('javascript: with extra spaces/tabs is blocked', () => {
                const out = s.sanitizeHtml('<a href="  javascript:alert(1)  ">x</a>');
                expect(out).not.toContain('javascript');
            });

            test('javascript: with unicode space bypass is blocked', () => {
                const out = s.sanitizeHtml('<a href="java\tscript:alert(1)">x</a>');
                expect(out).not.toContain('javascript');
                expect(out).not.toContain('java\tscript');
            });
        });

        // ── 9. Nesting preservation ──────────────────────────────────────────

        describe('nesting preservation', () => {
            test('preserves nested allowed tags', () => {
                const html = '<div><p><strong>bold</strong> and <em>italic</em></p></div>';
                expect(s.sanitizeHtml(html)).toBe(html);
            });

            test('preserves list structure', () => {
                const html = '<ul><li>a</li><li>b</li></ul>';
                expect(s.sanitizeHtml(html)).toBe(html);
            });

            test('preserves table structure', () => {
                const html = '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>';
                expect(s.sanitizeHtml(html)).toBe(html);
            });

            test('drops wrapper disallowed tag but keeps inner allowed content', () => {
                const out = s.sanitizeHtml('<div class="safe"><custom><p>text</p></custom></div>');
                expect(out).toContain('<p>text</p>');
                expect(out).not.toContain('<custom');
            });
        });

        // ── 10. rel="noopener noreferrer" auto-injection ─────────────────────

        describe('rel noopener noreferrer', () => {
            test('adds rel to external https links opened in _blank', () => {
                const out = s.sanitizeHtml('<a href="https://example.com" target="_blank">x</a>');
                expect(out).toContain('rel="');
                expect(out).toContain('noopener');
                expect(out).toContain('noreferrer');
            });

            test('adds rel to external http links opened in _blank', () => {
                const out = s.sanitizeHtml('<a href="http://example.com" target="_blank">x</a>');
                expect(out).toContain('noopener');
                expect(out).toContain('noreferrer');
            });

            test('does NOT add rel to external links without target (in-place navigation)', () => {
                const out = s.sanitizeHtml('<a href="https://example.com">x</a>');
                expect(out).not.toContain('noopener');
                expect(out).not.toContain('noreferrer');
            });

            test('does NOT add rel when target="_self"', () => {
                const out = s.sanitizeHtml('<a href="https://example.com" target="_self">x</a>');
                expect(out).not.toContain('noopener');
            });

            test('adds rel to named target (creates new browsing context)', () => {
                const out = s.sanitizeHtml('<a href="https://example.com" target="popup">x</a>');
                expect(out).toContain('noopener');
                expect(out).toContain('noreferrer');
            });

            test('does not add rel to anchor-only links', () => {
                const out = s.sanitizeHtml('<a href="#section" target="_blank">x</a>');
                expect(out).not.toContain('noopener');
            });
        });

        // ── 10bis. HTML comment stripping ────────────────────────────────────

        describe('HTML comment stripping', () => {
            test('strips ordinary comments entirely', () => {
                const out = s.sanitizeHtml('<p>before</p><!-- hello world --><p>after</p>');
                expect(out).not.toContain('hello world');
                expect(out).not.toContain('<!--');
                expect(out).toContain('before');
                expect(out).toContain('after');
            });

            test('strips comments containing script payloads (bypass attempt)', () => {
                const out = s.sanitizeHtml('<!-- <script>alert(1)</script> --><p>ok</p>');
                expect(out).not.toContain('script');
                expect(out).not.toContain('alert');
                expect(out).toContain('<p');
                expect(out).toContain('ok');
            });

            test('strips multi-line comments', () => {
                const out = s.sanitizeHtml('<p>x</p><!--\nline1\nline2\n--><p>y</p>');
                expect(out).not.toContain('line1');
                expect(out).not.toContain('line2');
            });
        });

        // ── 11. Custom allowlist ─────────────────────────────────────────────

        describe('custom allowlist', () => {
            test('allows custom-element with custom allowedTags', () => {
                const out = s.sanitizeHtml('<custom-element>x</custom-element>', {
                    allowedTags: ['custom-element'],
                    allowedAttributes: {}
                });
                expect(out).toContain('<custom-element>x</custom-element>');
            });

            test('strips tag not in custom allowedTags', () => {
                const out = s.sanitizeHtml('<p>text</p><div>more</div>', {
                    allowedTags: ['p'],
                    allowedAttributes: {}
                });
                expect(out).toContain('<p>text</p>');
                expect(out).not.toContain('<div');
            });

            test('custom urlSchemes restricts allowed schemes', () => {
                const out = s.sanitizeHtml('<a href="http://example.com">x</a>', {
                    allowedTags: ['a'],
                    allowedAttributes: { 'a': new Set(['href']) },
                    urlSchemes: ['https']  // only https, no http
                });
                expect(out).not.toContain('href');
            });
        });

        // ── 12. OWASP XSS payloads ───────────────────────────────────────────

        describe('OWASP XSS payloads', () => {
            const payloads = [
                // 1 - classic script tag
                ['<script>alert(1)</script>',                           ''],
                // 2 - img onerror (src=x is a valid relative URL and is kept; onerror is stripped)
                ['<img src=x onerror=alert(1)>',                       '<img src="x" />'],
                // 3 - svg/onload
                ['<svg onload=alert(1)>',                               ''],
                // 4 - javascript href
                ['<a href="javascript:alert(1)">x</a>',                'x'],
                // 5 - inline event in body
                ['<body onload=alert(1)>',                              ''],
                // 6 - iframe src
                ['<iframe src="javascript:alert(1)">',                 ''],
                // 7 - double-encoded javascript
                ['<a href="&#106;avascript:alert(1)">x</a>',           'x'],
                // 8 - vbscript href
                ['<a href="vbscript:msgbox(1)">x</a>',                 'x'],
                // 9 - input onfocus
                ['<input onfocus=evil() autofocus>',                   ''],
                // 10 - meta redirect
                ['<meta http-equiv="refresh" content="0;url=evil">',   ''],
                // 11 - script event
                ['<div onclick="alert(\'XSS\')">x</div>',              '<div>x</div>'],
                // 12 - link tag
                ['<link rel="import" href="//evil.com/xss.html">',     ''],
                // 13 - object tag
                ['<object data="data:text/html,<script>evil()</script>"></object>', ''],
                // 14 - embed tag
                ['<embed src="data:text/html,<script>evil()</script>" />', ''],
                // 15 - expression in style
                ['<div style="background:url(javascript:evil())">x</div>', '<div>x</div>'],
                // 16 - noscript tag
                ['<noscript><p><img src=x onerror=alert(1)></p></noscript>', ''],
                // 17 - formaction
                ['<button formaction="javascript:evil()">x</button>',  'x'],
                // 18 - xlink:href
                ['<a xlink:href="javascript:evil()">x</a>',            'x'],
                // 19 - srcdoc iframe
                ['<iframe srcdoc="<script>evil()</script>"></iframe>',  ''],
                // 20 - data URI html
                ['<a href="data:text/html,<script>evil()</script>">x</a>', 'x'],
            ];

            for (const [input, expected] of payloads) {
                test(`blocks: ${input.slice(0, 60)}`, () => {
                    const out = s.sanitizeHtml(input);
                    // The output must not contain dangerous tags or handlers.
                    expect(out).not.toMatch(/<script/i);
                    expect(out).not.toMatch(/javascript:/i);
                    expect(out).not.toMatch(/vbscript:/i);
                    expect(out).not.toMatch(/on[a-z]+\s*=/i);
                    // If expected is '', the result must be empty (or whitespace).
                    if (expected === '') {
                        expect(out.trim()).toBe('');
                    } else {
                        // Result must contain expected text.
                        expect(out).toContain(expected);
                    }
                });
            }
        });

    }); // sanitizeHtml

    // ── 13. isSafeUrl ────────────────────────────────────────────────────────

    describe('isSafeUrl', () => {
        let s;
        beforeEach(() => { s = mkSanitizer(); });

        test('returns false for non-string', () => {
            expect(s.isSafeUrl(null)).toBe(false);
            expect(s.isSafeUrl(42)).toBe(false);
        });

        test('returns true for empty string', () => {
            expect(s.isSafeUrl('')).toBe(true);
        });

        test('returns true for https', () => {
            expect(s.isSafeUrl('https://example.com')).toBe(true);
        });

        test('returns true for http', () => {
            expect(s.isSafeUrl('http://example.com')).toBe(true);
        });

        test('returns true for mailto', () => {
            expect(s.isSafeUrl('mailto:user@example.com')).toBe(true);
        });

        test('returns true for tel', () => {
            expect(s.isSafeUrl('tel:+123')).toBe(true);
        });

        test('returns true for anchor', () => {
            expect(s.isSafeUrl('#section')).toBe(true);
        });

        test('returns true for relative path', () => {
            expect(s.isSafeUrl('/path/to/page')).toBe(true);
            expect(s.isSafeUrl('./page.html')).toBe(true);
        });

        test('returns false for javascript:', () => {
            expect(s.isSafeUrl('javascript:alert(1)')).toBe(false);
        });

        test('returns false for vbscript:', () => {
            expect(s.isSafeUrl('vbscript:msgbox(1)')).toBe(false);
        });

        test('returns false for data:text/html', () => {
            expect(s.isSafeUrl('data:text/html,<script>evil()</script>')).toBe(false);
        });

        test('returns false for data:image when allowDataImage not set', () => {
            expect(s.isSafeUrl('data:image/png;base64,iVBOR==', undefined, false)).toBe(false);
        });

        test('returns true for data:image when allowDataImage=true', () => {
            expect(s.isSafeUrl('data:image/png;base64,iVBOR==', undefined, true)).toBe(true);
            expect(s.isSafeUrl('data:image/jpeg;base64,abc', undefined, true)).toBe(true);
            expect(s.isSafeUrl('data:image/gif;base64,abc', undefined, true)).toBe(true);
            expect(s.isSafeUrl('data:image/webp;base64,abc', undefined, true)).toBe(true);
        });

        test('returns false for data:application even with allowDataImage=true', () => {
            expect(s.isSafeUrl('data:application/javascript;base64,abc', undefined, true)).toBe(false);
        });

        test('javascript: with whitespace bypass is blocked', () => {
            expect(s.isSafeUrl('  javascript:alert(1)')).toBe(false);
            expect(s.isSafeUrl('java\tscript:alert(1)')).toBe(false);
        });

        test('custom schemes list restricts allowed schemes', () => {
            expect(s.isSafeUrl('ftp://files.example.com', ['https'])).toBe(false);
            expect(s.isSafeUrl('https://example.com', ['https'])).toBe(true);
        });
    });

    // ── 14. Robustness / re-entrance ────────────────────────────────────────

    describe('robustness / re-entrance', () => {
        let s;
        beforeEach(() => { s = mkSanitizer(); });

        // --- regex.lastIndex shared-state fix ---

        test('successive calls with different inputs give correct independent results', () => {
            // First call: simple paragraph
            const out1 = s.sanitizeHtml('<p>hello</p>');
            expect(out1).toBe('<p>hello</p>');
            // Second call: different input - would be broken if TAG_RE.lastIndex was not reset
            const out2 = s.sanitizeHtml('<em>world</em>');
            expect(out2).toBe('<em>world</em>');
        });

        test('repeated calls on complex inputs stay correct', () => {
            const html = '<div><p class="x">text <strong>bold</strong></p></div>';
            const first  = s.sanitizeHtml(html);
            const second = s.sanitizeHtml(html);
            expect(first).toBe(second);
            expect(first).toContain('<p class="x">');
            expect(first).toContain('<strong>bold</strong>');
        });

        test('call after a call that produced empty string still works', () => {
            // This exercises the case where TAG_RE.lastIndex might be stuck at end
            const _ = s.sanitizeHtml('<script>alert(1)</script>');
            expect(_.trim()).toBe('');
            const out = s.sanitizeHtml('<p>after</p>');
            expect(out).toBe('<p>after</p>');
        });

        // --- independent factory instances ---

        test('two factory instances are independent (custom vs default allowlist)', () => {
            const custom = sanitize.factory(secPolicy.factory());
            const dflt   = sanitize.factory(secPolicy.factory());

            // custom instance only allows <mark>
            const customOut = custom.sanitizeHtml('<mark>highlighted</mark><p>para</p>', {
                allowedTags: ['mark'],
                allowedAttributes: {}
            });
            expect(customOut).toContain('<mark>highlighted</mark>');
            expect(customOut).not.toContain('<p>');

            // default instance must still allow <p> - unaffected by custom call
            const dfltOut = dflt.sanitizeHtml('<p>para</p><mark>highlighted</mark>');
            expect(dfltOut).toContain('<p>para</p>');
            expect(dfltOut).toContain('<mark>highlighted</mark>');
        });

        test('mutating defaultAllowlist of one instance does not affect another', () => {
            const inst1 = sanitize.factory(secPolicy.factory());
            const inst2 = sanitize.factory(secPolicy.factory());

            // Add a fake tag to inst1's defaultAllowlist
            inst1.defaultAllowlist.tags.add('__evil__');
            expect(inst1.defaultAllowlist.tags.has('__evil__')).toBe(true);

            // inst2 should not be affected
            expect(inst2.defaultAllowlist.tags.has('__evil__')).toBe(false);
        });

        // --- additional XSS payloads ---

        test('img onerror is stripped, src kept if safe', () => {
            // <img src=x onerror=alert(1)> - onerror must be removed
            const out = s.sanitizeHtml('<img src=x onerror=alert(1)>');
            expect(out).not.toMatch(/onerror/i);
            expect(out).not.toMatch(/alert/i);
            // src="x" is a relative URL - kept
            expect(out).toContain('src="x"');
        });

        test('html-encoded javascript: in href is blocked', () => {
            // &#58; is the HTML entity for ':', browsers decode it before navigation
            const out = s.sanitizeHtml('<a href="javascript&#58;alert(1)">click</a>');
            expect(out).not.toMatch(/javascript/i);
            expect(out).not.toContain('href');
        });

        test('svg/onload is blocked (svg in DANGEROUS_CONTENT_TAGS)', () => {
            const out = s.sanitizeHtml('<svg/onload=alert(1)>');
            expect(out.trim()).toBe('');
        });

        test('iframe srcdoc with nested script is blocked', () => {
            const out = s.sanitizeHtml('<iframe srcdoc="<script>alert(1)</script>"></iframe>');
            expect(out).not.toContain('srcdoc');
            expect(out).not.toContain('<iframe');
            expect(out).not.toContain('alert');
        });

        test('style tag with javascript: url is stripped entirely', () => {
            const out = s.sanitizeHtml('<style>body{background:url(javascript:alert(1))}</style>');
            expect(out).not.toContain('<style');
            expect(out).not.toContain('javascript');
            expect(out.trim()).toBe('');
        });

        test('vbscript: href is blocked', () => {
            const out = s.sanitizeHtml('<a href="vbscript:alert(1)">link</a>');
            expect(out).not.toContain('vbscript');
            expect(out).not.toContain('href');
        });

        // --- OWASP additional payloads ---

        test('OWASP: <IMG SRC=&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;:alert(1)>', () => {
            // Numeric character references for javascript:
            const out = s.sanitizeHtml('<IMG SRC=&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;:alert(1)>');
            expect(out).not.toMatch(/javascript/i);
            expect(out).not.toMatch(/alert/i);
        });

        test('OWASP: expression() in style attribute is blocked', () => {
            const out = s.sanitizeHtml('<p style="width:expression(alert(1))">x</p>');
            expect(out).not.toContain('style');
            expect(out).not.toContain('expression');
            expect(out).toContain('<p>x</p>');
        });

        test('OWASP: <a href="&#x6A;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;:alert(1)"> hex-encoded', () => {
            const out = s.sanitizeHtml('<a href="&#x6A;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;:alert(1)">x</a>');
            // The raw attribute value contains &#x6A; etc. - isSafeUrl only sees the
            // literal string (no HTML decode), so the colon test fires on the raw value.
            // Result: either href stripped or payload not reachable.
            expect(out).not.toMatch(/javascript/i);
            expect(out).not.toMatch(/alert/i);
        });

        test('OWASP: <details ontoggle=alert(1) open>', () => {
            const out = s.sanitizeHtml('<details ontoggle=alert(1) open><summary>x</summary></details>');
            expect(out).not.toMatch(/ontoggle/i);
            expect(out).not.toMatch(/alert/i);
        });

        test('OWASP: <input autofocus onfocus=alert(1)>', () => {
            // <input> is not in DEFAULT_TAGS → entire tag dropped
            const out = s.sanitizeHtml('<input autofocus onfocus=alert(1)>');
            expect(out).not.toMatch(/onfocus/i);
            expect(out).not.toMatch(/alert/i);
        });

        test('OWASP: <video><source onerror=alert(1)></video>', () => {
            const out = s.sanitizeHtml('<video><source onerror=alert(1)></video>');
            expect(out).not.toMatch(/onerror/i);
            expect(out).not.toMatch(/alert/i);
        });

        test('OWASP: <math><mi xlink:href="javascript:alert(1)">x</mi></math>', () => {
            const out = s.sanitizeHtml('<math><mi xlink:href="javascript:alert(1)">x</mi></math>');
            expect(out).not.toContain('javascript');
            expect(out).not.toContain('xlink:href');
        });

        test('OWASP: <base href="javascript:alert(1)//">', () => {
            const out = s.sanitizeHtml('<base href="javascript:alert(1)//">');
            expect(out).not.toContain('javascript');
            expect(out).not.toContain('<base');
        });

        test('OWASP: <table background="javascript:alert(1)">', () => {
            const out = s.sanitizeHtml('<table background="javascript:alert(1)"><tr><td>x</td></tr></table>');
            expect(out).not.toContain('javascript');
            expect(out).not.toContain('background');
        });

        test('OWASP: <marquee onstart=alert(1)>x</marquee>', () => {
            // <marquee> not in allowlist → tag stripped, content kept
            const out = s.sanitizeHtml('<marquee onstart=alert(1)>x</marquee>');
            expect(out).not.toMatch(/onstart/i);
            expect(out).not.toMatch(/alert/i);
        });

    }); // robustness / re-entrance

}); // sanitize module
