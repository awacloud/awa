// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `mdHtmlDocument` — Markdown (one or several documents) → ONE
 * self-contained, sanitised HTML document.
 *
 *   - `renderFragment(document, options)` — one Markdown source → a sanitised
 *     body fragment whose headings carry ids on every level, plus the heading
 *     list and the warnings of the run.
 *   - `build(options)` — N documents → one complete HTML page embedding
 *     `mdHtmlTheme.css(theme)`, a sidebar (multi), a per-document TOC,
 *     prev/next pager (multi), a hash router (multi), print CSS and the
 *     licence notice block.
 *
 * Security boundary: every fragment passes `@awacloud/fw` `sanitizeHtml`
 * LAST and unconditionally. The renderer runs with an explicit `safe: false`
 * and no `sanitize` (its hardening would run too early, and would erase the
 * author raw HTML this module hands to the allowlisted sanitiser). The shell
 * around the fragments is module-authored; every consumer-supplied string in
 * it is escaped.
 *
 * Pure string factory — no DOM, no network, no clock, no randomness;
 * Worker-safe. Every helper lives inside the factory (fw/no-factory-capture).
 *
 * @module md/document/html-document
 */

/**
 * @typedef {{ path: string, source: string, title?: string }} Document
 * @typedef {{ name: string, install: (md: object) => void }} Extension
 *   A RESOLVED extra, e.g. `runtime.resolve('mdEmoji')`.
 * @typedef {{ code: 'link/unresolved' | 'title/fallback' | 'heading/unanchored', document: string, detail: string }} Warning
 * @typedef {{ level: 1|2|3|4|5|6, text: string, id: string }} Heading
 * @typedef {{ id: string, path: string, title: string, html: string, headings: Heading[], warnings: Warning[] }} Fragment
 * @typedef {{
 *   external?: 'new-tab' | 'same-tab',
 *   unresolved?: 'neutralise' | 'keep',
 *   resolve?: (target: { path: string, fragment: string|null, markdown: boolean }, from: Document) => string | null
 * }} LinkOptions
 * @typedef {false | { minLevel?: number, maxLevel?: number, minHeadings?: number }} TocOptions
 * @typedef {{ extras?: Extension[], links?: LinkOptions, toc?: TocOptions, id?: string, idPrefix?: string, reservedIds?: Iterable<string> }} FragmentOptions
 * @typedef {{
 *   documents: Document[],
 *   title?: string,
 *   lang?: string,
 *   theme?: 'light' | 'dark' | 'auto',
 *   classification?: { label?: string, version?: string, date?: string },
 *   extras?: Extension[],
 *   links?: LinkOptions,
 *   toc?: TocOptions,
 *   css?: string,
 *   notice?: { source?: string, extra?: string }
 * }} BuildOptions
 * @typedef {{ html: string, documents: Fragment[], warnings: Warning[] }} BuildResult
 */

import { mdErrors }      from '../errors.js';
import { mdMod as md }   from '../md.js';                  // aliased: binding ≠ name (fw-codegen deps rule)
import { sanitize }      from '@awacloud/fw/dom/rendering/sanitize.js';
import { mdToc }         from '../extra/toc.js';
import { mdFrontmatter } from '../extra/frontmatter.js';
import { mdFootnotes }   from '../extra/footnotes.js';
import { mdAdmonitions } from '../extra/admonitions.js';
import { mdHtmlTheme }   from './theme.js';

export const mdHtmlDocument = {
    name: 'mdHtmlDocument',
    dependencies: ['mdErrors', 'md', 'sanitize', 'mdToc', 'mdFrontmatter', 'mdFootnotes', 'mdAdmonitions', 'mdHtmlTheme'],
    deps: [mdErrors, md, sanitize, mdToc, mdFrontmatter, mdFootnotes, mdAdmonitions, mdHtmlTheme],
    factory(errors, md, sanitize, toc, frontmatter, footnotes, admonitions, theme) {
        const { ContractError } = errors;

        // Canonical md-full relative order: frontmatter first, toc before admonitions.
        const DEFAULT_EXTRAS = [frontmatter, footnotes, toc, admonitions];

        // fw default allowlist + GFM task-list checkboxes. `input` never keeps
        // name/value/form* (fw blocks formaction/action unconditionally).
        const ALLOWLIST = {
            allowedTags: new Set([...sanitize.defaultAllowlist.tags, 'input']),
            allowedAttributes: {
                ...sanitize.defaultAllowlist.attributes,
                input: new Set(['type', 'checked', 'disabled'])
            }
        };

        const LANG_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/;
        const EXTERNAL_VALUES = ['new-tab', 'same-tab'];
        const UNRESOLVED_VALUES = ['neutralise', 'keep'];
        const TOC_DEFAULTS = { minLevel: 2, maxLevel: 3, minHeadings: 2 };

        const NOTICE_LINES = [
            '@awacloud/md html-document — the stylesheet and script embedded in this file',
            'Copyright (c) 2026 AwaCloud SAS',
            'SPDX-License-Identifier: AGPL-3.0-only',
            'Dual-licensed; see the NOTICE file of @awacloud/md for licensing and any additional terms.',
            'This notice covers the embedded stylesheet and script only, not the document content.'
        ];

        // --- String helpers --------------------------------------------------

        function escapeHtml(s) {
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        /** Attribute escaping — `& " < >`. */
        function escapeAttr(s) {
            return escapeHtml(s);
        }

        /** Decode the four entities the renderer emits (`&amp;` last). */
        function decodeBasic(s) {
            return String(s)
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&');
        }

        /** Heading-pairing normaliser: strip tags, decode, collapse whitespace, trim. */
        function norm(s) {
            return decodeBasic(String(s).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
        }

        /** Pure POSIX path normaliser (`\` treated as `/`, `.`/`..` resolved). */
        function normalisePath(p) {
            const out = [];
            for (const seg of String(p).replace(/\\/g, '/').split('/')) {
                if (seg === '' || seg === '.') continue;
                if (seg === '..') {
                    if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
                    else out.push('..');
                    continue;
                }
                out.push(seg);
            }
            return out.join('/');
        }

        function dirnameOf(p) {
            const s = String(p).replace(/\\/g, '/');
            const i = s.lastIndexOf('/');
            return i < 0 ? '' : s.slice(0, i);
        }

        function basenameNoExt(p) {
            const s = String(p).replace(/\\/g, '/');
            const base = s.slice(s.lastIndexOf('/') + 1);
            return base.replace(/\.[^.]+$/, '') || base;
        }

        function docIdOf(path) {
            const id = toc.slugify(String(path).replace(/\.[^./\\]+$/, '').replace(/[\\/]+/g, '-'));
            return id || 'doc';
        }

        /** Neutralise the comment breakouts of a trusted notice line. */
        function neutraliseNotice(s) {
            return String(s).replace(/-->/g, '--\\u003e').replace(/\*\//g, '* /');
        }

        function noticeLines(notice) {
            const lines = NOTICE_LINES.slice();
            if (notice && notice.source !== undefined) lines.push('Source: ' + neutraliseNotice(notice.source));
            if (notice && notice.extra !== undefined) lines.push(neutraliseNotice(notice.extra));
            return lines;
        }

        // --- Validation ------------------------------------------------------

        function badInput(message, index, field) {
            return new ContractError('md/document-bad-input', 'mdHtmlDocument: ' + message,
                { context: { index, field } });
        }

        function badOption(option, got, message) {
            return new ContractError('md/document-bad-option',
                'mdHtmlDocument.build: ' + (message || ('invalid option "' + option + '"')),
                { context: { option, got } });
        }

        function isPlainObject(v) {
            return v !== null && typeof v === 'object' && !Array.isArray(v);
        }

        function validateDocument(doc, index) {
            if (!isPlainObject(doc)) throw badInput('document entry is not an object', index, null);
            if (typeof doc.path !== 'string' || doc.path === '') {
                throw badInput('document.path must be a non-empty string', index, 'path');
            }
            if (typeof doc.source !== 'string') throw badInput('document.source must be a string', index, 'source');
            if (doc.title !== undefined && typeof doc.title !== 'string') {
                throw badInput('document.title must be a string when present', index, 'title');
            }
        }

        function checkString(option, v) {
            if (v !== undefined && typeof v !== 'string') throw badOption(option, v, '"' + option + '" must be a string');
        }

        function isLevel(v) {
            return Number.isInteger(v) && v >= 1 && v <= 6;
        }

        function validateBuild(options) {
            const o = isPlainObject(options) ? options : {};
            const documents = o.documents;
            if (!Array.isArray(documents) || documents.length === 0) {
                throw badInput('documents must be a non-empty array', null, 'documents');
            }
            documents.forEach(validateDocument);

            if (o.theme !== undefined && !theme.THEMES.includes(o.theme)) {
                throw badOption('theme', o.theme, 'unknown theme (expected light | dark | auto)');
            }
            if (o.lang !== undefined && (typeof o.lang !== 'string' || !LANG_RE.test(o.lang))) {
                throw badOption('lang', o.lang, '"lang" must be a BCP 47-like language tag');
            }
            if (o.links !== undefined) {
                if (!isPlainObject(o.links)) throw badOption('links', o.links);
                const l = o.links;
                if (l.external !== undefined && !EXTERNAL_VALUES.includes(l.external)) {
                    throw badOption('links.external', l.external);
                }
                if (l.unresolved !== undefined && !UNRESOLVED_VALUES.includes(l.unresolved)) {
                    throw badOption('links.unresolved', l.unresolved);
                }
                if (l.resolve !== undefined && typeof l.resolve !== 'function') {
                    throw badOption('links.resolve', l.resolve);
                }
            }
            if (o.toc !== undefined && o.toc !== false) {
                if (!isPlainObject(o.toc)) throw badOption('toc', o.toc);
                const t = o.toc;
                if (t.minLevel !== undefined && !isLevel(t.minLevel)) throw badOption('toc', t);
                if (t.maxLevel !== undefined && !isLevel(t.maxLevel)) throw badOption('toc', t);
                const min = t.minLevel !== undefined ? t.minLevel : TOC_DEFAULTS.minLevel;
                const max = t.maxLevel !== undefined ? t.maxLevel : TOC_DEFAULTS.maxLevel;
                if (min > max) throw badOption('toc', t, '"toc.minLevel" must be <= "toc.maxLevel"');
                if (t.minHeadings !== undefined && !(Number.isInteger(t.minHeadings) && t.minHeadings >= 0)) {
                    throw badOption('toc', t);
                }
            }
            if (o.extras !== undefined) {
                const ok = Array.isArray(o.extras) && o.extras.every((e) =>
                    isPlainObject(e) && typeof e.name === 'string' && typeof e.install === 'function');
                if (!ok) throw badOption('extras', o.extras, '"extras" must be an array of { name, install }');
            }
            checkString('title', o.title);
            checkString('css', o.css);
            if (o.notice !== undefined) {
                if (!isPlainObject(o.notice)) throw badOption('notice', o.notice);
                checkString('notice.source', o.notice.source);
                checkString('notice.extra', o.notice.extra);
            }
            if (o.classification !== undefined) {
                if (!isPlainObject(o.classification)) throw badOption('classification', o.classification);
                checkString('classification.label', o.classification.label);
                checkString('classification.version', o.classification.version);
                checkString('classification.date', o.classification.date);
            }
            return o;
        }

        // --- renderFragment --------------------------------------------------

        function titleOf(document, ast, headings, warnings) {
            if (document.title !== undefined) return document.title;
            const fm = ast.data && ast.data.frontmatter;
            if (fm && fm.lang === 'yaml' && typeof fm.content === 'string') {
                const m = /^title:\s*(.+?)\s*$/m.exec(fm.content);
                if (m) {
                    const raw = m[1];
                    const q = /^"([\s\S]*)"$/.exec(raw) || /^'([\s\S]*)'$/.exec(raw);
                    return q ? q[1] : raw;
                }
            }
            for (const h of headings) if (h.level === 1) return h.text;
            const base = basenameNoExt(document.path);
            warnings.push({ code: 'title/fallback', document: document.path, detail: base });
            return base;
        }

        /**
         * Inject heading ids. Returns the html split into pieces; `protect[i]`
         * marks the freshly anchored open tags that the id-prefix pass must
         * not rewrite a second time.
         */
        function anchorHeadings(html, headings, idPrefix, document, warnings) {
            const TAG_RE = /<h([1-6])>([\s\S]*?)<\/h\1>/g;
            const tags = [];
            let m;
            while ((m = TAG_RE.exec(html)) !== null) {
                tags.push({ index: m.index, level: Number(m[1]), inner: m[2], length: m[0].length });
            }
            // Fast path: when the renderer's bare tags are exactly the AST
            // headings (same count, same levels — i.e. no raw-HTML heading
            // interleaved), pair positionally. This is equivalent to the text
            // walk whenever the walk anchors everything, and stays correct for
            // headings whose rendered text differs from the AST text (setext
            // soft breaks, image alt, tag-like code spans, footnote refs).
            const positional = tags.length === headings.length &&
                tags.every((t, i) => t.level === headings[i].level);
            const pieces = [];
            const protect = [];
            let last = 0;
            let cursor = 0;
            for (const t of tags) {
                const h = headings[cursor];
                const matched = h !== undefined && t.level === h.level &&
                    (positional || norm(t.inner) === norm(h.text));
                if (!matched) continue;
                pieces.push(html.slice(last, t.index)); protect.push(false);
                pieces.push('<h' + t.level + ' id="' + idPrefix + h.slug + '">'); protect.push(true);
                last = t.index + 3 + 1;   // past '<hN>'
                cursor++;
            }
            pieces.push(html.slice(last)); protect.push(false);
            for (let i = cursor; i < headings.length; i++) {
                warnings.push({ code: 'heading/unanchored', document: document.path, detail: headings[i].text });
            }
            return { pieces, protect };
        }

        function prefixIds(pieces, protect, idPrefix, renamed) {
            if (idPrefix === '' && renamed.size === 0) return pieces.join('');
            let out = '';
            for (let i = 0; i < pieces.length; i++) {
                if (protect[i]) { out += pieces[i]; continue; }
                out += pieces[i]
                    .replace(/(\sid=")([^"]*)"/g, (_, a, v) => a + idPrefix + v + '"')
                    .replace(/(\shref="#)([^"]*)"/g, (_, a, v) => a + idPrefix + (renamed.get(v) || v) + '"');
            }
            return out;
        }

        /** An iterable of ids already used on the page → a Set (`md/document-bad-option` otherwise). */
        function reservedSet(reservedIds) {
            if (reservedIds === undefined || reservedIds === null) return new Set();
            if (typeof reservedIds === 'string' || typeof reservedIds[Symbol.iterator] !== 'function') {
                throw badOption('reservedIds', reservedIds, '"reservedIds" must be an iterable of strings');
            }
            const set = new Set();
            for (const id of reservedIds) {
                if (typeof id !== 'string') {
                    throw badOption('reservedIds', reservedIds, '"reservedIds" must be an iterable of strings');
                }
                set.add(id);
            }
            return set;
        }

        /**
         * Rename every heading whose final id (`idPrefix + slug`) is reserved to
         * `slug-1`, `slug-2`, … (first free; never another heading of the
         * fragment). Mutates `headings[i].slug`; returns old slug → new slug.
         */
        function reserveHeadingIds(headings, idPrefix, reserved) {
            const renamed = new Map();
            if (reserved.size === 0) return renamed;
            const taken = new Set(reserved);
            for (const h of headings) taken.add(idPrefix + h.slug);
            for (const h of headings) {
                if (!reserved.has(idPrefix + h.slug)) continue;
                let n = 1;
                while (taken.has(idPrefix + h.slug + '-' + n)) n++;
                const old = h.slug;
                h.slug = old + '-' + n;
                taken.add(idPrefix + h.slug);
                renamed.set(old, h.slug);
            }
            return renamed;
        }

        function rewriteLinks(html, document, links, warnings) {
            const external = links.external || 'new-tab';
            const unresolved = links.unresolved || 'neutralise';
            const resolve = typeof links.resolve === 'function' ? links.resolve : null;
            return html.replace(/<a href="([^"]*)"([^>]*)>/g, (whole, rawHref, rest) => {
                const href = decodeBasic(rawHref);
                if (href.charAt(0) === '#') return whole;
                if (/^(https?:|mailto:)/i.test(href)) {
                    if (external !== 'new-tab') return whole;
                    let add = '';
                    if (!/\starget\s*=/i.test(rest)) add += ' target="_blank"';
                    if (!/\srel\s*=/i.test(rest)) add += ' rel="noopener noreferrer"';
                    return '<a href="' + rawHref + '"' + rest + add + '>';
                }
                // Relative only: no scheme, not root- or protocol-relative.
                if (/^[a-z][a-z0-9+.-]*:/i.test(href) || /^[\\/]/.test(href)) return whole;
                const hashAt = href.indexOf('#');
                const pathPart = hashAt < 0 ? href : href.slice(0, hashAt);
                if (pathPart === '') return whole;   // `href=""`: no file target to resolve
                const isMd = /\.md$/i.test(pathPart);
                const fragment = hashAt < 0 || hashAt === href.length - 1 ? null : href.slice(hashAt + 1);
                let decoded = pathPart;
                try { decoded = decodeURIComponent(pathPart); } catch { /* keep raw */ }
                const dir = dirnameOf(document.path);
                const target = { path: normalisePath(dir === '' ? decoded : dir + '/' + decoded), fragment, markdown: isMd };
                const resolved = resolve ? resolve(target, document) : null;
                if (typeof resolved === 'string') {
                    return '<a href="' + escapeAttr(resolved) + '"' + rest + '>';
                }
                if (!isMd) return whole;
                warnings.push({ code: 'link/unresolved', document: document.path, detail: href });
                if (unresolved === 'keep') return whole;
                return '<a class="md-dead-link" title="' + escapeAttr(href) + '">';
            });
        }

        /**
         * One Markdown source → sanitised fragment with heading ids.
         * @param {Document} document
         * @param {FragmentOptions} [options]
         * @returns {Fragment}
         */
        function renderFragment(document, options) {
            validateDocument(document, null);
            const o = options || {};
            const extras = o.extras !== undefined && o.extras !== null ? o.extras : DEFAULT_EXTRAS;
            const idPrefix = typeof o.idPrefix === 'string' ? o.idPrefix : '';
            const links = o.links || {};
            const warnings = [];

            // 1. Fresh instance + extras.
            const m = md.createMd();
            for (const e of extras) m.use(e);
            // 2. Parse.
            const ast = m.parse(document.source);
            // 3. Headings (the package's single slug owner).
            const headings = toc.collectHeadings(ast, { minLevel: 1, maxLevel: 6 });
            const renamed = reserveHeadingIds(headings, idPrefix, reservedSet(o.reservedIds));
            // 4. Title.
            const title = titleOf(document, ast, headings, warnings);
            // 5. Render — explicit `safe: false` (the renderer hardens by
            // default) and no `sanitize` here: step 9 is the single boundary.
            let html = m.render(ast, { safe: false });
            // 6. Heading anchors.
            const anchored = anchorHeadings(html, headings, idPrefix, document, warnings);
            // 7. Id prefix (multi-document); in-document `#slug` links follow a renamed heading.
            html = prefixIds(anchored.pieces, anchored.protect, idPrefix, renamed);
            // 8. Links.
            html = rewriteLinks(html, document, links, warnings);
            // 9. Sanitise — always, last, unconditionally.
            html = sanitize.sanitizeHtml(html, ALLOWLIST);
            // 10. Result.
            const id = o.id !== undefined && o.id !== null ? o.id : docIdOf(document.path);
            return {
                id,
                path: document.path,
                title,
                html,
                headings: headings.map((h) => ({ level: h.level, text: h.text, id: idPrefix + h.slug })),
                warnings
            };
        }

        // --- build -----------------------------------------------------------

        function renderToc(headings, tocOpts) {
            if (tocOpts === false) return '';
            const minLevel = tocOpts.minLevel !== undefined ? tocOpts.minLevel : TOC_DEFAULTS.minLevel;
            const maxLevel = tocOpts.maxLevel !== undefined ? tocOpts.maxLevel : TOC_DEFAULTS.maxLevel;
            const minHeadings = tocOpts.minHeadings !== undefined ? tocOpts.minHeadings : TOC_DEFAULTS.minHeadings;
            const picked = headings.filter((h) => h.level >= minLevel && h.level <= maxLevel);
            if (picked.length === 0 || picked.length < minHeadings) return '';
            return '<nav class="md-toc"><span class="md-toc-label">On this page</span> ' +
                picked.map((h) => '<a href="#' + escapeAttr(h.id) + '" data-level="' + h.level + '">' +
                    escapeHtml(h.text) + '</a>').join(' · ') +
                '</nav>\n';
        }

        function routerScript(ids) {
            const idsJson = JSON.stringify(ids).replace(/</g, '\\u003c');
            return '(function () {\n' +
                '  \'use strict\';\n' +
                '  var ids = ' + idsJson + ';\n' +
                '  function known(id) { return ids.indexOf(id) !== -1; }\n' +
                '  function route() {\n' +
                '    var hash = window.location.hash ? window.location.hash.slice(1) : \'\';\n' +
                '    var sep = hash.indexOf(\'--\');\n' +
                '    var current = ids[0];\n' +
                '    if (hash && known(hash)) current = hash;\n' +
                '    else if (sep > 0 && known(hash.slice(0, sep))) current = hash.slice(0, sep);\n' +
                '    var articles = document.querySelectorAll(\'article.md-doc\');\n' +
                '    for (var i = 0; i < articles.length; i++) articles[i].hidden = (articles[i].id !== current);\n' +
                '    var items = document.querySelectorAll(\'.md-nav-item\');\n' +
                '    for (var j = 0; j < items.length; j++) {\n' +
                '      items[j].classList.toggle(\'active\', items[j].getAttribute(\'data-doc\') === current);\n' +
                '    }\n' +
                '    var target = (hash && hash !== current) ? document.getElementById(hash) : null;\n' +
                '    if (target) target.scrollIntoView(); else window.scrollTo(0, 0);\n' +
                '  }\n' +
                '  window.addEventListener(\'hashchange\', route);\n' +
                '  var toggle = document.getElementById(\'md-nav-toggle\');\n' +
                '  if (toggle) toggle.addEventListener(\'click\', function () { document.body.classList.toggle(\'md-nav-open\'); });\n' +
                '  route();\n' +
                '})();\n';
        }

        /**
         * N documents → one complete HTML page.
         * @param {BuildOptions} options
         * @returns {BuildResult}
         */
        function build(options) {
            // 1. Validate.
            const o = validateBuild(options);
            const documents = o.documents;
            const multi = documents.length > 1;
            const themeName = o.theme !== undefined ? o.theme : 'auto';
            const lang = o.lang !== undefined ? o.lang : 'en';
            const links = o.links || {};
            const tocOpts = o.toc === false ? false : (o.toc || {});
            const cls = o.classification || {};

            // 2. Doc ids, deduped in order (collectHeadings' -1, -2 scheme).
            const ids = [];
            const seen = new Map();
            for (const d of documents) {
                const base = docIdOf(d.path);
                const n = seen.get(base) || 0;
                seen.set(base, n + 1);
                ids.push(n > 0 ? base + '-' + n : base);
            }
            const byPath = new Map();
            documents.forEach((d, i) => {
                const key = normalisePath(d.path);
                if (!byPath.has(key)) byPath.set(key, ids[i]);
            });

            function setResolver(target, from) {
                if (typeof links.resolve === 'function') {
                    const r = links.resolve(target, from);
                    if (typeof r === 'string') return r;
                }
                const id = byPath.get(target.path);
                if (id === undefined) return null;
                if (multi) return '#' + id + (target.fragment ? '--' + target.fragment : '');
                return target.fragment ? '#' + target.fragment : '#' + id;
            }

            // 3. Fragments.
            // Reserved: the article ids and the shell's fixed ids, then the ids
            // each fragment emitted (rendered in document order).
            const used = new Set([...ids, ...(multi ? ['md-nav-toggle'] : [])]);
            const fragments = [];
            documents.forEach((d, i) => {
                const frag = renderFragment(d, {
                    extras: o.extras,
                    links: { ...links, resolve: setResolver },
                    toc: o.toc,
                    id: ids[i],
                    idPrefix: multi ? ids[i] + '--' : '',
                    reservedIds: used
                });
                for (const h of frag.headings) used.add(h.id);
                fragments.push(frag);
            });

            const title = o.title !== undefined ? o.title : (multi ? 'Documents' : fragments[0].title);
            const notice = noticeLines(o.notice);
            const noticeComment = '<!--\n' + notice.join('\n') + '\n-->';
            const noticeBlock = '/*!\n' + notice.join('\n') + '\n*/\n';
            const userCss = o.css !== undefined ? o.css : '';
            const styleBody = (noticeBlock + theme.css(themeName) + (userCss ? '\n' + userCss + '\n' : ''))
                .replace(/<\/style/gi, '<\\/style');

            // 5. Assemble.
            let out = '';
            out += '<!DOCTYPE html>\n';
            out += '<html lang="' + escapeAttr(lang) + '">\n';
            out += '<head>\n';
            out += '<meta charset="utf-8">\n';
            out += '<meta name="viewport" content="width=device-width, initial-scale=1">\n';
            out += '<meta name="referrer" content="no-referrer">\n';
            out += '<title>' + escapeHtml(title) + '</title>\n';
            out += noticeComment + '\n';
            out += '<style>' + styleBody + '</style>\n';
            out += '</head>\n';
            out += '<body class="md-document md-theme-' + themeName + ' ' + (multi ? 'md-multi' : 'md-single') + '">\n';
            out += '<header class="md-top">' +
                (multi ? '<button id="md-nav-toggle" aria-label="Menu">&#9776;</button>' : '') +
                '<span class="md-brand">' + escapeHtml(title) + '</span>' +
                (cls.label !== undefined ? '<span class="md-classification">' + escapeHtml(cls.label) + '</span>' : '') +
                '</header>\n';
            if (multi) {
                out += '<aside class="md-nav">\n';
                fragments.forEach((f) => {
                    out += '<a class="md-nav-item" href="#' + escapeAttr(f.id) + '" data-doc="' + escapeAttr(f.id) + '">' +
                        '<span class="md-nav-title">' + escapeHtml(f.title) + '</span>' +
                        '<span class="md-nav-path">' + escapeHtml(f.path) + '</span></a>\n';
                });
                out += '</aside>\n';
            }
            out += '<main class="md-main">\n';
            fragments.forEach((f, i) => {
                out += '<article class="md-doc" id="' + escapeAttr(f.id) + '"' + (multi && i > 0 ? ' hidden' : '') + '>\n';
                out += '<div class="md-doc-meta"><span class="md-doc-path">' + escapeHtml(f.path) + '</span>' +
                    (cls.version !== undefined ? '<span class="md-doc-version">' + escapeHtml(cls.version) + '</span>' : '') +
                    (cls.date !== undefined ? '<span class="md-doc-date">' + escapeHtml(cls.date) + '</span>' : '') +
                    '</div>\n';
                // 4. Per-document TOC.
                out += renderToc(f.headings, tocOpts);
                out += '<div class="md-body">\n' + f.html + '</div>\n';
                if (multi) {
                    const prev = fragments[i - 1];
                    const next = fragments[i + 1];
                    out += '<div class="md-pager">' +
                        (prev ? '<a class="md-pager-prev" href="#' + escapeAttr(prev.id) + '">&larr; ' + escapeHtml(prev.title) + '</a>' : '<span></span>') +
                        (next ? '<a class="md-pager-next" href="#' + escapeAttr(next.id) + '">' + escapeHtml(next.title) + ' &rarr;</a>' : '<span></span>') +
                        '</div>\n';
                }
                out += '</article>\n';
            });
            out += '</main>\n';
            const footerParts = [cls.label, cls.version, cls.date].filter((v) => v !== undefined && v !== '');
            out += '<footer class="md-footer">' + footerParts.map(escapeHtml).join(' · ') + '</footer>\n';
            if (multi) {
                const scriptBody = (noticeBlock + routerScript(ids)).replace(/<\/script/gi, '<\\/script');
                out += '<script>' + scriptBody + '</script>\n';
            }
            out += '</body>\n';
            out += '</html>\n';

            return {
                html: out,
                documents: fragments,
                warnings: fragments.reduce((acc, f) => acc.concat(f.warnings), [])
            };
        }

        return { renderFragment, build };
    }
};
