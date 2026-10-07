// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Regex / constants used by the inline parser.
 *
 * Extracted from `./parser.js` for readability. These are pure
 * module-level constants — no mutable state — so they are
 * worker-safe to share.
 *
 * Strict factory-only. The factory body captures none of the top-level
 * descriptor imports (they feed the generated `deps:` field).
 *
 * @module md/inline/regex
 */

import { mdCommon } from '../common.js';

export const mdInlineRegex = {
    name: 'mdInlineRegex',
    dependencies: ['mdCommon'],
    deps: [mdCommon],
    factory(common) {
        const { ESCAPABLE, ENTITY } = common;
        const C_TILDE = 126;

        const ESCAPED_CHAR = '\\\\' + ESCAPABLE;

        const rePunctuation = new RegExp(
            /^[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~\p{P}\p{S}]/u);

        const reLinkTitle = new RegExp(
            '^(?:"(' + ESCAPED_CHAR + '|\\\\[^\\\\]|[^\\\\"\\x00])*"' +
            "|'(" + ESCAPED_CHAR + '|\\\\[^\\\\]|[^\\\\\'\\x00])*\'' +
            '|\\((' + ESCAPED_CHAR + '|\\\\[^\\\\]|[^\\\\()\\x00])*\\))'
        );

        const reLinkDestinationBraces = /^(?:<(?:[^<>\n\\\x00]|\\.)*>)/;
        const reEscapable             = new RegExp('^' + ESCAPABLE);
        const reEntityHere            = new RegExp('^' + ENTITY, 'i');
        const reTicks                 = /`+/;
        const reTicksHere             = /^`+/;
        const reEmailAutolink         = /^<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/;
        const reAutolink              = /^<[A-Za-z][A-Za-z0-9.+-]{1,31}:[^<>\x00-\x20]*>/i;
        const reSpnl                  = /^ *(?:\n *)?/;
        const reWhitespaceChar        = /^[ \t\n\x0b\x0c\x0d]/;
        const reUnicodeWhitespaceChar = /^\s/;
        const reFinalSpace            = / *$/;
        const reInitialSpace          = /^ */;
        const reSpaceAtEndOfLine      = /^ *(?:\n|$)/;
        const reLinkLabel             = /^\[(?:[^\\[\]]|\\.){0,1000}\]/s;
        const reMain                  = /^[^\n`[\]\\!<&*_'"~]+/m;

        // GFM extended autolink regexes. NOTE: these carry `lastIndex` state
        // across exec() calls; each consumer MUST reset `.lastIndex = 0`
        // before use (done in `scanExtAutolinks`). They are stateless in
        // every other sense.
        const reExtAutolinkUrl   = /(?:^|[\s*_~(])((?:https?:\/\/|ftp:\/\/)[^\s<]+)/gi;
        const reExtAutolinkWww   = /(?:^|[\s*_~(])(www\.[^\s<]+)/gi;
        const reExtAutolinkEmail = /(?:^|[\s*_~(<])([a-zA-Z0-9._+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+)/g;

        // Worker-safe marker: a real `function` declaration keeps the
        // keyword literal in `factory.toString()` after minification.
        function _isTildeCode(c) { return c === C_TILDE; }

        return {
            C_TILDE, ESCAPED_CHAR,
            rePunctuation, reLinkTitle, reLinkDestinationBraces,
            reEscapable, reEntityHere, reTicks, reTicksHere,
            reEmailAutolink, reAutolink, reSpnl,
            reWhitespaceChar, reUnicodeWhitespaceChar,
            reFinalSpace, reInitialSpace, reSpaceAtEndOfLine,
            reLinkLabel, reMain,
            reExtAutolinkUrl, reExtAutolinkWww, reExtAutolinkEmail,
            _isTildeCode
        };
    }
};
