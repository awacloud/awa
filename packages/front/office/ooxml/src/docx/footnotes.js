// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview WordprocessingML footnotes / endnotes parts —
 * `word/footnotes.xml` and `word/endnotes.xml` (ECMA-376 part 1 §17.11).
 *
 * Both formats share the same structure with a different root element :
 *
 * ```xml
 * <w:footnotes><w:footnote w:type="separator|continuationSeparator|normal"
 *                          w:id="N">
 *     <w:p>…</w:p>
 * </w:footnote></w:footnotes>
 * ```
 *
 * Document model :
 *
 * ```js
 * {
 *   notes: [{
 *     id: number,
 *     noteType?: 'separator'|'continuationSeparator'|'normal',
 *     body: [paragraph | table],
 *     _extras?: [xmlNode]
 *   }],
 *   _extras?: [xmlNode]
 * }
 * ```
 *
 * In document runs, a note is anchored via `<w:footnoteReference w:id="N"/>`
 * or `<w:endnoteReference w:id="N"/>` — handled by `docxStructure`.
 *
 * `parseFootnotes` / `parseEndnotes` accept the part as text, as bytes, or
 * as an already-parsed root element. `docx.read` passes a root already
 * processed by `markupCompatibility` (ignorable extension content dropped,
 * the two repeating-section elements kept); a standalone call on text or
 * bytes does no markup-compatibility processing. The written root declares
 * `w` and `r`, plus `mc`, `w15` and `mc:Ignorable="w15"` when the part
 * holds a `w15` element (`ooxmlShared.wordRootAttrs`).
 *
 * @module ooxml/docx/footnotes
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { docxStructure } from './structure.js';
import { ooxmlShared } from '../_shared/index.js';

export const docxFootnotes = {
    name: 'docxFootnotes',
    dependencies: ['ooxmlErrors', 'xml', 'docxStructure', 'ooxmlShared'],
    deps: [ooxmlErrors, xml, docxStructure, ooxmlShared],

    factory(errors, xml, structure, shared) {
        const { ParseError } = errors;
        const { REL_TYPE, CT, encodeText, decodeText, wordRootAttrs } = shared;

        const REL_TYPE_FOOTNOTES = REL_TYPE.FOOTNOTES;
        const REL_TYPE_ENDNOTES = REL_TYPE.ENDNOTES;
        const CT_FOOTNOTES = CT.FOOTNOTES;
        const CT_ENDNOTES = CT.ENDNOTES;

        function parseNote(nEl) {
            const out = {
                id: Number(nEl.attrs['w:id']),
                body: []
            };
            if (nEl.attrs['w:type']) out.noteType = nEl.attrs['w:type'];
            const { body, extras } = structure.parseBody(nEl);
            out.body = body;
            if (extras && extras.length) out._extras = extras;
            return out;
        }

        function renderNote(n, childTag) {
            const attrs = { 'w:id': String(n.id) };
            if (n.noteType) attrs['w:type'] = n.noteType;
            const children = structure.renderBodyChildren({
                body: n.body || [], _extras: n._extras
            }).filter(node => node.name !== 'w:sectPr');
            return xml.el(childTag, attrs, children);
        }

        // `input`: part text, part bytes, or an already-parsed root element
        // (`type: 'element'`, used as is). Text and bytes get no
        // markup-compatibility processing.
        function buildParser(rootTag, childTag) {
            return function parse(input) {
                const root = (input && typeof input === 'object' && input.type === 'element')
                    ? input
                    : xml.parse(typeof input === 'string' ? input : decodeText(input));
                if (root.name !== rootTag) {
                    throw new ParseError(`docx/${rootTag.replace(/^w:/, '')}-bad-root`, `docx ${rootTag}: expected <${rootTag}>, got <${root.name}>`, { context: { expected: rootTag, elementName: root && root.name } });
                }
                const out = { notes: [] };
                const extras = [];
                for (const c of root.children) {
                    if (c.type !== 'element') continue;
                    if (c.name === childTag) out.notes.push(parseNote(c, childTag));
                    else extras.push(c);
                }
                if (extras.length) out._extras = extras;
                return out;
            };
        }

        function buildSerializer(rootTag, childTag) {
            return function serialize(obj) {
                const children = (obj.notes || []).map(n => renderNote(n, childTag));
                if (obj._extras) for (const ex of obj._extras) children.push(ex);
                // `w` and `r` always; `mc`, `w15` and `mc:Ignorable` when
                // the rendered notes or `_extras` hold a `w15` element.
                return xml.serialize(xml.el(rootTag, wordRootAttrs(children), children));
            };
        }

        const parseFootnotes = buildParser('w:footnotes', 'w:footnote');
        const parseEndnotes  = buildParser('w:endnotes',  'w:endnote');
        const serializeFootnotes = buildSerializer('w:footnotes', 'w:footnote');
        const serializeEndnotes  = buildSerializer('w:endnotes',  'w:endnote');

        function footnotesBytes(obj) { return encodeText(serializeFootnotes(obj)); }
        function endnotesBytes(obj)  { return encodeText(serializeEndnotes(obj)); }

        return {
            parseFootnotes, parseEndnotes,
            serializeFootnotes, serializeEndnotes,
            footnotesBytes, endnotesBytes,
            REL_TYPE_FOOTNOTES, REL_TYPE_ENDNOTES,
            CT_FOOTNOTES, CT_ENDNOTES
        };
    }
};
