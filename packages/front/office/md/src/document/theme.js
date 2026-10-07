// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `mdHtmlTheme` — the embedded stylesheet of the single-HTML
 * document produced by the `md → HTML document` builder
 * (`document/html-document`).
 *
 * Pure string factory — no DOM, no network resource (no `url(`, no
 * `@import`, no `expression(`, no `javascript:` anywhere in the returned
 * text), Worker-safe. Ships three themes (`light`, `dark`, `auto`) sharing
 * ONE rules body over a fixed set of `--md-*` custom properties; only the
 * token block differs between the three.
 *
 * `auto` = the `light` token block on `:root`, plus a
 * `@media (prefers-color-scheme: dark)` block re-declaring the dark tokens
 * — so a single emitted document follows the reader's OS preference without
 * any script.
 *
 * The class contract below is shared with the document builder
 * (`document/html-document`):
 * the builder emits exactly these classes/attributes, this module styles
 * exactly these selectors.
 *
 * @module md/document/theme
 */

import { mdErrors } from '../errors.js';

export const mdHtmlTheme = {
    name: 'mdHtmlTheme',
    dependencies: ['mdErrors'],
    deps: [mdErrors],
    factory(errors) {
        const { ContractError } = errors;

        const THEMES = Object.freeze(['light', 'dark', 'auto']);

        // --- Token palettes (light and dark) ---

        const LIGHT_COLORS = {
            bg: '#f3f5f2', paper: '#fbfcfa', ink: '#1f2420', muted: '#64706a',
            accent: '#1f6b4a', accentSoft: '#e1efe7', line: '#d9e0dc',
            codeBg: '#e8ede9', preBg: '#22292a', preInk: '#e6ebe7'
        };
        const DARK_COLORS = {
            bg: '#121618', paper: '#1b2123', ink: '#e4e9e5', muted: '#9fb0a7',
            accent: '#7fcfa5', accentSoft: '#243430', line: '#33403b',
            codeBg: '#26302c', preBg: '#0f1315', preInk: '#d8dedb'
        };

        function tokenDecls(c) {
            return (
                '  --md-bg: ' + c.bg + ';\n' +
                '  --md-paper: ' + c.paper + ';\n' +
                '  --md-ink: ' + c.ink + ';\n' +
                '  --md-muted: ' + c.muted + ';\n' +
                '  --md-accent: ' + c.accent + ';\n' +
                '  --md-accent-soft: ' + c.accentSoft + ';\n' +
                '  --md-line: ' + c.line + ';\n' +
                '  --md-code-bg: ' + c.codeBg + ';\n' +
                '  --md-pre-bg: ' + c.preBg + ';\n' +
                '  --md-pre-ink: ' + c.preInk + ';\n' +
                '  --md-mono: ui-monospace, \'Cascadia Code\', Consolas, monospace;\n' +
                '  --md-sans: \'Segoe UI\', system-ui, -apple-system, sans-serif;\n' +
                '  --md-measure: 72ch;\n'
            );
        }

        const LIGHT_TOKENS = ':root {\n' + tokenDecls(LIGHT_COLORS) + '}\n';
        const DARK_TOKENS = ':root {\n' + tokenDecls(DARK_COLORS) + '}\n';

        // --- Layout: shell (top bar, sidebar, main, meta, toc, pager, footer) ---

        const LAYOUT = ''
            + '* { box-sizing: border-box; }\n'
            + 'html, body { margin: 0; padding: 0; }\n'
            + 'body.md-document {\n'
            + '  font: 15px/1.62 var(--md-sans);\n'
            + '  background: var(--md-bg);\n'
            + '  color: var(--md-ink);\n'
            + '}\n'
            + '.md-theme-light { color-scheme: light; }\n'
            + '.md-theme-dark { color-scheme: dark; }\n'
            + '.md-theme-auto { color-scheme: light dark; }\n'
            + '\n'
            + 'header.md-top {\n'
            + '  position: fixed; top: 0; left: 0; right: 0; z-index: 30; height: 52px;\n'
            + '  display: flex; align-items: center; gap: 14px; padding: 0 16px;\n'
            + '  background: var(--md-ink); color: var(--md-paper);\n'
            + '  border-bottom: 3px solid var(--md-accent);\n'
            + '}\n'
            + 'header.md-top button#md-nav-toggle {\n'
            + '  display: none; align-items: center; justify-content: center;\n'
            + '  background: transparent; border: 0; color: inherit; font-size: 20px;\n'
            + '  cursor: pointer; padding: 4px 8px; line-height: 1;\n'
            + '}\n'
            + 'header.md-top span.md-brand { font-weight: 600; letter-spacing: .02em; }\n'
            + 'header.md-top span.md-classification {\n'
            + '  margin-left: auto; padding: 2px 10px; border-radius: 999px;\n'
            + '  background: var(--md-accent); color: var(--md-paper);\n'
            + '  font-size: 11px; text-transform: uppercase; letter-spacing: .08em;\n'
            + '}\n'
            + '\n'
            + 'aside.md-nav {\n'
            + '  position: fixed; top: 52px; left: 0; bottom: 0; width: 320px;\n'
            + '  overflow-y: auto; background: var(--md-paper);\n'
            + '  border-right: 1px solid var(--md-line); padding: 12px 0;\n'
            + '}\n'
            + 'aside.md-nav a.md-nav-item[data-doc] {\n'
            + '  display: block; padding: 8px 16px; text-decoration: none;\n'
            + '  color: var(--md-ink); border-left: 3px solid transparent;\n'
            + '}\n'
            + 'aside.md-nav a.md-nav-item[data-doc].active {\n'
            + '  border-left-color: var(--md-accent); background: var(--md-accent-soft);\n'
            + '}\n'
            + 'aside.md-nav a.md-nav-item[data-doc] span.md-nav-title { display: block; font-size: 14px; }\n'
            + 'aside.md-nav a.md-nav-item[data-doc] span.md-nav-path {\n'
            + '  display: block; font-size: 11px; color: var(--md-muted);\n'
            + '}\n'
            + '\n'
            + 'main.md-main { padding-top: 52px; min-height: 100vh; }\n'
            + '.md-single main.md-main { margin-left: 0; }\n'
            + '.md-multi main.md-main { margin-left: 320px; }\n'
            + '.md-single main.md-main article.md-doc { display: block; }\n'
            + '.md-multi main.md-main article[hidden] { display: none; }\n'
            + '\n'
            + 'article.md-doc {\n'
            + '  max-width: var(--md-measure); margin: 0 auto; padding: 32px 24px 64px;\n'
            + '}\n'
            + 'article.md-doc div.md-doc-meta {\n'
            + '  display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px;\n'
            + '  padding-bottom: 12px; border-bottom: 1px solid var(--md-line);\n'
            + '  font-size: 12px; color: var(--md-muted);\n'
            + '}\n'
            + 'article.md-doc div.md-doc-meta span.md-doc-path,\n'
            + 'article.md-doc div.md-doc-meta span.md-doc-version,\n'
            + 'article.md-doc div.md-doc-meta span.md-doc-date { white-space: nowrap; }\n'
            + '\n'
            + 'nav.md-toc {\n'
            + '  margin: 0 0 24px; padding: 12px 16px; background: var(--md-accent-soft);\n'
            + '  border-radius: 6px;\n'
            + '}\n'
            + 'nav.md-toc span.md-toc-label {\n'
            + '  display: block; font-size: 11px; text-transform: uppercase;\n'
            + '  letter-spacing: .08em; color: var(--md-muted); margin-bottom: 6px;\n'
            + '}\n'
            + 'nav.md-toc a[data-level] { display: block; padding: 2px 0; text-decoration: none; color: var(--md-ink); }\n'
            + 'nav.md-toc a[data-level="2"] { padding-left: 12px; }\n'
            + 'nav.md-toc a[data-level="3"] { padding-left: 24px; font-size: 13px; }\n'
            + '\n'
            + 'div.md-pager {\n'
            + '  display: flex; justify-content: space-between; gap: 16px;\n'
            + '  margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--md-line);\n'
            + '}\n'
            + 'div.md-pager a.md-pager-prev, div.md-pager a.md-pager-next {\n'
            + '  color: var(--md-accent); text-decoration: none; font-size: 14px;\n'
            + '}\n'
            + '\n'
            + 'a.md-dead-link {\n'
            + '  color: var(--md-muted); text-decoration: underline dashed; cursor: help;\n'
            + '}\n'
            + '\n'
            + 'footer.md-footer {\n'
            + '  text-align: center; padding: 24px 16px; font-size: 12px; color: var(--md-muted);\n'
            + '}\n';

        // --- Reading styles (the rendered Markdown body) ---

        const BODY = ''
            + '\n'
            + 'div.md-body h1, div.md-body h2, div.md-body h3,\n'
            + 'div.md-body h4, div.md-body h5, div.md-body h6 {\n'
            + '  font-weight: 600; line-height: 1.3; margin: 1.6em 0 .6em; color: var(--md-ink);\n'
            + '}\n'
            + 'div.md-body h1 { font-size: 1.9em; border-bottom: 1px solid var(--md-line); padding-bottom: .2em; }\n'
            + 'div.md-body h2 { font-size: 1.5em; }\n'
            + 'div.md-body h3 { font-size: 1.25em; }\n'
            + 'div.md-body h4 { font-size: 1.1em; }\n'
            + 'div.md-body h5 { font-size: 1em; }\n'
            + 'div.md-body h6 { font-size: .9em; color: var(--md-muted); }\n'
            + 'div.md-body p { margin: 0 0 1em; }\n'
            + 'div.md-body a { color: var(--md-accent); text-decoration: underline; }\n'
            + 'div.md-body a:hover { text-decoration: none; }\n'
            + 'div.md-body blockquote {\n'
            + '  margin: 0 0 1em; padding: 4px 16px; border-left: 3px solid var(--md-accent);\n'
            + '  color: var(--md-muted); background: var(--md-accent-soft);\n'
            + '}\n'
            + 'div.md-body table { display: block; overflow-x: auto; border-collapse: collapse; margin: 0 0 1em; }\n'
            + 'div.md-body th, div.md-body td {\n'
            + '  border: 1px solid var(--md-line); padding: 6px 10px; text-align: left;\n'
            + '}\n'
            + 'div.md-body th { background: var(--md-code-bg); font-weight: 600; }\n'
            + 'div.md-body code {\n'
            + '  font-family: var(--md-mono); font-size: .9em;\n'
            + '  background: var(--md-code-bg); padding: .1em .35em; border-radius: 4px;\n'
            + '}\n'
            + 'div.md-body pre {\n'
            + '  font-family: var(--md-mono); font-size: .9em; line-height: 1.5;\n'
            + '  background: var(--md-pre-bg); color: var(--md-pre-ink);\n'
            + '  padding: 14px 16px; border-radius: 6px; overflow-x: auto; margin: 0 0 1em;\n'
            + '}\n'
            + 'div.md-body pre code { background: transparent; padding: 0; border-radius: 0; color: inherit; }\n'
            + 'div.md-body ul, div.md-body ol { margin: 0 0 1em; padding-left: 1.6em; }\n'
            + 'div.md-body li { margin: .25em 0; }\n'
            + 'div.md-body input[type=checkbox] { margin-right: .5em; }\n'
            + 'div.md-body hr { border: 0; border-top: 1px solid var(--md-line); margin: 2em 0; }\n'
            + 'div.md-body img { max-width: 100%; height: auto; }\n'
            + 'div.md-body .admonition {\n'
            + '  margin: 0 0 1em; padding: 12px 16px; border-left: 3px solid var(--md-accent);\n'
            + '  background: var(--md-accent-soft); border-radius: 0 6px 6px 0;\n'
            + '}\n'
            + 'div.md-body .admonition-title { font-weight: 600; margin-bottom: .4em; }\n'
            + 'div.md-body .footnotes {\n'
            + '  margin-top: 2em; padding-top: 1em; border-top: 1px solid var(--md-line);\n'
            + '  font-size: .9em; color: var(--md-muted);\n'
            + '}\n'
            + 'div.md-body .footnote-ref { font-size: .75em; vertical-align: super; }\n'
            + 'div.md-body mark { background: var(--md-accent-soft); color: var(--md-ink); padding: 0 .2em; }\n'
            + 'div.md-body .math { font-family: var(--md-mono); }\n'
            + 'div.md-body .mermaid {\n'
            + '  font-family: var(--md-mono); font-size: .9em; line-height: 1.5;\n'
            + '  background: var(--md-pre-bg); color: var(--md-pre-ink);\n'
            + '  padding: 14px 16px; border-radius: 6px; overflow-x: auto; margin: 0 0 1em;\n'
            + '}\n';

        // --- Responsive (off-canvas sidebar under 920px) ---

        const RESPONSIVE = ''
            + '\n'
            + '@media (max-width: 920px) {\n'
            + '  header.md-top button#md-nav-toggle { display: inline-flex; }\n'
            + '  aside.md-nav {\n'
            + '    left: -320px; transition: left .2s ease; z-index: 20;\n'
            + '    box-shadow: 2px 0 12px rgba(0, 0, 0, .2);\n'
            + '  }\n'
            + '  body.md-nav-open aside.md-nav { left: 0; }\n'
            + '  .md-single main.md-main, .md-multi main.md-main { margin-left: 0; width: 100%; }\n'
            + '}\n';

        // --- Print (kiosk chrome hidden, article unboxed) ---

        const PRINT = ''
            + '\n'
            + '@media print {\n'
            + '  header.md-top, aside.md-nav, div.md-pager, footer.md-footer { display: none; }\n'
            + '  main.md-main { margin: 0; padding-top: 0; }\n'
            + '  article.md-doc { max-width: none; margin: 0; padding: 0; }\n'
            + '  article[hidden] { display: none; }\n'
            + '}\n';

        const RULES = LAYOUT + BODY + RESPONSIVE + PRINT;

        function css(theme) {
            const t = theme === undefined ? 'auto' : theme;
            if (!THEMES.includes(t)) {
                throw new ContractError('md/document-bad-option',
                    'mdHtmlTheme.css: unknown theme "' + String(t) + '" (expected light | dark | auto)',
                    { context: { option: 'theme', got: t, expected: THEMES.slice() } });
            }
            if (t === 'light') return LIGHT_TOKENS + RULES;
            if (t === 'dark')  return DARK_TOKENS + RULES;
            return (
                LIGHT_TOKENS
                + '@media (prefers-color-scheme: dark) {\n'
                + DARK_TOKENS.replace(/^/gm, '  ').trimEnd() + '\n'
                + '}\n'
                + RULES
            );
        }

        return { THEMES, css };
    }
};
