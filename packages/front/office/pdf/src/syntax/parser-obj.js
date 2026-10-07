// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview PDF typed-object constructors and reflection helpers.
 *
 * Extracted from `parser.js` so the parser orchestrator stays under the
 * 300-LOC cap. The `obj` factory is the canonical way to build typed
 * objects literally — both internal use (parser construction) and
 * external use (tests, content-stream serializers in L1+).
 *
 * @module pdf/syntax/parser-obj
 */

/**
 * Module factory — worker-safe, self-contained.
 */
export const pdfParserObj = {
    name: 'pdfParserObj',
    dependencies: [],
    factory() {
        const obj = {
            nul:    () => ({ type: 'null' }),
            bool:   (v) => ({ type: 'bool',   value: !!v }),
            int:    (v) => ({ type: 'int',    value: v | 0 }),
            real:   (v) => ({ type: 'real',   value: +v }),
            name:   (s) => ({ type: 'name',   value: String(s) }),
            string: (bytes, syntax) => ({
                type: 'string',
                value: bytes,
                syntax: syntax === 'hex' ? 'hex' : 'lit'
            }),
            array:  (items) => ({ type: 'array', items: items || [] }),
            dict:   (entries) => ({ type: 'dict', entries: entries || {} }),
            ref:    (num, gen) => ({ type: 'ref', num: num | 0, gen: (gen | 0) || 0 }),
            stream: (dict, raw) => ({ type: 'stream', dict, raw })
        };

        function getEntry(dict, key) {
            if (!dict || dict.type !== 'dict') return undefined;
            return dict.entries[key];
        }

        function isType(v, kind) {
            return !!(v && v.type === kind);
        }

        return { obj, getEntry, isType };
    }
};
