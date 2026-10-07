// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Shared test helpers for `@awacloud/md`.
 *
 * Bootstraps a single package-level `ModuleRuntime`, registers every
 * factory descriptor exposed by `src/main.js` (fw_require / modules /
 * extras / bundle), and re-exports the materialised instances and
 * named members under their historical, test-ergonomic names.
 *
 * This is the **only** test surface allowed to materialise instances at
 * import time. `src/main.js` is now strictly a descriptor manifest — no
 * runtime bootstrap, no re-exports of resolved instances.
 *
 * @module tests/_helpers/build
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import {
    fw_require, modules, extras, bundle
} from '../../src/main.js';

// Re-export descriptor arrays for tests that introspect them.
export { fw_require, modules, extras, bundle };

// Re-export raw descriptors for advanced tests (factory shape, etc.).
export { mdErrors }              from '../../src/errors.js';
export { mdCommon }              from '../../src/common.js';
export { mdShared }              from '../../src/_shared/index.js';
export { mdAstTypes }            from '../../src/ast/types.js';
export { mdNode }                from '../../src/ast/node.js';
export { mdAstWalker }           from '../../src/ast/walker.js';
export { mdAstManipulation }     from '../../src/ast/manipulation.js';
export { refsLinkRefs }          from '../../src/refs/linkRefs.js';
export { mdBlockHtmlPatterns }   from '../../src/block/html-patterns.js';
export { mdBlockLinkRef }        from '../../src/block/link-ref.js';
export { mdBlockListData }       from '../../src/block/list-data.js';
export { mdBlockTable }          from '../../src/block/table.js';
export { mdBlockTaskList }       from '../../src/block/task-list.js';
export { mdBlockTypes }          from '../../src/block/block-types.js';
export { mdBlockStarts }         from '../../src/block/block-starts.js';
export { mdBlockCursor }         from '../../src/block/cursor.js';
export { blockParser }           from '../../src/block/parser.js';
export { inlineParser }          from '../../src/inline/parser.js';
export { inlineParserBuilder }   from '../../src/inline/parser-builder.js';
export { mdInlineRegex }         from '../../src/inline/regex.js';
export { mdInlineHelpers }       from '../../src/inline/helpers.js';
export { mdInlineEscapes }       from '../../src/inline/escapes.js';
export { mdInlineCodeSpan }      from '../../src/inline/code-span.js';
export { mdInlineAutolink }      from '../../src/inline/autolink.js';
export { mdInlineAutolinkExt }   from '../../src/inline/autolink-ext.js';
export { mdInlineDelimiterStack } from '../../src/inline/delimiter-stack.js';
export { mdInlineLink }          from '../../src/inline/link.js';
export { mdInlineLineBreak }     from '../../src/inline/line-break.js';
export { mdInlineSourcepos }     from '../../src/inline/sourcepos.js';
export { renderHtmlMod }         from '../../src/render/html.js';
export { renderXmlMod }          from '../../src/render/xml.js';
export { renderMarkdownMod }     from '../../src/render/markdown.js';
export { mdWalker }              from '../../src/md-walker.js';
export { mdMod }                 from '../../src/md.js';

import { mdFrontmatter as _mdFrontmatterDesc } from '../../src/extra/frontmatter.js';
import { mdEmoji as _mdEmojiDesc }             from '../../src/extra/emoji.js';
import { mdMath as _mdMathDesc }               from '../../src/extra/math.js';
import { mdFootnotes as _mdFootnotesDesc }     from '../../src/extra/footnotes.js';
import { mdWikilinks as _mdWikilinksDesc }     from '../../src/extra/wikilinks.js';
import { mdAdmonitions as _mdAdmonitionsDesc } from '../../src/extra/admonitions.js';
import { mdHighlight as _mdHighlightDesc }     from '../../src/extra/highlight.js';
import { mdSubsuper as _mdSubsuperDesc }       from '../../src/extra/subsuper.js';
import { mdToc as _mdTocDesc }                 from '../../src/extra/toc.js';
import { mdMermaid as _mdMermaidDesc }         from '../../src/extra/mermaid.js';
import { mdFullBundle as _mdFullBundleDesc }   from '../../src/bundles/md-full.js';

// ── Build the package-level runtime ────────────────────────────────────────
const _rt = new ModuleRuntime();
for (const m of fw_require) _rt.register(m);
for (const m of modules)    _rt.register(m);
for (const m of extras)     _rt.register(m);
for (const m of bundle)     _rt.register(m);

export const runtime = _rt;

// ── Errors (canonical class identities) ────────────────────────────────────
const _mdErrors = _rt.resolve('mdErrors');
export const { MdError, ParseError, RenderError, ContractError, isMdError } = _mdErrors;

// ── mdCommon — character codes, regex pieces, helpers ──────────────────────
const _mdCommon = _rt.resolve('mdCommon');
export const {
    C_NEWLINE, C_SPACE, C_TAB, C_BANG, C_DOUBLEQUOTE, C_SINGLEQUOTE,
    C_OPEN_PAREN, C_CLOSE_PAREN, C_ASTERISK, C_COLON,
    C_LESSTHAN, C_GREATERTHAN, C_OPEN_BRACKET, C_BACKSLASH,
    C_CLOSE_BRACKET, C_UNDERSCORE, C_BACKTICK, C_AMPERSAND,
    TAGNAME, OPENTAG, CLOSETAG, reHtmlTag,
    ENTITY, ESCAPABLE, unescapeString, normalizeURI,
    escapeXml, escapeHtml, encodeUrl
} = _mdCommon;

// ── AST types / nodes / walker / manipulation ──────────────────────────────
const _mdAstTypes        = _rt.resolve('mdAstTypes');
const _mdNode            = _rt.resolve('mdNode');
const _mdAstWalker       = _rt.resolve('mdAstWalker');
const _mdAstManipulation = _rt.resolve('mdAstManipulation');

export const {
    T_DOCUMENT, T_PARAGRAPH, T_HEADING, T_THEMATIC_BREAK,
    T_CODE_BLOCK, T_HTML_BLOCK, T_BLOCK_QUOTE, T_LIST, T_ITEM,
    T_TABLE, T_TABLE_ROW, T_TABLE_CELL,
    T_TEXT, T_SOFTBREAK, T_LINEBREAK, T_CODE, T_EMPH, T_STRONG,
    T_LINK, T_IMAGE, T_HTML_INLINE, T_STRIKETHROUGH,
    T_MATH_INLINE, T_MATH_BLOCK, T_FOOTNOTE_REF, T_FOOTNOTE_DEF,
    T_ADMONITION, T_HIGHLIGHT, T_SUBSCRIPT, T_SUPERSCRIPT,
    BLOCK_CONTAINERS, INLINE_CONTAINERS, isContainerType
} = _mdAstTypes;
export const { Node, Walker, makeNode } = _mdNode;
export const { walk } = _mdAstWalker;
export const {
    cloneNode, wrapNode, replaceNode, flattenNode, findFirst, findAll
} = _mdAstManipulation;

// ── Renderers ──────────────────────────────────────────────────────────────
export const { renderHtml }     = _rt.resolve('renderHtmlMod');
export const { renderXml }      = _rt.resolve('renderXmlMod');
export const { renderMarkdown } = _rt.resolve('renderMarkdownMod');

// ── md façade + md-walker ──────────────────────────────────────────────────
const _mdSingleton = _rt.resolve('md');
export const md       = _mdSingleton;
export const createMd = _mdSingleton.createMd;

const _mdWalkerSingleton = _rt.resolve('mdWalker');
export const { walk: mdWalk } = _mdWalkerSingleton;

// ── Extras (installable extension instances + helpers) ─────────────────────
export const mdFrontmatter  = _rt.resolve('mdFrontmatter');
export const mdEmoji        = _rt.resolve('mdEmoji');
export const mdMath         = _rt.resolve('mdMath');
export const mdFootnotes    = _rt.resolve('mdFootnotes');
export const mdWikilinks    = _rt.resolve('mdWikilinks');
export const mdAdmonitions  = _rt.resolve('mdAdmonitions');
export const mdHighlight    = _rt.resolve('mdHighlight');
export const mdSubsuper     = _rt.resolve('mdSubsuper');
export const mdToc          = _rt.resolve('mdToc');
export const mdMermaid      = _rt.resolve('mdMermaid');

export const { stripFrontmatter }                                    = mdFrontmatter;
export const { DEFAULT_EMOJI_TABLE, expandEmojiInAst }               = mdEmoji;
export const { splitMath, expandMathInAst, lowerMathToHtml }         = mdMath;
export const { stripFootnoteDefs, expandFootnoteRefs }               = mdFootnotes;
export const { defaultSlugify, expandWikilinksInAst }                = mdWikilinks;
export const { preprocessMkdocsAdmonitions, expandAdmonitionsInAst } = mdAdmonitions;
export const { expandHighlightInAst }                                = mdHighlight;
export const { expandSubSupInAst, lowerSubSupToHtml }               = mdSubsuper;
export const { generate: tocGenerate, collectHeadings, slugify }     = mdToc;
export const { rewriteMermaidHtml }                                  = mdMermaid;

// Original descriptors (for tests that want to register them on their own runtime).
export const mdFrontmatterDesc  = _mdFrontmatterDesc;
export const mdEmojiDesc        = _mdEmojiDesc;
export const mdMathDesc         = _mdMathDesc;
export const mdFootnotesDesc    = _mdFootnotesDesc;
export const mdWikilinksDesc    = _mdWikilinksDesc;
export const mdAdmonitionsDesc  = _mdAdmonitionsDesc;
export const mdHighlightDesc    = _mdHighlightDesc;
export const mdSubsuperDesc     = _mdSubsuperDesc;
export const mdTocDesc          = _mdTocDesc;
export const mdMermaidDesc      = _mdMermaidDesc;
export const mdFullBundle       = _mdFullBundleDesc;

/**
 * Factory that produces a fresh `md` with every opt-in extra installed
 * in canonical order.
 */
export function createMdFull(opts) {
    return createMd(opts)
        .use(mdFrontmatter)
        .use(mdFootnotes)
        .use(mdMath)
        .use(mdSubsuper)
        .use(mdHighlight)
        .use(mdEmoji)
        .use(mdToc)
        .use(mdWikilinks)
        .use(mdAdmonitions)
        .use(mdMermaid);
}

/** Lazily-built singleton — first access materialises a full md. */
let _mdFullSingleton = null;
function _getMdFull() { return _mdFullSingleton || (_mdFullSingleton = createMdFull()); }
export const mdFull = new Proxy({}, {
    get(_t, k) { return _getMdFull()[k]; },
    has(_t, k) { return k in _getMdFull(); },
    ownKeys() { return Reflect.ownKeys(_getMdFull()); },
    getOwnPropertyDescriptor(_t, k) { return Reflect.getOwnPropertyDescriptor(_getMdFull(), k); }
});

// ── Test helpers ────────────────────────────────────────────────────────────

/** Returns a fresh `createMd()` instance. */
export function buildMd(opts) { return createMd(opts); }

/** Returns a fresh `createMdFull()` instance (all extras installed). */
export function buildMdFull(opts) { return createMdFull(opts); }

/**
 * One-shot parse-then-render helper.
 *
 * @param {string} text — Markdown source.
 * @param {'html'|'markdown'|'xml'} format
 * @param {object} [opts] — forwarded to `createMd()`.
 * @returns {string}
 */
export function parseAndRender(text, format, opts) {
    const m = buildMd(opts);
    const ast = m.parse(text);
    if (format === 'html')     return m.render(ast);
    if (format === 'markdown') return m.renderMarkdown(ast);
    if (format === 'xml')      return renderXml(ast);
    throw new TypeError('parseAndRender: unknown format ' + format);
}

/**
 * Structural comparison of two ASTs.
 */
export function expectAstEquivalent(a, b) {
    const sa = serializeForCompare(a);
    const sb = serializeForCompare(b);
    if (sa !== sb) {
        throw new Error('AST mismatch:\n--- a ---\n' + sa + '\n--- b ---\n' + sb);
    }
}

function serializeForCompare(root) {
    const out = [];
    walkNode(root, 0, out);
    return out.join('\n');
}

function walkNode(node, depth, out) {
    if (!node) return;
    const parts = [node.type];
    if (node.literal != null) parts.push('lit=' + JSON.stringify(node.literal));
    if (node.level != null) parts.push('level=' + node.level);
    if (node.info != null && node.info !== '') parts.push('info=' + node.info);
    if (node.destination != null) parts.push('dest=' + node.destination);
    if (node.title) parts.push('title=' + node.title);
    if (node.listType) parts.push('listType=' + node.listType);
    if (node.listTight != null) parts.push('tight=' + node.listTight);
    if (node.listStart != null) parts.push('start=' + node.listStart);
    out.push('  '.repeat(depth) + parts.join(' '));
    let c = node.firstChild;
    while (c) { walkNode(c, depth + 1, out); c = c.next; }
}
