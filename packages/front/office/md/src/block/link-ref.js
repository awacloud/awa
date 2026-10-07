// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Link reference definition parsing for the block phase.
 *
 * The CommonMark spec says link reference definitions (`[label]: /url
 * "title"`) must be detected during the block phase — they live at
 * the start of paragraphs and are stripped before inline parsing
 * begins (§4.7). This module ports the minimal subset of the
 * reference inline parser needed for that pass.
 *
 * Plus `removeLinkReferenceDefinitions` — the document-finalize hook
 * that walks the tree and extracts definitions into the parser's
 * `refmap`.
 *
 * Exposed as the `mdBlockLinkRef` factory descriptor. Module-level
 * named exports are materialised once for direct importers.
 *
 * @module md/block/link-ref
 */

import { refsLinkRefs } from '../refs/linkRefs.js';
import { mdAstTypes } from '../ast/types.js';
import { mdCommon } from '../common.js';

export const mdBlockLinkRef = {
    name: 'mdBlockLinkRef',
    dependencies: ['refsLinkRefs', 'mdAstTypes', 'mdCommon'],
    deps: [refsLinkRefs, mdAstTypes, mdCommon],
    factory(linkRefsMod, astTypes, common) {
        const { addLinkRef } = linkRefsMod;
        const { T_PARAGRAPH } = astTypes;
        const { ESCAPABLE, unescapeString, normalizeURI } = common;

        const reWhitespaceChar   = /^[ \t\n\x0b\x0c\x0d]/;
        const reSpaceAtEndOfLine = /^ *(?:\n|$)/;
        const reNonSpace         = /[^ \t\f\v\r\n]/;
        const reEscapable        = new RegExp(ESCAPABLE);

        const C_OPEN_BRACKET = 91;

        function isBlank(s) { return !reNonSpace.test(s); }
        function peek(ln, pos) { return pos < ln.length ? ln.charCodeAt(pos) : -1; }

        /**
         * Tiny stateful cursor used only by `parseReference`.
         */
        class RefCursor {
            constructor(subject) {
                this.subject = subject;
                this.pos     = 0;
                this.label_nest_level = 0;
            }
            peek() {
                return this.pos < this.subject.length
                    ? this.subject.charCodeAt(this.pos)
                    : -1;
            }
            spnl() {
                this.match(/^ *(?:\n *)?/);
                return true;
            }
            match(re) {
                const m = re.exec(this.subject.slice(this.pos));
                if (m === null) return null;
                this.pos += m.index + m[0].length;
                return m[0];
            }
        }

        /** Parse a `[label]` prefix; returns chars consumed (or 0). */
        function parseLinkLabel(cur) {
            const m = cur.match(/^\[(?:[^\\[\]]|\\.){0,1000}\]/);
            if (m === null || m.length > 1001) return 0;
            return m.length;
        }

        /** Parse a link destination; returns normalized URL string or null. */
        function parseLinkDestination(cur) {
            let res = cur.match(/^(?:<(?:[^<>\n\\\x00]|\\.)*>)/);
            if (res !== null) {
                return normalizeURI(unescapeString(res.slice(1, -1)));
            }
            const savepos = cur.pos;
            let openparens = 0;
            let c;
            while ((c = cur.peek()) !== -1) {
                if (c === 92 /* \ */ && cur.subject.charAt(cur.pos + 1) !== ''
                    && reEscapable.test(cur.subject.charAt(cur.pos + 1))) {
                    cur.pos += 1;
                    if (cur.peek() !== -1) cur.pos += 1;
                } else if (c === 40 /* ( */) {
                    cur.pos += 1;
                    openparens += 1;
                } else if (c === 41 /* ) */) {
                    if (openparens < 1) break;
                    cur.pos += 1;
                    openparens -= 1;
                } else if (reWhitespaceChar.exec(String.fromCharCode(c)) !== null) {
                    break;
                } else {
                    cur.pos += 1;
                }
            }
            if (cur.pos === savepos && c !== 41) return null;
            if (openparens !== 0) return null;
            res = cur.subject.slice(savepos, cur.pos);
            return normalizeURI(unescapeString(res));
        }

        /** Parse a link title (quoted or paren-wrapped); returns string or null. */
        function parseLinkTitle(cur) {
            const title = cur.match(
                /^(?:"(\\.|[^"\x00])*"|'(\\.|[^'\x00])*'|\((\\.|[^()\x00])*\))/
            );
            if (title === null) return null;
            return unescapeString(title.slice(1, -1));
        }

        /**
         * Try to parse a link reference definition at the start of `s`.
         */
        function parseReference(s, refmap) {
            const cur = new RefCursor(s);
            const startpos = cur.pos;

            const matchChars = parseLinkLabel(cur);
            if (matchChars === 0) return 0;
            const rawlabel = cur.subject.slice(0, matchChars);

            if (cur.peek() === 58 /* : */) {
                cur.pos += 1;
            } else {
                cur.pos = startpos;
                return 0;
            }

            cur.spnl();
            const dest = parseLinkDestination(cur);
            if (dest === null) {
                cur.pos = startpos;
                return 0;
            }

            const beforetitle = cur.pos;
            cur.spnl();
            let title = null;
            if (cur.pos !== beforetitle) {
                title = parseLinkTitle(cur);
            }
            if (title === null) {
                title = '';
                cur.pos = beforetitle;
            }

            let atLineEnd = true;
            if (cur.match(reSpaceAtEndOfLine) === null) {
                if (title === '') {
                    atLineEnd = false;
                } else {
                    title = '';
                    cur.pos = beforetitle;
                    atLineEnd = cur.match(reSpaceAtEndOfLine) !== null;
                }
            }

            if (!atLineEnd) {
                cur.pos = startpos;
                return 0;
            }

            const normlabel = rawlabel.slice(1, -1);
            if (normlabel.trim() === '' || /^[ \t\n\r]*$/.test(normlabel)) {
                cur.pos = startpos;
                return 0;
            }
            addLinkRef(refmap, normlabel, dest, title);
            return cur.pos - startpos;
        }

        /**
         * Walk the finalized tree and strip leading link reference
         * definitions from every paragraph.
         */
        function removeLinkReferenceDefinitions(parser, tree) {
            const walker = tree.walker();
            const emptyNodes = [];
            let event;

            while ((event = walker.next())) {
                const node = event.node;
                if (event.entering && node.type === T_PARAGRAPH) {
                    let pos;
                    let hasReferenceDefs = false;

                    while (
                        peek(node.stringContent, 0) === C_OPEN_BRACKET &&
                        (pos = parseReference(node.stringContent, parser.refmap))
                    ) {
                        const removedText = node.stringContent.slice(0, pos);
                        node.stringContent = node.stringContent.slice(pos);
                        hasReferenceDefs = true;
                        const lines = removedText.split('\n');
                        node.sourcepos[0][0] += lines.length - 1;
                    }
                    if (hasReferenceDefs && isBlank(node.stringContent)) {
                        emptyNodes.push(node);
                    }
                }
            }
            for (const node of emptyNodes) node.unlink();
        }

        return { parseReference, removeLinkReferenceDefinitions };
    }
};
