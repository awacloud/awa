// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview CommonMark 0.31 inline-phase parser (orchestrator).
 *
 * Ported from `commonmark.js` (BSD-2) `lib/inlines.js`. Adapted to
 * use our `Node` class with public unprefixed slots, our type
 * constants from `../ast/types.js`, and our `linkRefs` helpers.
 *
 * Logic is split across sibling sub-modules, each now a factory
 * descriptor in its own right; this file ties them together into a
 * per-call stateful cursor (`createInlineParser`) and exposes the
 * worker-safe factory.
 *
 *   - `mdInlineRegex`            — pure regex / constant definitions
 *   - `mdInlineHelpers`          — makeText / fromCodePoint / normalizeReference / trim
 *   - `mdInlineEscapes`          — `parseBackslash` + `parseEntity`
 *   - `mdInlineCodeSpan`         — `parseBackticks`
 *   - `mdInlineAutolink`         — `parseAutolink` + `parseHtmlTag`
 *   - `mdInlineAutolinkExt`      — GFM extended autolinks post-pass
 *   - `mdInlineDelimiterStack`   — `scanDelims` + `handleDelim` + `processEmphasis`
 *   - `mdInlineLink`             — links + images + reference resolution
 *   - `mdInlineLineBreak`        — `parseNewline` + `parseString` text fallback
 *   - `mdInlineSourcepos`        — backfill sourcepos post-pass
 *
 * Exposed as a module factory : `inlineParser.factory().parse(block, refmap)`.
 *
 * @module md/inline/parser
 */

/**
 * Module factory — exposes the inline parser as `{ parse(block, refmap) }`.
 *
 * Strict factory-only : all 12 declared dependencies must be injected
 * by the caller (typically `main.js`'s `ModuleRuntime`). No top-level
 * imports, no top-level materialisation. The trailing `options`
 * positional argument carries per-call parser options
 * (`extendedAutolinks`, `sourcepos`, `smart`).
 *
 * Worker-safe : **full**. The factory body closes only over its
 * declared parameters.
 */
import { mdErrors } from '../errors.js';
import { mdCommon } from '../common.js';
import { mdInlineRegex } from './regex.js';
import { mdInlineHelpers } from './helpers.js';
import { mdInlineEscapes } from './escapes.js';
import { mdInlineCodeSpan } from './code-span.js';
import { mdInlineAutolink } from './autolink.js';
import { mdInlineAutolinkExt } from './autolink-ext.js';
import { mdInlineDelimiterStack } from './delimiter-stack.js';
import { mdInlineLink } from './link.js';
import { mdInlineLineBreak } from './line-break.js';
import { mdInlineSourcepos } from './sourcepos.js';

export const inlineParser = {
    name: 'inlineParser',
    dependencies: [
        'mdErrors',
        'mdCommon',
        'mdInlineRegex',
        'mdInlineHelpers',
        'mdInlineEscapes',
        'mdInlineCodeSpan',
        'mdInlineAutolink',
        'mdInlineAutolinkExt',
        'mdInlineDelimiterStack',
        'mdInlineLink',
        'mdInlineLineBreak',
        'mdInlineSourcepos'
    ],
    deps: [mdErrors, mdCommon, mdInlineRegex, mdInlineHelpers, mdInlineEscapes, mdInlineCodeSpan, mdInlineAutolink, mdInlineAutolinkExt, mdInlineDelimiterStack, mdInlineLink, mdInlineLineBreak, mdInlineSourcepos],
    factory(
        errors,
        common,
        regex,
        helpers,
        escapes,
        codeSpan,
        autolink,
        autolinkExt,
        delimiterStack,
        link,
        lineBreak,
        sourcepos,
        options
    ) {
        void errors; // injected for identity consistency at boundaries

        const {
            C_NEWLINE, C_ASTERISK, C_UNDERSCORE, C_BACKTICK, C_OPEN_BRACKET,
            C_CLOSE_BRACKET, C_LESSTHAN, C_BANG, C_BACKSLASH, C_AMPERSAND,
            C_SINGLEQUOTE, C_DOUBLEQUOTE
        } = common;

        const { C_TILDE, reSpnl } = regex;
        const { makeText, fromCodePoint, trim, isSpace } = helpers;
        const { installEscapes }        = escapes;
        const { installCodeSpan }       = codeSpan;
        const { installAutolink }       = autolink;
        const { installDelimiterStack } = delimiterStack;
        const { installLink }           = link;
        const { installLineBreak }      = lineBreak;
        const { processExtendedAutolinks } = autolinkExt;
        const { backfillSourcepos }     = sourcepos;

        function createInlineParser(opts) {
            const ip = {
                subject: '',
                pos: 0,
                delimiters: null,
                brackets: null,
                refmap: {},
                options: opts || {}
            };

            ip.match = function(re) {
                const m = re.exec(this.subject.slice(this.pos));
                if (m === null) return null;
                this.pos += m.index + m[0].length;
                return m[0];
            };

            ip.peek = function() {
                if (this.pos < this.subject.length) {
                    return this.subject.codePointAt(this.pos);
                }
                return -1;
            };

            ip.spnl = function() { this.match(reSpnl); return true; };

            installEscapes(ip);
            installCodeSpan(ip);
            installAutolink(ip);
            installDelimiterStack(ip);
            installLink(ip);
            installLineBreak(ip);

            ip.parseInline = function(block) {
                let res;
                const c = this.peek();
                if (c === -1) return false;
                switch (c) {
                    case C_NEWLINE:       res = this.parseNewline(block); break;
                    case C_BACKSLASH:     res = this.parseBackslash(block); break;
                    case C_BACKTICK:      res = this.parseBackticks(block); break;
                    case C_ASTERISK:
                    case C_UNDERSCORE:    res = this.handleDelim(c, block); break;
                    case C_TILDE:         res = this.handleDelim(c, block); break;
                    case C_SINGLEQUOTE:
                    case C_DOUBLEQUOTE:
                        res = this.options.smart && this.handleDelim(c, block);
                        break;
                    case C_OPEN_BRACKET:  res = this.parseOpenBracket(block); break;
                    case C_BANG:          res = this.parseBang(block); break;
                    case C_CLOSE_BRACKET: res = this.parseCloseBracket(block); break;
                    case C_LESSTHAN:
                        res = this.parseAutolink(block) || this.parseHtmlTag(block);
                        break;
                    case C_AMPERSAND:     res = this.parseEntity(block); break;
                    default:              res = this.parseString(block); break;
                }
                if (!res) {
                    this.pos += 1;
                    block.appendChild(makeText(fromCodePoint(c)));
                }
                return true;
            };

            ip.parse = function(block, refmap) {
                const raw = block.stringContent || '';
                this.subject = trim(raw);
                let leadTrim = 0;
                while (leadTrim < raw.length && isSpace(raw.charCodeAt(leadTrim))) leadTrim++;
                this.pos = 0;
                this.delimiters = null;
                this.brackets = null;
                if (refmap) this.refmap = refmap;

                const wantSourcepos = !!this.options.sourcepos;
                if (wantSourcepos) {
                    let baseLine = 1, baseCol = 1;
                    if (block.sourcepos) {
                        baseLine = block.sourcepos[0][0];
                        baseCol  = block.sourcepos[0][1];
                    }
                    const lineStarts = [0];
                    for (let i = 0; i < this.subject.length; i++) {
                        if (this.subject.charCodeAt(i) === 10) lineStarts.push(i + 1);
                    }
                    this._sp = (p) => {
                        if (p < 0) p = 0;
                        if (p > this.subject.length) p = this.subject.length;
                        let lo = 0, hi = lineStarts.length - 1;
                        while (lo < hi) {
                            const mid = (lo + hi + 1) >> 1;
                            if (lineStarts[mid] <= p) lo = mid; else hi = mid - 1;
                        }
                        const lineIdx = lo;
                        const col = p - lineStarts[lineIdx];
                        if (lineIdx === 0) {
                            return [baseLine, baseCol + leadTrim + col];
                        }
                        return [baseLine + lineIdx, 1 + col];
                    };
                } else {
                    this._sp = null;
                }

                while (block.firstChild) block.firstChild.unlink();

                if (wantSourcepos) {
                    while (true) {
                        const posBefore = this.pos;
                        const beforeLast = block.lastChild;
                        const ok = this.parseInline(block);
                        if (!ok) break;
                        const posAfterIncl = Math.max(posBefore, this.pos - 1);
                        let c = beforeLast ? beforeLast.next : block.firstChild;
                        while (c) {
                            if (!c.sourcepos) {
                                c.sourcepos = [this._sp(posBefore), this._sp(posAfterIncl)];
                            }
                            c = c.next;
                        }
                    }
                } else {
                    while (this.parseInline(block)) { /* loop */ }
                }
                block.stringContent = null;
                this.processEmphasis(null);
                if (this.options.extendedAutolinks !== false) {
                    processExtendedAutolinks(block);
                }
                if (wantSourcepos) {
                    backfillSourcepos(block);
                }
            };

            return ip;
        }

        const ip = createInlineParser(options);
        function parse(block, refmap) { ip.parse(block, refmap); }
        return { parse };
    }
};

export default inlineParser;
