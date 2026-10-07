// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview GFM extended autolinks — post-pass over inline trees.
 *
 * Strict factory-only. The factory body captures none of the top-level
 * descriptor imports (they feed the generated `deps:` field).
 *
 * @module md/inline/autolink-ext
 */

import { mdInlineHelpers } from './helpers.js';
import { mdInlineRegex } from './regex.js';
import { mdCommon } from '../common.js';
import { mdNode } from '../ast/node.js';
import { mdAstTypes } from '../ast/types.js';

export const mdInlineAutolinkExt = {
    name: 'mdInlineAutolinkExt',
    dependencies: ['mdInlineHelpers', 'mdInlineRegex', 'mdCommon', 'mdNode', 'mdAstTypes'],
    deps: [mdInlineHelpers, mdInlineRegex, mdCommon, mdNode, mdAstTypes],
    factory(helpers, regex, common, nodeApi, astTypes) {
        const { makeText } = helpers;
        const { reExtAutolinkUrl, reExtAutolinkWww, reExtAutolinkEmail } = regex;
        const { normalizeURI } = common;
        const { Node } = nodeApi;
        const { T_TEXT, T_LINK, T_IMAGE } = astTypes;

        /** Trim trailing punctuation per GFM §6.9. */
        function trimTrailingPunct(s) {
            while (s.length > 0 && /[?!.,:*_~]$/.test(s)) s = s.slice(0, -1);
            while (s.length > 0 && s.endsWith(')')) {
                const opens = (s.match(/\(/g) || []).length;
                const closes = (s.match(/\)/g) || []).length;
                if (closes > opens) s = s.slice(0, -1); else break;
            }
            s = s.replace(/&[a-zA-Z0-9]+;$/, '');
            return s;
        }

        function scanExtAutolinks(text) {
            const matches = [];
            let m;
            reExtAutolinkUrl.lastIndex = 0;
            while ((m = reExtAutolinkUrl.exec(text)) !== null) {
                let url = m[1];
                const trimmed = trimTrailingPunct(url);
                if (trimmed.length === 0) continue;
                const start = m.index + m[0].indexOf(m[1]);
                matches.push({ start, end: start + trimmed.length, url: trimmed, isEmail: false, isWww: false });
            }
            reExtAutolinkWww.lastIndex = 0;
            while ((m = reExtAutolinkWww.exec(text)) !== null) {
                let url = m[1];
                const trimmed = trimTrailingPunct(url);
                if (trimmed.length === 0) continue;
                if (!/^www\.[^\s.]+\.[^\s]/.test(trimmed)) continue;
                const start = m.index + m[0].indexOf(m[1]);
                matches.push({ start, end: start + trimmed.length, url: trimmed, isEmail: false, isWww: true });
            }
            reExtAutolinkEmail.lastIndex = 0;
            while ((m = reExtAutolinkEmail.exec(text)) !== null) {
                let email = m[1];
                while (email.length > 0 && /[?!.,:_*~-]$/.test(email)) email = email.slice(0, -1);
                if (!/@.+\..+/.test(email)) continue;
                const start = m.index + m[0].indexOf(m[1]);
                matches.push({ start, end: start + email.length, url: email, isEmail: true, isWww: false });
            }
            matches.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
            const final = [];
            let lastEnd = -1;
            for (const m2 of matches) {
                if (m2.start < lastEnd) continue;
                final.push(m2);
                lastEnd = m2.end;
            }
            return final;
        }

        function processExtendedAutolinks(root) {
            const containers = [];
            const w = root.walker();
            let event;
            while ((event = w.next())) {
                if (!event.entering) continue;
                const n = event.node;
                if (n.type === T_LINK || n.type === T_IMAGE) {
                    w.resumeAt(n, false);
                    continue;
                }
                if (n.firstChild) containers.push(n);
            }
            for (const container of containers) {
                let cursor = container.firstChild;
                while (cursor) {
                    if (cursor.type !== T_TEXT) { cursor = cursor.next; continue; }
                    const run = [cursor];
                    let scan = cursor.next;
                    while (scan && scan.type === T_TEXT) { run.push(scan); scan = scan.next; }
                    const combined = run.map(n => n.literal || '').join('');
                    const matches = combined.indexOf('http') >= 0 ||
                                    combined.indexOf('ftp') >= 0 ||
                                    combined.indexOf('www.') >= 0 ||
                                    combined.indexOf('@') >= 0
                        ? scanExtAutolinks(combined)
                        : [];
                    if (matches.length === 0) { cursor = scan; continue; }
                    const newNodes = [];
                    let pos = 0;
                    for (const m of matches) {
                        if (m.start > pos) newNodes.push(makeText(combined.slice(pos, m.start)));
                        const link = new Node(T_LINK);
                        let dest = m.url;
                        if (m.isEmail) dest = 'mailto:' + dest;
                        else if (m.isWww) dest = 'http://' + dest;
                        link.destination = normalizeURI(dest);
                        link.title = '';
                        link.appendChild(makeText(m.url));
                        newNodes.push(link);
                        pos = m.end;
                    }
                    if (pos < combined.length) newNodes.push(makeText(combined.slice(pos)));
                    let anchor = run[0];
                    anchor.literal = '';
                    for (const nn of newNodes) { anchor.insertAfter(nn); anchor = nn; }
                    for (const old of run) old.unlink();
                    cursor = scan;
                }
            }
        }

        return { trimTrailingPunct, scanExtAutolinks, processExtendedAutolinks };
    }
};
