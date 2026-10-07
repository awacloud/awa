// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/md/src/main.js
//
// Entry point — re-exports the @awacloud/md module factories. Consumers can
// register them in their own fw `ModuleRuntime` to wire dependency
// injection automatically, or use the generated bundles under
// `dist/standalone/` (framework-free) for zero-runtime-deps consumption.
//
// This file is minimal by design : 4 arrays (`fw_require`, `modules`,
// `extras`, `bundle`) and nothing else. Bootstrap and resolution live in
// `src/bootstrap.js` (`bootstrapMd`) or in the generated `dist/` bundles.

import { htmlEntities } from '@awacloud/fw/io/text/html-entities.js';
import { url }          from '@awacloud/fw/io/codec/url.js';
import { sanitize }     from '@awacloud/fw/dom/rendering/sanitize.js';
import { secPolicy }    from '@awacloud/fw/dom/rendering/secPolicy.js';

// `sanitize` depends on `secPolicy`; both must be registered so the
// runtime can resolve the `md` façade (which lists `sanitize`).
export const fw_require = [secPolicy, sanitize, htmlEntities, url];

import { mdErrors } from './errors.js';
import { mdCommon } from './common.js';
import { mdShared } from './_shared/index.js';
import { mdAstTypes } from './ast/types.js';
import { mdNode } from './ast/node.js';
import { mdAstWalker } from './ast/walker.js';
import { mdAstManipulation } from './ast/manipulation.js';
import { refsLinkRefs } from './refs/linkRefs.js';
import { mdBlockHtmlPatterns } from './block/html-patterns.js';
import { mdBlockLinkRef } from './block/link-ref.js';
import { mdBlockListData } from './block/list-data.js';
import { mdBlockTable } from './block/table.js';
import { mdBlockTaskList } from './block/task-list.js';
import { mdBlockTypes } from './block/block-types.js';
import { mdBlockStarts } from './block/block-starts.js';
import { mdBlockCursor } from './block/cursor.js';
import { blockParser } from './block/parser.js';
import { inlineParser } from './inline/parser.js';
import { inlineParserBuilder } from './inline/parser-builder.js';
import { mdInlineRegex } from './inline/regex.js';
import { mdInlineHelpers } from './inline/helpers.js';
import { mdInlineEscapes } from './inline/escapes.js';
import { mdInlineCodeSpan } from './inline/code-span.js';
import { mdInlineAutolink } from './inline/autolink.js';
import { mdInlineAutolinkExt } from './inline/autolink-ext.js';
import { mdInlineDelimiterStack } from './inline/delimiter-stack.js';
import { mdInlineLink } from './inline/link.js';
import { mdInlineLineBreak } from './inline/line-break.js';
import { mdInlineSourcepos } from './inline/sourcepos.js';
import { renderHtmlMod } from './render/html.js';
import { renderXmlMod } from './render/xml.js';
import { renderMarkdownMod } from './render/markdown.js';
import { mdWalker } from './md-walker.js';
import { mdMod } from './md.js';
import { mdHtmlTheme } from './document/theme.js';
import { mdHtmlDocument } from './document/html-document.js';

/**
 * All @awacloud/md core module factories, in a registration-friendly order
 * (dependencies before their dependents).
 */
export const modules = [
    mdErrors,
    mdCommon,
    mdShared,
    mdAstTypes,
    mdNode,
    mdAstManipulation,
    mdAstWalker,
    refsLinkRefs,
    mdInlineRegex,
    mdInlineHelpers,
    mdInlineEscapes,
    mdInlineCodeSpan,
    mdInlineAutolink,
    mdInlineAutolinkExt,
    mdInlineDelimiterStack,
    mdInlineLink,
    mdInlineLineBreak,
    mdInlineSourcepos,
    mdBlockHtmlPatterns,
    mdBlockLinkRef,
    mdBlockListData,
    mdBlockTable,
    mdBlockTaskList,
    mdBlockTypes,
    mdBlockStarts,
    mdBlockCursor,
    blockParser,
    inlineParser,
    inlineParserBuilder,
    renderHtmlMod,
    renderXmlMod,
    renderMarkdownMod,
    mdWalker,
    mdMod,
    mdHtmlTheme,
    mdHtmlDocument
];

// --- Opt-in extras ---------------------------------------------------------

import { mdFrontmatter }  from './extra/frontmatter.js';
import { mdEmoji }        from './extra/emoji.js';
import { mdMath }         from './extra/math.js';
import { mdFootnotes }    from './extra/footnotes.js';
import { mdWikilinks }    from './extra/wikilinks.js';
import { mdAdmonitions }  from './extra/admonitions.js';
import { mdHighlight }    from './extra/highlight.js';
import { mdSubsuper }     from './extra/subsuper.js';
import { mdToc }          from './extra/toc.js';
import { mdMermaid }      from './extra/mermaid.js';

export const extras = [
    mdFrontmatter, mdEmoji, mdMath, mdFootnotes, mdWikilinks,
    mdAdmonitions, mdHighlight, mdSubsuper, mdToc, mdMermaid
];

// --- Bundles (pure fw factory descriptors) ---------------------------------

import { mdFullBundle } from './bundles/md-full.js';

export const bundle = [mdFullBundle];

// --- Additive named descriptor re-exports (clause vi) ----------------------
//
// Every module descriptor already imported above (the `modules` array, plus
// `mdFullBundle` from `bundle`) is re-exported by its binding name, so sibling
// composers (e.g. `@awacloud/oconv`) can import them via the bare `@awacloud/md`
// specifier. Purely additive: the four arrays above stay byte-unchanged. The
// generated `dist/build/index.js` barrel re-exports this whole namespace.
export {
    mdErrors, mdCommon, mdShared, mdAstTypes, mdNode, mdAstManipulation,
    mdAstWalker, refsLinkRefs, mdInlineRegex, mdInlineHelpers, mdInlineEscapes,
    mdInlineCodeSpan, mdInlineAutolink, mdInlineAutolinkExt, mdInlineDelimiterStack,
    mdInlineLink, mdInlineLineBreak, mdInlineSourcepos, mdBlockHtmlPatterns,
    mdBlockLinkRef, mdBlockListData, mdBlockTable, mdBlockTaskList, mdBlockTypes,
    mdBlockStarts, mdBlockCursor, blockParser, inlineParser, inlineParserBuilder,
    renderHtmlMod, renderXmlMod, renderMarkdownMod, mdWalker, mdMod, mdHtmlTheme,
    mdHtmlDocument, mdFullBundle
};
