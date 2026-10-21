// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Raw OpenDocument text elements (`text:p`, `text:h`,
 * `text:span`, `text:a`, `text:list`, `text:s`, `text:tab`,
 * `text:line-break`) to DOM — for the places where `@awacloud/odf` keeps
 * text as element nodes (presentation text boxes, shapes, spreadsheet
 * cells). Styling goes through the same cascade as the ODT painter.
 *
 * @module viewer/render/odf-text
 */
import { h } from './dom.js';
import { applyCss, paragraphCss, textCss } from './odf-style.js';

/** ODF `style:num-format` → CSS `list-style-type`. */
const LIST_TYPES = Object.freeze({ 1: 'decimal', a: 'lower-alpha', A: 'upper-alpha', i: 'lower-roman', I: 'upper-roman' });

/**
 * @param {any[]} nodes raw children
 * @param {{styles: ReturnType<import('./odf-style.js').createOdfStyles>, listStyles?: Map<string, any>}} env
 * @param {number} [depth] list depth (1-based) for nested lists
 * @param {string|null} [listStyle] inherited list style name
 * @returns {Node[]}
 */
export function odfNodes(nodes, env, depth = 1, listStyle = null) {
    const face = (n) => env.styles.face(n);
    /** @type {Node[]} */
    const out = [];
    for (const n of nodes || []) {
        if (n.type === 'text') { out.push(document.createTextNode(n.value || '')); continue; }
        const a = n.attrs || {};
        switch (n.name) {
            case 'text:p': case 'text:h': {
                const st = env.styles.resolve(a['text:style-name'], 'paragraph');
                const p = h('p', { class: 'awv-p' });
                applyCss(p, paragraphCss(st.paragraph));
                applyCss(p, textCss(st.text, face));
                p.append(...odfNodes(n.children, env, depth, listStyle));
                if (!p.textContent) p.append(h('br'));
                out.push(p);
                break;
            }
            case 'text:span': {
                const span = h('span');
                applyCss(span, textCss(env.styles.resolve(a['text:style-name'], 'text').text, face));
                span.append(...odfNodes(n.children, env, depth, listStyle));
                out.push(span);
                break;
            }
            case 'text:a': {
                const link = h('a', { href: a['xlink:href'] || null });
                link.append(...odfNodes(n.children, env, depth, listStyle));
                out.push(link);
                break;
            }
            case 'text:s': out.push(document.createTextNode(' '.repeat(Math.min(1000, Number(a['text:c']) || 1)))); break;
            case 'text:tab': out.push(document.createTextNode('\t')); break;
            case 'text:line-break': out.push(h('br')); break;
            case 'text:list': {
                const name = a['text:style-name'] || listStyle;
                const ls = name && env.listStyles ? env.listStyles.get(name) : null;
                const lvl = ls?.levels?.find((l) => Number(l.attrs?.['text:level']) === depth) || null;
                const ordered = lvl ? lvl.type === 'level-number' : false;
                const list = h(ordered ? 'ol' : 'ul', { class: 'awv-list' });
                if (ordered) list.style.listStyleType = LIST_TYPES[/** @type {keyof typeof LIST_TYPES} */ (lvl?.attrs?.['style:num-format'] || '1')] || 'decimal';
                else list.style.listStyleType = `"${String(lvl?.attrs?.['text:bullet-char'] || '•').replace(/["\\]/g, '')}  "`;
                for (const item of n.children || []) {
                    if (item.name !== 'text:list-item' && item.name !== 'text:list-header') continue;
                    list.append(h('li', {}, odfNodes(item.children, env, depth + 1, name)));
                }
                out.push(list);
                break;
            }
            default:
                if (n.children) out.push(...odfNodes(n.children, env, depth, listStyle));
        }
    }
    return out;
}
