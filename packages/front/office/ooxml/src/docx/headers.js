// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Headers and footers for WordprocessingML — `header*.xml`
 * and `footer*.xml` parts (ECMA-376 part 1 §17.10.4 + §17.10.3).
 *
 * Headers/footers are independent parts that contain block-level content
 * (paragraphs / tables) just like the main document body. They are bound
 * to a section via `<w:headerReference>` / `<w:footerReference>` inside
 * the section properties.
 *
 * Three reference types per section :
 *
 * | `w:type` | Used on |
 * |----------|---------|
 * | `default` | every page that doesn't have a specific override |
 * | `first` | first page (requires `<w:titlePg/>` in sectPr) |
 * | `even` | even-numbered pages (requires `evenAndOddHeaders` in settings) |
 *
 * Document model :
 *
 * ```js
 * { type: 'header'|'footer',
 *   body: [paragraph | table],
 *   _extras?: [xmlNode] }
 * ```
 *
 * Section properties grow `headerReferences` / `footerReferences`
 * arrays with `{ type, rId }` — wired by docx.js when the package is
 * read or written.
 *
 * `parse` accepts the part as text, as bytes, or as an already-parsed
 * root element. `docx.read` passes a root already processed by
 * `markupCompatibility` (ignorable extension content dropped, the two
 * repeating-section elements kept); a standalone call on text or bytes
 * does no markup-compatibility processing. The written root declares `w`
 * and `r`, plus `mc`, `w15` and `mc:Ignorable="w15"` when the part holds a
 * `w15` element (`ooxmlShared.wordRootAttrs`).
 *
 * @module ooxml/docx/headers
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { docxStructure } from './structure.js';
import { ooxmlShared } from '../_shared/index.js';

export const docxHeaders = {
    name: 'docxHeaders',
    dependencies: ['ooxmlErrors', 'xml', 'docxStructure', 'ooxmlShared'],
    deps: [ooxmlErrors, xml, docxStructure, ooxmlShared],

    factory(errors, xml, structure, shared) {
        const { ParseError } = errors;
        const { REL_TYPE, CT, encodeText, decodeText, wordRootAttrs } = shared;

        const REL_TYPE_HEADER = REL_TYPE.HEADER;
        const REL_TYPE_FOOTER = REL_TYPE.FOOTER;
        const CT_HEADER = CT.HEADER;
        const CT_FOOTER = CT.FOOTER;

        /**
         * Parse a `w:hdr` / `w:ftr` part.
         *
         * @param {string|Uint8Array|object} input Part text, part bytes, or
         *   an already-parsed root element (`type: 'element'`, used as is).
         *   Text and bytes get no markup-compatibility processing.
         * @param {'header'|'footer'} kind
         */
        function parse(input, kind) {
            const root = (input && typeof input === 'object' && input.type === 'element')
                ? input
                : xml.parse(typeof input === 'string' ? input : decodeText(input));
            const expected = kind === 'footer' ? 'w:ftr' : 'w:hdr';
            if (root.name !== expected) {
                throw new ParseError(`docx/${kind}-bad-root`, `docx ${kind}: expected <${expected}>, got <${root.name}>`, { context: { kind, elementName: root && root.name } });
            }
            // Reuse the body parser — headers/footers share the same content model.
            const { body, extras } = structure.parseBody(root);
            const out = { type: kind, body };
            if (extras && extras.length) out._extras = extras;
            return out;
        }

        function serialize(obj) {
            const tag = obj.type === 'footer' ? 'w:ftr' : 'w:hdr';
            const children = structure.renderBodyChildren({
                body: obj.body || [],
                _extras: obj._extras
            });
            // sectPr does not appear inside header/footer content — strip it
            // if accidentally produced.
            const filtered = children.filter(n => n.name !== 'w:sectPr');
            // `w` and `r` always; `mc`, `w15` and `mc:Ignorable` when the
            // rendered content holds a `w15` element.
            return xml.serialize(xml.el(tag, wordRootAttrs(filtered), filtered));
        }

        function bytesOf(obj) { return encodeText(serialize(obj)); }

        return {
            parse, serialize, bytesOf,
            REL_TYPE_HEADER, REL_TYPE_FOOTER,
            CT_HEADER, CT_FOOTER
        };
    }
};
