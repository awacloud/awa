// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview SpreadsheetML comments — `xl/comments*.xml` + the
 * paired VML legacy drawing required for Excel to render comment
 * bubbles (ECMA-376 part 1 §18.7).
 *
 * Excel's comment model has two parts working together :
 *
 * | Part | Role |
 * |------|------|
 * | `xl/comments{N}.xml` | List of authors + rich-text comment bodies. |
 * | `xl/drawings/vmlDrawing{N}.vml` | VML shape (the yellow box) anchored to each commented cell. **Required** — Excel ignores comments without VML. |
 *
 * The sheet binds them via two relationships
 * (`…/relationships/comments` + `…/relationships/vmlDrawing`) and a
 * `<legacyDrawing r:id="…"/>` element.
 *
 * Document model (sheet-level) :
 *
 * ```js
 * sheet.comments: [{
 *   ref: 'A1',                       // cell reference
 *   author: string,                  // resolved at parse time, looked up at write
 *   richText: [{ text, rPr? }],      // canonical rich-text array
 *   text?: string,                   // shorthand — converted to a single run
 *   _extras?
 * }]
 * ```
 *
 * `rPr` is a subset of xlsx font properties applicable to comment runs :
 * `size`, `color`, `font`, `family`, `bold`, `italic`, `strike`,
 * `underline`, `scheme`, `charset`.
 *
 * Threaded comments (`xl/threadedComments/`) are an extension and are
 * **not yet modelled** — they are preserved as opaque parts when read.
 *
 * @module ooxml/xlsx/comments
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlShared } from '../_shared/index.js';

export const xlsxComments = {
    name: 'xlsxComments',
    dependencies: ['ooxmlErrors', 'xml', 'ooxmlShared'],
    deps: [ooxmlErrors, xml, ooxmlShared],

    factory(errors, xml, shared) {
        const { ParseError } = errors;
        const { NS, REL_TYPE, CT, readBoolAttr, encodeText, decodeText } = shared;

        const SS_NS = NS.SS;
        const REL_TYPE_COMMENTS = REL_TYPE.COMMENTS;
        const REL_TYPE_VML_DRAWING = REL_TYPE.VML_DRAWING;
        const CT_COMMENTS = CT.COMMENTS_X;
        const CT_VML_DRAWING = CT.VML_DRAWING;

        // --- Run properties (subset of xlsx font props that apply to
        //     comment runs — same vocabulary as in shared strings rich text) ---

        function parseRPr(el) {
            if (!el) return undefined;
            const out = {};
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'sz':      out.size = Number(c.attrs.val); break;
                    case 'rFont':   out.font = c.attrs.val; break;
                    case 'family':  out.family = Number(c.attrs.val); break;
                    case 'color': {
                        const cl = {};
                        if (c.attrs.rgb)     cl.rgb = c.attrs.rgb;
                        if (c.attrs.theme)   cl.theme = Number(c.attrs.theme);
                        if (c.attrs.tint)    cl.tint = Number(c.attrs.tint);
                        if (c.attrs.indexed) cl.indexed = Number(c.attrs.indexed);
                        out.color = cl;
                        break;
                    }
                    case 'b':       out.bold = readBoolAttr(c.attrs.val) !== false; break;
                    case 'i':       out.italic = readBoolAttr(c.attrs.val) !== false; break;
                    case 'strike':  out.strike = readBoolAttr(c.attrs.val) !== false; break;
                    case 'u':       out.underline = c.attrs.val || 'single'; break;
                    case 'scheme':  out.scheme = c.attrs.val; break;
                    case 'charset': out.charset = Number(c.attrs.val); break;
                }
            }
            return out;
        }

        function renderRPr(rPr) {
            if (!rPr) return null;
            const children = [];
            if (rPr.bold)        children.push(xml.el('b', {}));
            if (rPr.italic)      children.push(xml.el('i', {}));
            if (rPr.strike)      children.push(xml.el('strike', {}));
            if (rPr.underline)   children.push(xml.el('u', { val: rPr.underline }));
            if (rPr.size != null) children.push(xml.el('sz', { val: String(rPr.size) }));
            if (rPr.color) {
                const a = {};
                if (rPr.color.rgb != null)     a.rgb = rPr.color.rgb;
                if (rPr.color.theme != null)   a.theme = String(rPr.color.theme);
                if (rPr.color.tint != null)    a.tint = String(rPr.color.tint);
                if (rPr.color.indexed != null) a.indexed = String(rPr.color.indexed);
                children.push(xml.el('color', a));
            }
            if (rPr.font != null)   children.push(xml.el('rFont', { val: rPr.font }));
            if (rPr.family != null) children.push(xml.el('family', { val: String(rPr.family) }));
            if (rPr.charset != null) children.push(xml.el('charset', { val: String(rPr.charset) }));
            if (rPr.scheme)         children.push(xml.el('scheme', { val: rPr.scheme }));
            if (!children.length) return null;
            return xml.el('rPr', {}, children);
        }

        // --- Comment text (rich-text array of runs) ---

        function parseText(textEl) {
            const runs = [];
            for (const c of textEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 't') {
                    runs.push({ text: xml.textContent(c) });
                } else if (c.name === 'r') {
                    const rPrEl = xml.findChild(c, 'rPr');
                    const tEl = xml.findChild(c, 't');
                    const run = { text: tEl ? xml.textContent(tEl) : '' };
                    const rPr = parseRPr(rPrEl);
                    if (rPr && Object.keys(rPr).length) run.rPr = rPr;
                    runs.push(run);
                }
            }
            return runs;
        }

        function renderText(richText) {
            const children = (richText || []).map(run => {
                if (!run.rPr) {
                    // Plain text — emit <r><t>…</t></r> for consistency with
                    // what Excel writes (always wraps comment text in runs).
                    return xml.el('r', {}, [
                        xml.el('t', { 'xml:space': 'preserve' }, [xml.text(run.text || '')])
                    ]);
                }
                const inner = [];
                const rPrEl = renderRPr(run.rPr);
                if (rPrEl) inner.push(rPrEl);
                inner.push(xml.el('t', { 'xml:space': 'preserve' }, [xml.text(run.text || '')]));
                return xml.el('r', {}, inner);
            });
            return xml.el('text', {}, children);
        }

        // --- Top-level parse / serialize of comments part ---

        /**
         * Parse `xl/comments{N}.xml`.
         *
         * @param {string|Uint8Array} input
         * @returns {{ authors, comments: [{ref, authorId, author, richText}] }}
         */
        function parse(input) {
            const text = typeof input === 'string' ? input : decodeText(input);
            const root = xml.parse(text);
            if (root.name !== 'comments') {
                throw new ParseError('xlsx/comments-bad-root', `xlsx comments: expected <comments>, got <${root.name}>`, { context: { elementName: root && root.name } });
            }
            const authors = [];
            const authorsEl = xml.findChild(root, 'authors');
            if (authorsEl) {
                for (const a of xml.findAll(authorsEl, 'author')) {
                    authors.push(xml.textContent(a));
                }
            }
            const comments = [];
            const listEl = xml.findChild(root, 'commentList');
            if (listEl) {
                for (const cEl of xml.findAll(listEl, 'comment')) {
                    const authorId = cEl.attrs.authorId != null
                        ? Number(cEl.attrs.authorId) : 0;
                    const out = {
                        ref: cEl.attrs.ref,
                        authorId,
                        author: authors[authorId] || ''
                    };
                    if (cEl.attrs.shapeId != null) out.shapeId = Number(cEl.attrs.shapeId);
                    const tEl = xml.findChild(cEl, 'text');
                    if (tEl) out.richText = parseText(tEl);
                    comments.push(out);
                }
            }
            return { authors, comments };
        }

        /**
         * Serialize a `{ authors, comments }` object to `xl/comments*.xml`
         * XML.
         *
         * If a comment provides `author` (string) without `authorId`,
         * the author is interned in the `authors` list (deduped) and the
         * appropriate `authorId` is emitted.
         *
         * If a comment provides `text` (string) instead of `richText`,
         * a single-run rich text is built automatically.
         */
        function serialize(obj) {
            // Build / extend the authors list from comment.author.
            const authors = (obj.authors || []).slice();
            const authorIndex = new Map();
            authors.forEach((a, i) => authorIndex.set(a, i));

            function internAuthor(name) {
                if (!authorIndex.has(name)) {
                    authorIndex.set(name, authors.length);
                    authors.push(name);
                }
                return authorIndex.get(name);
            }

            const commentEls = (obj.comments || []).map((c, i) => {
                let authorId = c.authorId;
                if (authorId == null) {
                    authorId = c.author != null ? internAuthor(c.author) : 0;
                }
                const a = {
                    ref: c.ref,
                    authorId: String(authorId)
                };
                if (c.shapeId != null) a.shapeId = String(c.shapeId);
                else                    a.shapeId = String(1024 + i);
                const richText = c.richText
                    || (c.text != null ? [{ text: c.text }] : []);
                return xml.el('comment', a, [renderText(richText)]);
            });

            const children = [];
            children.push(xml.el('authors', {},
                authors.map(name => xml.el('author', {}, [xml.text(name)]))));
            children.push(xml.el('commentList', {}, commentEls));
            return xml.serialize(xml.el('comments',
                { xmlns: SS_NS }, children));
        }

        function bytesOf(obj) { return encodeText(serialize(obj)); }

        // --- VML drawing generation (legacy shape required by Excel) ---

        const VML_NS_V = 'urn:schemas-microsoft-com:vml';
        const VML_NS_O = 'urn:schemas-microsoft-com:office:office';
        const VML_NS_X = 'urn:schemas-microsoft-com:office:excel';

        /**
         * Build the VML drawing XML that gives every comment its visual
         * bubble. Excel positions the box itself; we emit a generic shape
         * per comment with sensible default offsets.
         *
         * Cells are 0-based here (`{ col, row }`); the VML uses the same
         * 0-based form.
         *
         * @param {Array<{col:number, row:number}>} cellRefs
         * @returns {string}
         */
        function vmlForComments(cellRefs) {
            // Anchor format: 6 numbers — sourceColumn, sourceColumnOffset,
            // sourceRow, sourceRowOffset, targetColumn, targetColumnOffset,
            // targetRow, targetRowOffset (8 actually — 4 source, 4 target).
            // We use a minimal "two cells right and three rows down" anchor.
            const shapes = cellRefs.map((cell, i) => {
                const id = `_x0000_s${1025 + i}`;
                const anchor = [
                    cell.col + 1, 15,     // source col, off-x
                    cell.row, 10,         // source row, off-y
                    cell.col + 3, 15,     // target col, off-x
                    cell.row + 4, 4       // target row, off-y
                ].join(', ');
                return [
                    `<v:shape id="${id}" type="#_x0000_t202"`,
                    ` style="position:absolute;margin-left:60pt;margin-top:1.5pt;`,
                    `width:108pt;height:60pt;z-index:${i + 1};visibility:hidden"`,
                    ` fillcolor="#ffffe1" o:insetmode="auto">`,
                    `<v:fill color2="#ffffe1"/>`,
                    `<v:shadow on="t" color="black" obscured="t"/>`,
                    `<v:path o:connecttype="none"/>`,
                    `<v:textbox style="mso-direction-alt:auto"><div style="text-align:left"/></v:textbox>`,
                    `<x:ClientData ObjectType="Note">`,
                    `<x:MoveWithCells/>`,
                    `<x:SizeWithCells/>`,
                    `<x:Anchor>${anchor}</x:Anchor>`,
                    `<x:AutoFill>False</x:AutoFill>`,
                    `<x:Row>${cell.row}</x:Row>`,
                    `<x:Column>${cell.col}</x:Column>`,
                    `</x:ClientData>`,
                    `</v:shape>`
                ].join('');
            }).join('');

            const head =
                `<xml xmlns:v="${VML_NS_V}" xmlns:o="${VML_NS_O}" xmlns:x="${VML_NS_X}">` +
                `<o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout>` +
                `<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe">` +
                `<v:stroke joinstyle="miter"/>` +
                `<v:path gradientshapeok="t" o:connecttype="rect"/>` +
                `</v:shapetype>`;
            return head + shapes + '</xml>';
        }

        function vmlBytes(cellRefs) { return encodeText(vmlForComments(cellRefs)); }

        return {
            parse, serialize, bytesOf,
            renderText, parseText,
            renderRPr, parseRPr,
            vmlForComments, vmlBytes,
            REL_TYPE_COMMENTS, REL_TYPE_VML_DRAWING,
            CT_COMMENTS, CT_VML_DRAWING
        };
    }
};
