// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Delimiter stack — scan flanking delims, handle them,
 * and the `processEmphasis` algorithm (CommonMark §6.4).
 *
 * Strict factory-only. The factory body captures none of the top-level
 * descriptor imports (they feed the generated `deps:` field).
 *
 * @module md/inline/delimiter-stack
 */

import { mdInlineHelpers } from './helpers.js';
import { mdInlineRegex } from './regex.js';
import { mdCommon } from '../common.js';
import { mdNode } from '../ast/node.js';
import { mdAstTypes } from '../ast/types.js';

export const mdInlineDelimiterStack = {
    name: 'mdInlineDelimiterStack',
    dependencies: ['mdInlineHelpers', 'mdInlineRegex', 'mdCommon', 'mdNode', 'mdAstTypes'],
    deps: [mdInlineHelpers, mdInlineRegex, mdCommon, mdNode, mdAstTypes],
    factory(helpers, regex, common, nodeApi, astTypes) {
        const { makeText, fromCodePoint } = helpers;
        const { C_TILDE, rePunctuation, reUnicodeWhitespaceChar } = regex;
        const {
            C_ASTERISK, C_UNDERSCORE, C_SINGLEQUOTE, C_DOUBLEQUOTE
        } = common;
        const { Node } = nodeApi;
        const { T_EMPH, T_STRONG, T_STRIKETHROUGH } = astTypes;

        function removeDelimitersBetween(bottom, top) {
            if (bottom.next !== top) {
                bottom.next = top;
                top.previous = bottom;
            }
        }

        function previousChar(str, pos) {
            if (pos === 0) return '\n';
            const previous_cc = str.charCodeAt(pos - 1);
            if ((previous_cc & 0xfc00) !== 0xdc00) return str.charAt(pos - 1);
            const two_previous_cc = str.charCodeAt(pos - 2);
            if ((two_previous_cc & 0xfc00) !== 0xd800) return str.charAt(pos - 1);
            return str.slice(pos - 2, pos);
        }

        function installDelimiterStack(ip) {
            ip.scanDelims = function(cc) {
                let numdelims = 0;
                const startpos = this.pos;

                if (cc === C_SINGLEQUOTE || cc === C_DOUBLEQUOTE) {
                    numdelims++;
                    this.pos++;
                } else {
                    while (this.peek() === cc) {
                        numdelims++;
                        this.pos++;
                    }
                }
                if (numdelims === 0) return null;

                const char_before = previousChar(this.subject, startpos);
                const cc_after = this.peek();
                const char_after = cc_after === -1 ? '\n' : fromCodePoint(cc_after);

                const after_is_whitespace   = reUnicodeWhitespaceChar.test(char_after);
                const after_is_punctuation  = rePunctuation.test(char_after);
                const before_is_whitespace  = reUnicodeWhitespaceChar.test(char_before);
                const before_is_punctuation = rePunctuation.test(char_before);

                const left_flanking  =
                    !after_is_whitespace &&
                    (!after_is_punctuation || before_is_whitespace || before_is_punctuation);
                const right_flanking =
                    !before_is_whitespace &&
                    (!before_is_punctuation || after_is_whitespace || after_is_punctuation);

                let can_open, can_close;
                if (cc === C_UNDERSCORE) {
                    can_open  = left_flanking && (!right_flanking || before_is_punctuation);
                    can_close = right_flanking && (!left_flanking || after_is_punctuation);
                } else if (cc === C_SINGLEQUOTE || cc === C_DOUBLEQUOTE) {
                    can_open  = left_flanking && (!right_flanking || before_is_punctuation);
                    can_close = right_flanking;
                } else {
                    can_open  = left_flanking;
                    can_close = right_flanking;
                }
                this.pos = startpos;
                return { numdelims, can_open, can_close };
            };

            ip.handleDelim = function(cc, block) {
                const res = this.scanDelims(cc);
                if (!res) return false;
                const numdelims = res.numdelims;
                const startpos = this.pos;
                let contents;

                this.pos += numdelims;
                if (cc === C_SINGLEQUOTE) {
                    contents = '’';
                } else if (cc === C_DOUBLEQUOTE) {
                    contents = '“';
                } else {
                    contents = this.subject.slice(startpos, this.pos);
                }
                const node = makeText(contents);
                block.appendChild(node);

                if ((res.can_open || res.can_close) &&
                    (this.options.smart || (cc !== C_SINGLEQUOTE && cc !== C_DOUBLEQUOTE))) {
                    this.delimiters = {
                        cc,
                        numdelims,
                        origdelims: numdelims,
                        node,
                        previous: this.delimiters,
                        next: null,
                        can_open: res.can_open,
                        can_close: res.can_close
                    };
                    if (this.delimiters.previous !== null) {
                        this.delimiters.previous.next = this.delimiters;
                    }
                }
                return true;
            };

            ip.removeDelimiter = function(delim) {
                if (delim.previous !== null) delim.previous.next = delim.next;
                if (delim.next === null) this.delimiters = delim.previous;
                else delim.next.previous = delim.previous;
            };

            ip.processEmphasis = function(stack_bottom) {
                let opener, closer, old_closer;
                let opener_inl, closer_inl;
                let tempstack;
                let use_delims;
                let tmp, next;
                let opener_found;
                const openers_bottom = [];
                let openers_bottom_index;
                let odd_match;

                for (let i = 0; i < 15; i++) openers_bottom[i] = stack_bottom;

                closer = this.delimiters;
                while (closer !== null && closer.previous !== stack_bottom) {
                    closer = closer.previous;
                }

                while (closer !== null) {
                    const closercc = closer.cc;
                    if (!closer.can_close) {
                        closer = closer.next;
                    } else {
                        opener = closer.previous;
                        opener_found = false;
                        switch (closercc) {
                            case C_SINGLEQUOTE: openers_bottom_index = 0; break;
                            case C_DOUBLEQUOTE: openers_bottom_index = 1; break;
                            case C_UNDERSCORE:
                                openers_bottom_index = 2 + (closer.can_open ? 3 : 0)
                                    + (closer.origdelims % 3);
                                break;
                            case C_ASTERISK:
                                openers_bottom_index = 8 + (closer.can_open ? 3 : 0)
                                    + (closer.origdelims % 3);
                                break;
                            case C_TILDE:
                                openers_bottom_index = 13;
                                break;
                        }
                        while (opener !== null &&
                            opener !== stack_bottom &&
                            opener !== openers_bottom[openers_bottom_index]) {
                            odd_match =
                                (closer.can_open || opener.can_close) &&
                                closer.origdelims % 3 !== 0 &&
                                (opener.origdelims + closer.origdelims) % 3 === 0;
                            if (opener.cc === closer.cc && opener.can_open && !odd_match) {
                                opener_found = true;
                                break;
                            }
                            opener = opener.previous;
                        }
                        old_closer = closer;

                        if (closercc === C_ASTERISK || closercc === C_UNDERSCORE || closercc === C_TILDE) {
                            if (!opener_found) {
                                closer = closer.next;
                            } else if (closercc === C_TILDE &&
                                       (opener.numdelims > 2 || closer.numdelims > 2 ||
                                        opener.numdelims !== closer.numdelims)) {
                                closer = closer.next;
                            } else {
                                let nodeType;
                                if (closercc === C_TILDE) {
                                    use_delims = opener.numdelims;
                                    nodeType = T_STRIKETHROUGH;
                                } else {
                                    use_delims =
                                        closer.numdelims >= 2 && opener.numdelims >= 2 ? 2 : 1;
                                    nodeType = use_delims === 1 ? T_EMPH : T_STRONG;
                                }
                                opener_inl = opener.node;
                                closer_inl = closer.node;

                                opener.numdelims -= use_delims;
                                closer.numdelims -= use_delims;
                                opener_inl.literal = opener_inl.literal.slice(
                                    0, opener_inl.literal.length - use_delims);
                                closer_inl.literal = closer_inl.literal.slice(
                                    0, closer_inl.literal.length - use_delims);

                                const emph = new Node(nodeType);
                                // The tilde run length (1 or 2) is kept so a consumer can tell
                                // `~x~` from `~~x~~`; renderers ignore it.
                                if (nodeType === T_STRIKETHROUGH) emph.delimiterCount = use_delims;
                                if (this._sp && opener_inl.sourcepos && closer_inl.sourcepos) {
                                    emph.sourcepos = [
                                        opener_inl.sourcepos[0].slice(),
                                        closer_inl.sourcepos[1].slice()
                                    ];
                                }

                                tmp = opener_inl.next;
                                while (tmp && tmp !== closer_inl) {
                                    next = tmp.next;
                                    tmp.unlink();
                                    emph.appendChild(tmp);
                                    tmp = next;
                                }
                                opener_inl.insertAfter(emph);

                                removeDelimitersBetween(opener, closer);

                                if (opener.numdelims === 0) {
                                    opener_inl.unlink();
                                    this.removeDelimiter(opener);
                                }
                                if (closer.numdelims === 0) {
                                    closer_inl.unlink();
                                    tempstack = closer.next;
                                    this.removeDelimiter(closer);
                                    closer = tempstack;
                                }
                            }
                        } else if (closercc === C_SINGLEQUOTE) {
                            closer.node.literal = '’';
                            if (opener_found) opener.node.literal = '‘';
                            closer = closer.next;
                        } else if (closercc === C_DOUBLEQUOTE) {
                            closer.node.literal = '”';
                            if (opener_found) opener.node.literal = '“';
                            closer = closer.next;
                        }
                        if (!opener_found) {
                            openers_bottom[openers_bottom_index] = old_closer.previous;
                            if (!old_closer.can_open) {
                                this.removeDelimiter(old_closer);
                            }
                        }
                    }
                }

                while (this.delimiters !== null && this.delimiters !== stack_bottom) {
                    this.removeDelimiter(this.delimiters);
                }
            };
        }

        return { installDelimiterStack };
    }
};
