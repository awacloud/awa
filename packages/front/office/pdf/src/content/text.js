// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Text state + positioning per ISO 32000-2:2020 §9.3 / §9.4.
 *
 * Provides operators that mutate `gstate.text` and helpers for the
 * text-object matrices Tm + Tlm (text matrix + text line matrix).
 *
 * Text-showing operators (`Tj`, `TJ`, `'`, `"`) **do not** decode the
 * glyph stream into Unicode here — that requires the font's ToUnicode
 * CMap, which lives in `@awacloud/fonts/cmap-to-unicode`. The high-level
 * `extractText` helper takes a resolved `Font` + a ToUnicode mapping
 * function and produces a `string`.
 *
 * @module pdf/content/text
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';

export const pdfText = {
    name: 'pdfText',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],
    factory(errors) {
        const { ContractError } = errors;

        function mul(a, b) {
            return [
                a[0] * b[0] + a[1] * b[2],
                a[0] * b[1] + a[1] * b[3],
                a[2] * b[0] + a[3] * b[2],
                a[2] * b[1] + a[3] * b[3],
                a[4] * b[0] + a[5] * b[2] + b[4],
                a[4] * b[1] + a[5] * b[3] + b[5]
            ];
        }

        function setFont(gstate, fontResource, size) {
            gstate.text.font     = fontResource;
            gstate.text.fontSize = size;
        }

        function beginTextObject() {
            return {
                Tm:  [1, 0, 0, 1, 0, 0],
                Tlm: [1, 0, 0, 1, 0, 0]
            };
        }

        function td(state, tx, ty) {
            state.Tlm = mul([1, 0, 0, 1, tx, ty], state.Tlm);
            state.Tm  = state.Tlm.slice();
        }

        function tdSetLeading(gstate, state, tx, ty) {
            gstate.text.leading = -ty;
            td(state, tx, ty);
        }

        function setTextMatrix(state, m) {
            if (!Array.isArray(m) || m.length !== 6) {
                throw new ContractError('pdf/text/bad-matrix',
                    'Tm matrix must have 6 elements');
            }
            state.Tm  = m.slice();
            state.Tlm = m.slice();
        }

        function nextLine(gstate, state) {
            td(state, 0, -gstate.text.leading);
        }

        function rawStringBytes(stringObj) {
            if (!stringObj || stringObj.type !== 'string') {
                throw new ContractError('pdf/text/bad-string',
                    'expected typed string operand',
                    { context: { type: stringObj && stringObj.type } });
            }
            return stringObj.value;
        }

        function extractText(op, font, cidToUnicode) {
            const cidBytes = (font && font.subtype === 'Type0') ? 2 : 1;
            let text = '';
            const collect = (strObj) => {
                const bytes = rawStringBytes(strObj);
                for (let i = 0; i + cidBytes <= bytes.length; i += cidBytes) {
                    let cid = 0;
                    for (let k = 0; k < cidBytes; k++) cid = (cid << 8) | bytes[i + k];
                    const u = cidToUnicode(cid);
                    text += (typeof u === 'string') ? u : '�';
                }
            };
            if (op.op === 'Tj' || op.op === "'") {
                collect(op.args[0]);
            } else if (op.op === '"') {
                collect(op.args[2]);
            } else if (op.op === 'TJ') {
                const arr = op.args[0];
                if (!arr || arr.type !== 'array') return '';
                for (const it of arr.items) {
                    if (it.type === 'string') collect(it);
                }
            }
            return text;
        }

        return {
            setFont,
            beginTextObject,
            td,
            tdSetLeading,
            setTextMatrix,
            nextLine,
            rawStringBytes,
            extractText
        };
    }
};
