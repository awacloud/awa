// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : typed entry points + manifest wiring
 * helpers for embedded MathML (`<math:math>`).
 *
 * The MathML element tree itself is kept as raw XML (W3C namespace,
 * ~100 elements not worth re-typing). This extra exposes typed
 * accessors :
 *   - `parseMath(el)`    → `{ type: 'mathml', attrs, body: rawXmlChildren }`
 *   - `renderMath(obj)`  → `<math:math>` element with body inlined
 *   - `manifestEntries({ path })` → array of manifest entries for the
 *      embedded math object directory.
 *
 * @module odf/extra/math-mathml
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const mathMathml = {
    name: 'mathMathml',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';


        function parseMath(el) {
            if (!el || el.type !== 'element' || el.name !== 'math:math') return null;
            return {
                type: 'mathml',
                attrs: { ...(el.attrs || {}) },
                body: [...(el.children || [])]
            };
        }

        function renderMath(obj) {
            if (!obj || obj.type !== 'mathml') return null;
            return xml.el('math:math', { ...(obj.attrs || {}) }, obj.body || []);
        }

        /**
         * Build the META-INF/manifest.xml entries for an embedded math
         * object. By convention the object lives in `Object 1/` with a
         * `content.xml` MathML root.
         *
         * @param {{ path?: string }} opts
         * @returns {Array<{ fullPath: string, mediaType: string }>}
         */
        function manifestEntries(opts) {
            const dir = (opts && opts.path) || 'Object 1/';
            const safe = dir.endsWith('/') ? dir : (dir + '/');
            return [
                { fullPath: safe, mediaType: 'application/vnd.oasis.opendocument.formula' },
                { fullPath: safe + 'content.xml', mediaType: 'text/xml' }
            ];
        }

        function isMath(name) { return name === 'math:math'; }

        return {
            parseMath, renderMath, manifestEntries, isMath,
            MATHML_NS
        };
    }
};
