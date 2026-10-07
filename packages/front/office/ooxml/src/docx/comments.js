// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview WordprocessingML comments part — `word/comments.xml`
 * (ECMA-376 part 1 §17.13.4).
 *
 * Document model :
 *
 * ```js
 * {
 *   comments: [{
 *     id: number,
 *     author?: string,
 *     date?: string,         // ISO 8601
 *     initials?: string,
 *     body: [paragraph | table],
 *     _extras?: [xmlNode]
 *   }],
 *   _extras?: [xmlNode]
 * }
 * ```
 *
 * In the body of the main document, a comment is anchored via :
 *
 * ```xml
 * <w:commentRangeStart w:id="N"/>
 * …commented content…
 * <w:commentRangeEnd w:id="N"/>
 * <w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
 *      <w:commentReference w:id="N"/></w:r>
 * ```
 *
 * The `commentRangeStart/End` and `commentReference` markers are handled
 * by `docxStructure` (paragraph children + run children).
 *
 * `parse` accepts the part as text, as bytes, or as an already-parsed root
 * element. `docx.read` passes a root already processed by
 * `markupCompatibility` (ignorable extension content dropped, the two
 * repeating-section elements kept); a standalone call on text or bytes
 * does no markup-compatibility processing. The written root declares `w`
 * and `r` (a comment may hold a hyperlink's `r:id`), plus `mc`, `w15` and
 * `mc:Ignorable="w15"` when the part holds a `w15` element
 * (`ooxmlShared.wordRootAttrs`).
 *
 * @module ooxml/docx/comments
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { docxStructure } from './structure.js';
import { ooxmlShared } from '../_shared/index.js';

export const docxComments = {
    name: 'docxComments',
    dependencies: ['ooxmlErrors', 'xml', 'docxStructure', 'ooxmlShared'],
    deps: [ooxmlErrors, xml, docxStructure, ooxmlShared],

    factory(errors, xml, structure, shared) {
        const { ParseError } = errors;
        const { REL_TYPE, CT, encodeText, decodeText, wordRootAttrs } = shared;

        const REL_TYPE_COMMENTS = REL_TYPE.COMMENTS;
        const CT_COMMENTS = CT.COMMENTS_W;

        function parseComment(cEl) {
            const out = {
                id: Number(cEl.attrs['w:id']),
                body: []
            };
            if (cEl.attrs['w:author'])   out.author = cEl.attrs['w:author'];
            if (cEl.attrs['w:date'])     out.date = cEl.attrs['w:date'];
            if (cEl.attrs['w:initials']) out.initials = cEl.attrs['w:initials'];
            const { body, extras } = structure.parseBody(cEl);
            out.body = body;
            if (extras && extras.length) out._extras = extras;
            return out;
        }

        function renderComment(c) {
            const attrs = { 'w:id': String(c.id) };
            if (c.author)   attrs['w:author'] = c.author;
            if (c.date)     attrs['w:date'] = c.date;
            if (c.initials) attrs['w:initials'] = c.initials;
            const children = structure.renderBodyChildren({
                body: c.body || [], _extras: c._extras
            }).filter(n => n.name !== 'w:sectPr');
            return xml.el('w:comment', attrs, children);
        }

        /**
         * Parse a `w:comments` part.
         *
         * @param {string|Uint8Array|object} input Part text, part bytes, or
         *   an already-parsed root element (`type: 'element'`, used as is).
         *   Text and bytes get no markup-compatibility processing.
         */
        function parse(input) {
            const root = (input && typeof input === 'object' && input.type === 'element')
                ? input
                : xml.parse(typeof input === 'string' ? input : decodeText(input));
            if (root.name !== 'w:comments') {
                throw new ParseError('docx/comments-bad-root', `docx comments: expected <w:comments>, got <${root.name}>`, { context: { elementName: root && root.name } });
            }
            const out = { comments: [] };
            const extras = [];
            for (const c of root.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:comment') out.comments.push(parseComment(c));
                else extras.push(c);
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function serialize(obj) {
            const children = (obj.comments || []).map(renderComment);
            if (obj._extras) for (const ex of obj._extras) children.push(ex);
            // `w` and `r` always (a comment may hold a hyperlink's `r:id`);
            // `mc`, `w15` and `mc:Ignorable` when the rendered comments or
            // `_extras` hold a `w15` element.
            return xml.serialize(xml.el('w:comments', wordRootAttrs(children), children));
        }

        function bytesOf(obj) { return encodeText(serialize(obj)); }

        return {
            parse, serialize, bytesOf,
            REL_TYPE_COMMENTS, CT_COMMENTS
        };
    }
};
