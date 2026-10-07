// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Pass-through for embedded MathML (`<math:math>` root).
 *
 * ODF formulas are stored in their own sub-document (`Object N/content.xml`)
 * whose root is a `<math:math>` element. The entire fragment is
 * treated as opaque XML and written back, so it is preserved on a
 * round-trip. Operators, fractions and sub/sup are not typed; the
 * `mathMathml` extra adds typed entry points but keeps the body raw.
 *
 * Model: `{ type: 'math', xml: <element-node> }`.
 *
 * @module odf/math/math
 */



import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';

export const mathMath = {
    name: 'mathMath',
    dependencies: ['odfErrors', 'odfShared', 'xml'],
    deps: [odfErrors, odfShared, xml],

    factory(errors, shared, xml) {
        void errors;
        const { XML_DECL_STANDALONE: XML_DECL, encodeText, decodeText,
                parseXmlOrThrow, findDeep, declareNamespaces } = shared;


        /**
         * Parse a `<math:math>` element.
         *
         * @param {object} el
         * @returns {object}
         */
        function parseMath(el) {
            return { type: 'math', xml: el };
        }

        /**
         * Render a math model — returns the stored element verbatim.
         *
         * @param {object} m
         * @returns {object}
         */
        function renderMath(m) {
            if (m && m.xml) return m.xml;
            return xml.el('math:math', {}, []);
        }

        /**
         * Parse a math `content.xml` byte payload.
         *
         * @param {Uint8Array|string} bytes
         * @returns {object}
         */
        function parseBytes(bytes) {
            const td = typeof bytes === 'string' ? bytes : decodeText(bytes);
            const root = parseXmlOrThrow(td, 'math');
            if (root.name === 'math:math') return parseMath(root);
            const found = findDeep(root, 'math:math');
            if (found) return parseMath(found);
            return parseMath(xml.el('math:math', {}, []));
        }

        /**
         * Serialize a math model as a math `content.xml` byte payload. The
         * written root declares every namespace prefix the output uses (its
         * own declarations first, then the known table); the stored model
         * element is not modified. A prefix nobody declares throws
         * `RenderError('odf/render-error/namespace')`.
         *
         * @param {object} m
         * @returns {Uint8Array}
         */
        function bytesOf(m) {
            const root = declareNamespaces({ ...renderMath(m) }, { part: 'content.xml', module: 'math' });
            return encodeText(XML_DECL + '\r\n' + xml.serializeNode(root));
        }

        return { parseMath, renderMath, parseBytes, bytesOf };
    }
};
