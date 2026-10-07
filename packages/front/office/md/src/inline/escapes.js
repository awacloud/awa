// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Backslash escapes and HTML entity decoding.
 *
 * Installs `parseBackslash(block)` and `parseEntity(block)` on the
 * inline-parser cursor `ip`. CommonMark §6.2 + §6.3.
 *
 * Strict factory-only. The factory body captures none of the top-level
 * descriptor imports (they feed the generated `deps:` field).
 *
 * @module md/inline/escapes
 */

import { mdInlineHelpers } from './helpers.js';
import { mdInlineRegex } from './regex.js';
import { mdCommon } from '../common.js';
import { mdNode } from '../ast/node.js';
import { mdAstTypes } from '../ast/types.js';
import { htmlEntities } from '@awacloud/fw/io/text/html-entities.js';

export const mdInlineEscapes = {
    name: 'mdInlineEscapes',
    dependencies: ['mdInlineHelpers', 'mdInlineRegex', 'mdCommon', 'mdNode', 'mdAstTypes', 'htmlEntities'],
    deps: [mdInlineHelpers, mdInlineRegex, mdCommon, mdNode, mdAstTypes, htmlEntities],
    factory(helpers, regex, common, nodeApi, astTypes, htmlEntitiesMod) {
        const { decodeHtmlStrict: decodeHTMLStrict } = htmlEntitiesMod;
        const { makeText } = helpers;
        const { reEscapable, reEntityHere } = regex;
        const { C_NEWLINE } = common;
        const { Node } = nodeApi;
        const { T_LINEBREAK } = astTypes;

        /** Install `parseBackslash` + `parseEntity` on `ip`. */
        function installEscapes(ip) {
            ip.parseBackslash = function(block) {
                const subj = this.subject;
                this.pos += 1;
                if (this.peek() === C_NEWLINE) {
                    this.pos += 1;
                    block.appendChild(new Node(T_LINEBREAK));
                } else if (reEscapable.test(subj.charAt(this.pos))) {
                    block.appendChild(makeText(subj.charAt(this.pos)));
                    this.pos += 1;
                } else {
                    block.appendChild(makeText('\\'));
                }
                return true;
            };

            ip.parseEntity = function(block) {
                let m;
                if ((m = this.match(reEntityHere))) {
                    block.appendChild(makeText(decodeHTMLStrict(m)));
                    return true;
                }
                return false;
            };
        }

        return { installEscapes };
    }
};
