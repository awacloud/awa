// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect, beforeEach } from 'bun:test';
import { runtime, ContractError } from '../../tests/_helpers/build.js';
import { mdHtmlTheme } from './theme.js';

const TOKEN_NAMES = [
    '--md-bg', '--md-paper', '--md-ink', '--md-muted', '--md-accent',
    '--md-accent-soft', '--md-line', '--md-code-bg', '--md-pre-bg',
    '--md-pre-ink', '--md-mono', '--md-sans', '--md-measure'
];

// The full class contract (`../../ai/batches/types/office/BATCH_46/01-html-theme.md`
// § "Class contract" table) — every entry must appear verbatim in every
// theme's CSS text.
const CONTRACT_SELECTORS = [
    'body.md-document', '.md-theme-light', '.md-theme-dark', '.md-theme-auto',
    '.md-single', '.md-multi',
    'header.md-top', 'button#md-nav-toggle', 'span.md-brand', 'span.md-classification',
    'aside.md-nav', 'a.md-nav-item[data-doc]', '.active', 'span.md-nav-title', 'span.md-nav-path',
    'main.md-main', 'article.md-doc',
    'div.md-doc-meta', 'span.md-doc-path', 'span.md-doc-version', 'span.md-doc-date',
    'nav.md-toc', 'span.md-toc-label', 'a[data-level]', 'a[data-level="3"]',
    'div.md-body',
    'div.md-body h1', 'div.md-body h2', 'div.md-body h3',
    'div.md-body h4', 'div.md-body h5', 'div.md-body h6',
    'div.md-body p', 'div.md-body a', 'div.md-body blockquote', 'div.md-body table',
    'div.md-body th', 'div.md-body td', 'div.md-body code', 'div.md-body pre',
    'div.md-body pre code', 'div.md-body ul', 'div.md-body ol', 'div.md-body li',
    'div.md-body input[type=checkbox]', 'div.md-body hr', 'div.md-body img',
    'div.md-body .admonition', 'div.md-body .admonition-title',
    'div.md-body .footnotes', 'div.md-body .footnote-ref',
    'div.md-body mark', 'div.md-body .math', 'div.md-body .mermaid',
    'div.md-pager', 'a.md-pager-prev', 'a.md-pager-next',
    'a.md-dead-link', 'footer.md-footer',
    '@media (max-width: 920px)', 'body.md-nav-open aside.md-nav',
    '@media print', 'article[hidden]'
];

// WCAG 2.x relative-luminance / contrast-ratio formula, implemented locally
// (never copied from src/) so this gate is an independent oracle.
function srgbToLinear(c) {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function relativeLuminance(hex) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
function contrastRatio(hexA, hexB) {
    const lA = relativeLuminance(hexA);
    const lB = relativeLuminance(hexB);
    const lighter = Math.max(lA, lB);
    const darker = Math.min(lA, lB);
    return (lighter + 0.05) / (darker + 0.05);
}
function extractToken(cssText, name) {
    const m = cssText.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})'));
    if (!m) throw new Error('token --' + name + ' not found');
    return m[1];
}

describe('mdHtmlTheme module', () => {
    test('descriptor shape', () => {
        expect(mdHtmlTheme.name).toBe('mdHtmlTheme');
        expect(mdHtmlTheme.dependencies).toEqual(['mdErrors']);
        expect(typeof mdHtmlTheme.factory).toBe('function');
        expect(mdHtmlTheme.factory.toString()).toContain('function');
    });

    test('resolves through the package runtime', () => {
        const theme = runtime.resolve('mdHtmlTheme');
        expect(typeof theme.css).toBe('function');
        expect(theme.THEMES).toEqual(['light', 'dark', 'auto']);
    });

    describe('THEMES', () => {
        test('is frozen and equals [light, dark, auto]', () => {
            const { THEMES } = runtime.resolve('mdHtmlTheme');
            expect(THEMES).toEqual(['light', 'dark', 'auto']);
            expect(Object.isFrozen(THEMES)).toBe(true);
            expect(() => { THEMES.push('sepia'); }).toThrow();
        });
    });

    describe('css', () => {
        let css;
        beforeEach(() => {
            const theme = runtime.resolve('mdHtmlTheme');
            css = theme.css;
        });

        test('css() defaults to css("auto")', () => {
            expect(css()).toBe(css('auto'));
        });

        test('only auto carries the prefers-color-scheme media query', () => {
            expect(css('auto')).toContain('prefers-color-scheme: dark');
            expect(css('light')).not.toContain('prefers-color-scheme: dark');
            expect(css('dark')).not.toContain('prefers-color-scheme: dark');
        });

        test('every token name appears in all three outputs', () => {
            for (const theme of ['light', 'dark', 'auto']) {
                const text = css(theme);
                for (const name of TOKEN_NAMES) {
                    expect(text).toContain(name + ':');
                }
            }
        });

        test('the rules body is byte-identical across the three themes', () => {
            const light = css('light');
            const dark = css('dark');
            const auto = css('auto');

            const rulesOf = (text) => {
                const idx = text.indexOf('.md-document');
                expect(idx).toBeGreaterThan(-1);
                return text.slice(idx);
            };

            const lightRules = rulesOf(light);
            const darkRules = rulesOf(dark);
            const autoRules = rulesOf(auto);

            expect(darkRules).toBe(lightRules);
            expect(autoRules).toBe(lightRules);
        });

        test('every class-contract selector appears in every theme text', () => {
            for (const theme of ['light', 'dark', 'auto']) {
                const text = css(theme);
                for (const selector of CONTRACT_SELECTORS) {
                    expect(text).toContain(selector);
                }
            }
        });

        test('never emits url(), @import, expression() or javascript:', () => {
            const re = /url\(|@import|expression\(|javascript:/i;
            expect(re.test(css('light'))).toBe(false);
            expect(re.test(css('dark'))).toBe(false);
            expect(re.test(css('auto'))).toBe(false);
        });

        test('contrast gate — WCAG AA (>=4.5:1) for both palettes', () => {
            for (const theme of ['light', 'dark']) {
                const text = css(theme);
                const ink = extractToken(text, 'md-ink');
                const paper = extractToken(text, 'md-paper');
                const muted = extractToken(text, 'md-muted');
                const accent = extractToken(text, 'md-accent');
                const preInk = extractToken(text, 'md-pre-ink');
                const preBg = extractToken(text, 'md-pre-bg');

                expect(contrastRatio(ink, paper)).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(muted, paper)).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(accent, paper)).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(preInk, preBg)).toBeGreaterThanOrEqual(4.5);
            }
        });

        test('contrast gate is non-vacuous: a lowered token reds it', () => {
            // Proves the gate above actually discriminates, per
            // ai/conventions/testing.md § "Prove a gate non-vacuous before
            // trusting it": a near-white ink on white paper must fail 4.5:1.
            expect(contrastRatio('#f5f5f5', '#fbfcfa')).toBeLessThan(4.5);
        });

        test('unknown theme throws ContractError md/document-bad-option', () => {
            for (const bad of ['sepia', 42, null]) {
                let caught = null;
                try { css(bad); } catch (e) { caught = e; }
                expect(caught).toBeInstanceOf(ContractError);
                expect(caught.code).toBe('md/document-bad-option');
            }
        });

        test('deterministic: two calls return identical strings', () => {
            expect(css('light')).toBe(css('light'));
            expect(css('dark')).toBe(css('dark'));
            expect(css('auto')).toBe(css('auto'));
        });
    });
});
