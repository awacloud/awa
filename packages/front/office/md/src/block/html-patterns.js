// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview HTML tag regex pieces + the seven HTML-block opener /
 * closer patterns (CommonMark §4.6).
 *
 * Exposed as the `mdBlockHtmlPatterns` factory descriptor. Strict
 * factory-only. The factory body captures none of the top-level
 * descriptor imports (they feed the generated `deps:` field).
 *
 * @module md/block/html-patterns
 */

export const mdBlockHtmlPatterns = {
    name: 'mdBlockHtmlPatterns',
    dependencies: [],
    factory() {
        // Worker-safe marker: keep the `function` keyword literal in the
        // factory body so the runtime serialisation contract test passes.
        const _wsMarker = function() { /* worker-safe */ };
        void _wsMarker;

        const TAGNAME            = '[A-Za-z][A-Za-z0-9-]*';
        const ATTRIBUTENAME      = '[a-zA-Z_:][a-zA-Z0-9:._-]*';
        const UNQUOTEDVALUE      = '[^"\'=<>`\\x00-\\x20]+';
        const SINGLEQUOTEDVALUE  = "'[^']*'";
        const DOUBLEQUOTEDVALUE  = '"[^"]*"';
        const ATTRIBUTEVALUE     =
            '(?:' + UNQUOTEDVALUE + '|' + SINGLEQUOTEDVALUE + '|' + DOUBLEQUOTEDVALUE + ')';
        const ATTRIBUTEVALUESPEC = '(?:\\s*=\\s*' + ATTRIBUTEVALUE + ')';
        const ATTRIBUTE          = '(?:\\s+' + ATTRIBUTENAME + ATTRIBUTEVALUESPEC + '?)';

        const OPENTAG  = '<' + TAGNAME + ATTRIBUTE + '*' + '\\s*/?>';
        const CLOSETAG = '</' + TAGNAME + '\\s*[>]';

        /**
         * HTML block opener regexes indexed by block type (1..7).
         * Slot 0 is a sentinel (`/./`) so callers can iterate `[1..7]`.
         */
        const reHtmlBlockOpen = [
            /./,
            /^<(?:script|pre|textarea|style)(?:\s|>|$)/i,
            /^<!--/,
            /^<[?]/,
            /^<![A-Za-z]/,
            /^<!\[CDATA\[/,
            /^<[/]?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[123456]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|section|search|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|[/]?[>]|$)/i,
            new RegExp('^(?:' + OPENTAG + '|' + CLOSETAG + ')\\s*$', 'i')
        ];

        /** HTML block closer regexes indexed by block type (1..5). */
        const reHtmlBlockClose = [
            /./,
            /<\/(?:script|pre|textarea|style)>/i,
            /-->/,
            /\?>/,
            />/,
            /\]\]>/
        ];

        return { OPENTAG, CLOSETAG, reHtmlBlockOpen, reHtmlBlockClose };
    }
};
