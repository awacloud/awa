// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview XSS payload tests for the allowlist sanitizer.
 */

import { test, expect, describe } from 'bun:test';
import { sanitize as fwSanitize } from '@awacloud/fw/dom/rendering/sanitize.js';
import { secPolicy } from '@awacloud/fw/dom/rendering/secPolicy.js';
import { createMd } from './_helpers/build.js';

// sanitize's factory now requires the secPolicy API (DI dependency).
const { sanitizeHtml: sanitize, isSafeUrl } = fwSanitize.factory(secPolicy.factory());

describe('sanitize() — XSS payloads', () => {
    test('drops <script>', () => {
        const out = sanitize('<p>hi</p><script>alert(1)</script>');
        expect(out.toLowerCase()).not.toContain('<script');
        expect(out.toLowerCase()).not.toContain('alert(1)');
        expect(out).toContain('<p>hi</p>');
    });

    test('drops <style>', () => {
        const out = sanitize('<style>body{display:none}</style><p>ok</p>');
        expect(out.toLowerCase()).not.toContain('<style');
        expect(out).toContain('<p>ok</p>');
    });

    test('drops <iframe>', () => {
        const out = sanitize('<iframe src="evil"></iframe><p>ok</p>');
        expect(out.toLowerCase()).not.toContain('<iframe');
    });

    test('drops onerror handler on <img>', () => {
        const out = sanitize('<img src="x" onerror="alert(1)">');
        expect(out.toLowerCase()).not.toContain('onerror');
        expect(out.toLowerCase()).not.toContain('alert');
    });

    test('strips javascript: URL from <a href>', () => {
        const out = sanitize('<a href="javascript:alert(1)">x</a>');
        expect(out.toLowerCase()).not.toContain('javascript:');
    });

    test('strips vbscript: URL', () => {
        const out = sanitize('<a href="vbscript:msgbox(1)">x</a>');
        expect(out.toLowerCase()).not.toContain('vbscript:');
    });

    test('strips data:text/html', () => {
        const out = sanitize('<a href="data:text/html,<script>alert(1)</script>">x</a>');
        expect(out.toLowerCase()).not.toContain('data:text');
    });

    test('drops data:image/png by default (fw sanitize stricter than legacy md)', () => {
        // Migration to @awacloud/fw/sanitize : data: URLs are blocked by default
        // (opt-in via allowDataImage was a md-specific extension).
        const out = sanitize('<img src="data:image/png;base64,AAA" alt="x">');
        expect(out.toLowerCase()).not.toContain('data:image');
    });

    test('drops <object>', () => {
        const out = sanitize('<object data="x"></object>');
        expect(out.toLowerCase()).not.toContain('<object');
    });

    test('drops <embed>', () => {
        const out = sanitize('<embed src="x">');
        expect(out.toLowerCase()).not.toContain('<embed');
    });

    test('drops onclick attribute', () => {
        const out = sanitize('<a href="https://ok" onclick="alert(1)">x</a>');
        expect(out.toLowerCase()).not.toContain('onclick');
    });

    test('drops unknown <foo> tag', () => {
        const out = sanitize('<foo>bar</foo>');
        expect(out).not.toContain('<foo');
        expect(out).toContain('bar');
    });

    test('preserves <strong> / <em>', () => {
        const out = sanitize('<strong>a</strong> <em>b</em>');
        expect(out).toContain('<strong>');
        expect(out).toContain('<em>');
    });

    test('preserves <a href="https://...">', () => {
        const out = sanitize('<a href="https://example.com">x</a>');
        expect(out).toContain('href="https://example.com"');
    });

    test('preserves mailto: scheme', () => {
        const out = sanitize('<a href="mailto:a@b">x</a>');
        expect(out).toContain('mailto:a@b');
    });

    test('drops <input> tag (fw sanitize stricter than legacy md)', () => {
        // Migration to @awacloud/fw/sanitize : <input> is not in the fw allowlist
        // (task-list checkbox special-case was md-specific). Callers that
        // need task-list checkboxes should sanitize before task-list rendering
        // or pass an extended allowlist via { allowedTags }.
        const out = sanitize('<input type="checkbox" disabled>');
        expect(out.toLowerCase()).not.toContain('<input');
        const out2 = sanitize('<input type="text" name="x">');
        expect(out2.toLowerCase()).not.toContain('<input');
    });

    test('strips disallowed attribute (style)', () => {
        const out = sanitize('<p style="display:none">x</p>');
        expect(out.toLowerCase()).not.toContain('style=');
    });

    test('attribute injection — extra quote escaped', () => {
        const out = sanitize('<a href="javascript:alert(1)" title="hi">x</a>');
        expect(out.toLowerCase()).not.toContain('javascript:');
    });

    test('case-insensitive tag matching', () => {
        const out = sanitize('<SCRIPT>alert(1)</SCRIPT>');
        expect(out.toLowerCase()).not.toContain('<script');
        expect(out).not.toContain('alert(1)');
    });

    test('plaintext content removed', () => {
        const out = sanitize('<plaintext>secrets</plaintext>');
        expect(out.toLowerCase()).not.toContain('plaintext');
    });

    test('nested mixed valid + invalid', () => {
        const out = sanitize('<p>ok<script>bad</script>still ok</p>');
        expect(out.toLowerCase()).not.toContain('<script');
        expect(out).toContain('<p>');
        expect(out).toContain('ok');
        expect(out).toContain('still ok');
    });

    test('isSafeUrl basics', () => {
        const schemes = new Set(['http', 'https', 'mailto']);
        expect(isSafeUrl('https://x', schemes, false)).toBe(true);
        expect(isSafeUrl('javascript:1', schemes, false)).toBe(false);
        expect(isSafeUrl('/relative', schemes, false)).toBe(true);
        expect(isSafeUrl('#anchor', schemes, false)).toBe(true);
        expect(isSafeUrl('data:image/png;base64,xx', schemes, true)).toBe(true);
        expect(isSafeUrl('data:text/html,x', schemes, true)).toBe(false);
    });

    test('md.renderHtml({ sanitize: true }) drops <script>', () => {
        const m = createMd();
        const html = m.renderHtml('hello\n\n<script>alert(1)</script>\n', { sanitize: true });
        expect(html.toLowerCase()).not.toContain('<script');
    });
});

describe('renderHtml({ safe: true }) — XSS data:image alignment with fw sanitize', () => {
    test('safe:true blocks data:image/png by default (aligned with fw sanitize)', () => {
        const m = createMd();
        const html = m.renderHtml('![alt](data:image/png;base64,AAA)\n', { safe: true });
        expect(html.toLowerCase()).not.toContain('data:image');
        // The image src is neutralised to an empty string.
        expect(html).toContain('src=""');
    });

    test('safe:true + allowDataImage:true re-permits data:image/png', () => {
        const m = createMd();
        const html = m.renderHtml('![alt](data:image/png;base64,AAA)\n',
            { safe: true, allowDataImage: true });
        expect(html.toLowerCase()).toContain('data:image/png');
    });

    test('safe:true + allowDataImage:true still blocks data:text/html', () => {
        const m = createMd();
        const html = m.renderHtml('[x](data:text/html,<script>1</script>)\n',
            { safe: true, allowDataImage: true });
        expect(html.toLowerCase()).not.toContain('data:text');
    });

    test('safe:true blocks javascript: link', () => {
        const m = createMd();
        const html = m.renderHtml('[x](javascript:alert(1))\n', { safe: true });
        expect(html.toLowerCase()).not.toContain('javascript:');
    });

    test('parse + renderHtml + sanitize roundtrip drops onerror', () => {
        const m = createMd();
        const ast = m.parse('<img src="x" onerror="alert(1)">\n');
        const html = m.render(ast, { sanitize: true });
        expect(html.toLowerCase()).not.toContain('onerror');
        expect(html.toLowerCase()).not.toContain('alert');
    });

    test('parse + renderHtml + sanitize roundtrip drops iframe', () => {
        const m = createMd();
        const html = m.renderHtml('<iframe src="evil"></iframe>\n', { sanitize: true });
        expect(html.toLowerCase()).not.toContain('<iframe');
    });

    test('sanitize stage always strips data:image (fw sanitize is stricter than renderer)', () => {
        // Defense-in-depth : even if renderer is configured to emit data:image,
        // piping through sanitize:true strips it. Documented behavior — to keep
        // data:image, do NOT enable sanitize, or extend sanitizeOpts.allowedAttributes.
        const m = createMd();
        const html = m.renderHtml('![x](data:image/png;base64,AAA)\n',
            { safe: true, allowDataImage: true, sanitize: true });
        expect(html.toLowerCase()).not.toContain('data:image');
    });
});

describe('createMd legacy compat', () => {
    test('warns when historical `allowlist` option is passed', () => {
        const orig = console.warn;
        const calls = [];
        console.warn = (...args) => { calls.push(args.join(' ')); };
        try {
            createMd({ allowlist: { tags: [] } });
        } finally {
            console.warn = orig;
        }
        expect(calls.some(s => s.includes('allowlist'))).toBe(true);
        expect(calls[0]).toContain('allowedAttributes');
        expect(calls[0]).not.toContain('allowedAttrs');
    });
});

