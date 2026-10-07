// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Inline links + images + reference resolution.
 *
 * Strict factory-only. The factory body captures none of the top-level
 * descriptor imports (they feed the generated `deps:` field).
 *
 * @module md/inline/link
 */

import { mdInlineHelpers } from './helpers.js';
import { mdInlineRegex } from './regex.js';
import { mdCommon } from '../common.js';
import { mdNode } from '../ast/node.js';
import { mdAstTypes } from '../ast/types.js';

export const mdInlineLink = {
    name: 'mdInlineLink',
    dependencies: ['mdInlineHelpers', 'mdInlineRegex', 'mdCommon', 'mdNode', 'mdAstTypes'],
    deps: [mdInlineHelpers, mdInlineRegex, mdCommon, mdNode, mdAstTypes],
    factory(helpers, regex, common, nodeApi, astTypes) {
        const { makeText, normalizeReference, fromCodePoint } = helpers;
        const {
            reLinkTitle, reLinkDestinationBraces, reLinkLabel,
            reEscapable, reWhitespaceChar
        } = regex;
        const {
            unescapeString, normalizeURI,
            C_BACKSLASH, C_LESSTHAN, C_OPEN_BRACKET,
            C_OPEN_PAREN, C_CLOSE_PAREN
        } = common;
        const { Node } = nodeApi;
        const { T_LINK, T_IMAGE } = astTypes;

        function installLink(ip) {
            ip.parseLinkTitle = function() {
                const title = this.match(reLinkTitle);
                if (title === null) return null;
                return unescapeString(title.slice(1, -1));
            };

            ip.parseLinkDestination = function() {
                let res = this.match(reLinkDestinationBraces);
                if (res === null) {
                    if (this.peek() === C_LESSTHAN) return null;
                    const savepos = this.pos;
                    let openparens = 0;
                    let c;
                    while ((c = this.peek()) !== -1) {
                        if (c === C_BACKSLASH &&
                            reEscapable.test(this.subject.charAt(this.pos + 1))) {
                            this.pos += 1;
                            if (this.peek() !== -1) this.pos += 1;
                        } else if (c === C_OPEN_PAREN) {
                            this.pos += 1; openparens += 1;
                        } else if (c === C_CLOSE_PAREN) {
                            if (openparens < 1) break;
                            this.pos += 1; openparens -= 1;
                        } else if (reWhitespaceChar.exec(fromCodePoint(c)) !== null) {
                            break;
                        } else {
                            this.pos += 1;
                        }
                    }
                    if (this.pos === savepos && c !== C_CLOSE_PAREN) return null;
                    if (openparens !== 0) return null;
                    res = this.subject.slice(savepos, this.pos);
                    return normalizeURI(unescapeString(res));
                }
                return normalizeURI(unescapeString(res.slice(1, -1)));
            };

            ip.parseLinkLabel = function() {
                const m = this.match(reLinkLabel);
                if (m === null || m.length > 1001) return 0;
                return m.length;
            };

            ip.parseOpenBracket = function(block) {
                const startpos = this.pos;
                this.pos += 1;
                const node = makeText('[');
                block.appendChild(node);
                this.addBracket(node, startpos, false);
                return true;
            };

            ip.parseBang = function(block) {
                const startpos = this.pos;
                this.pos += 1;
                if (this.peek() === C_OPEN_BRACKET) {
                    this.pos += 1;
                    const node = makeText('![');
                    block.appendChild(node);
                    this.addBracket(node, startpos + 1, true);
                } else {
                    block.appendChild(makeText('!'));
                }
                return true;
            };

            ip.parseCloseBracket = function(block) {
                let dest, title;
                let matched = false;
                let reflabel;
                let opener;

                this.pos += 1;
                const startpos = this.pos;

                opener = this.brackets;
                if (opener === null) {
                    block.appendChild(makeText(']'));
                    return true;
                }
                if (!opener.active) {
                    block.appendChild(makeText(']'));
                    this.removeBracket();
                    return true;
                }

                const is_image = opener.image;
                const savepos = this.pos;

                if (this.peek() === C_OPEN_PAREN) {
                    this.pos++;
                    if (this.spnl() &&
                        (dest = this.parseLinkDestination()) !== null &&
                        this.spnl() &&
                        ((reWhitespaceChar.test(this.subject.charAt(this.pos - 1)) &&
                            (title = this.parseLinkTitle())) || true) &&
                        this.spnl() &&
                        this.peek() === C_CLOSE_PAREN) {
                        this.pos += 1;
                        matched = true;
                    } else {
                        this.pos = savepos;
                    }
                }

                if (!matched) {
                    const beforelabel = this.pos;
                    const n = this.parseLinkLabel();
                    if (n > 2) {
                        reflabel = this.subject.slice(beforelabel, beforelabel + n);
                    } else if (!opener.bracketAfter) {
                        reflabel = this.subject.slice(opener.index, startpos);
                    }
                    if (n === 0) this.pos = savepos;

                    if (reflabel) {
                        const link = this.refmap[normalizeReference(reflabel)];
                        if (link) {
                            dest = link.destination;
                            title = link.title;
                            matched = true;
                        }
                    }
                }

                if (matched) {
                    const node = new Node(is_image ? T_IMAGE : T_LINK);
                    node.destination = dest;
                    node.title = title || '';
                    if (this._sp && opener.node.sourcepos) {
                        node.sourcepos = [
                            opener.node.sourcepos[0].slice(),
                            this._sp(Math.max(0, this.pos - 1))
                        ];
                    }

                    let tmp, next;
                    tmp = opener.node.next;
                    while (tmp) {
                        next = tmp.next;
                        tmp.unlink();
                        node.appendChild(tmp);
                        tmp = next;
                    }
                    block.appendChild(node);
                    this.processEmphasis(opener.previousDelimiter);
                    this.removeBracket();
                    opener.node.unlink();

                    if (!is_image) {
                        opener = this.brackets;
                        while (opener !== null) {
                            if (!opener.image) opener.active = false;
                            opener = opener.previous;
                        }
                    }
                    return true;
                } else {
                    this.removeBracket();
                    this.pos = startpos;
                    block.appendChild(makeText(']'));
                    return true;
                }
            };

            ip.addBracket = function(node, index, image) {
                if (this.brackets !== null) this.brackets.bracketAfter = true;
                this.brackets = {
                    node, previous: this.brackets,
                    previousDelimiter: this.delimiters,
                    index, image, active: true
                };
            };

            ip.removeBracket = function() { this.brackets = this.brackets.previous; };
        }

        return { installLink };
    }
};
