// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview ToUnicode CMap — Adobe Technical Note #5014 + PDF 32000-1
 * §9.10.3. A textual mini-language emitted in PDF stream form that
 * maps a font's character codes (CID or single-byte) to Unicode code
 * point sequences.
 *
 * Two operators carry the actual mapping data :
 *
 * ```
 *   N beginbfchar
 *       <cid1> <utf16-be-string>
 *       …
 *   endbfchar
 *
 *   N beginbfrange
 *       <cidStart> <cidEnd> <utf16-be-string>          // single base; consecutive CIDs
 *       <cidStart> <cidEnd> [ <utf16-be-string> ... ]  // explicit array, one per CID
 *       …
 *   endbfrange
 * ```
 *
 * Code points are hex-encoded inside `<…>` brackets (UTF-16BE bytes
 * when ≥ 4 hex chars). Surrogate pairs are spelled out as two 16-bit
 * code units.
 *
 * Factory output :
 *
 *  - `parseToUnicode(s)` → `Map<cid, string>`  (string is JS UTF-16)
 *  - `buildToUnicode(map[, opts])` → PDF stream string (`opts.codeBytes` 1|2,
 *    default 2: one-byte codespace for simple fonts, two-byte for CID fonts)
 *
 * Strict factory-only.
 *
 * @module fonts/cmap/toUnicode
 */

import { fontErrors } from '../errors.js';

export const cmapToUnicode = {
    name: 'cmapToUnicode',
    dependencies: ['fontErrors'],
    deps: [fontErrors],
    factory(errors) {
        const { ParseError, ContractError } = errors;

        function* tokens(src) {
            let i = 0;
            while (i < src.length) {
                const c = src[i];
                if (c === '%') {
                    while (i < src.length && src[i] !== '\n' && src[i] !== '\r') i++;
                    continue;
                }
                if (/\s/.test(c)) { i++; continue; }
                if (c === '<') {
                    const end = src.indexOf('>', i + 1);
                    if (end < 0) throw new ParseError('fonts/tou-unterminated-hex', 'unterminated hex string in CMap');
                    yield { type: 'hex', value: src.slice(i + 1, end) };
                    i = end + 1; continue;
                }
                if (c === '[') { yield { type: '[' }; i++; continue; }
                if (c === ']') { yield { type: ']' }; i++; continue; }
                if (c === '/') {
                    let j = i + 1;
                    while (j < src.length && !/[\s[\]<>{}/%()]/.test(src[j])) j++;
                    yield { type: 'name', value: src.slice(i + 1, j) };
                    i = j; continue;
                }
                if (c === '(') {
                    let depth = 1, j = i + 1;
                    while (j < src.length && depth > 0) {
                        const cc = src[j];
                        if (cc === '\\') { j += 2; continue; }
                        if (cc === '(') depth++;
                        else if (cc === ')') depth--;
                        j++;
                    }
                    yield { type: 'string', value: src.slice(i + 1, j - 1) };
                    i = j; continue;
                }
                let j = i;
                while (j < src.length && !/[\s[\]<>{}/%()]/.test(src[j])) j++;
                if (j === i) { i++; continue; }
                const lex = src.slice(i, j);
                if (/^-?\d+(\.\d+)?$/.test(lex)) yield { type: 'num', value: parseFloat(lex) };
                else yield { type: 'op', value: lex };
                i = j;
            }
        }

        function decodeHexString(hex) {
            const trimmed = hex.replace(/\s+/g, '');
            if (trimmed.length & 1)
                throw new ParseError('fonts/tou-odd-hex',
                    'hex string in ToUnicode CMap must have even nibble count',
                    { context: { hex } });
            const bytes = new Uint8Array(trimmed.length / 2);
            for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(trimmed.substr(i * 2, 2), 16);
            return bytes;
        }

        function hexToCid(hex) {
            const trimmed = hex.replace(/\s+/g, '');
            return parseInt(trimmed, 16);
        }

        function utf16beBytesToString(bytes) {
            if (bytes.length & 1)
                throw new ParseError('fonts/tou-odd-utf16',
                    'ToUnicode UTF-16BE string has odd byte length',
                    { context: { length: bytes.length } });
            let s = '';
            for (let i = 0; i < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
            return s;
        }

        function parseToUnicode(src) {
            if (typeof src !== 'string')
                throw new ContractError('fonts/tou-bad-input', 'parseToUnicode expects a string', { context: { actual: typeof src } });
            const out = new Map();
            const stack = [];
            for (const tok of tokens(src)) {
                if (tok.type === 'op') {
                    switch (tok.value) {
                        case 'beginbfchar': stack.length = 0; break;
                        case 'endbfchar': {
                            for (let i = 0; i + 1 < stack.length; i += 2) {
                                const cid = hexToCid(stack[i].value);
                                const str = utf16beBytesToString(decodeHexString(stack[i + 1].value));
                                if (!Number.isNaN(cid)) out.set(cid, str);
                            }
                            stack.length = 0;
                            break;
                        }
                        case 'beginbfrange': stack.length = 0; break;
                        case 'endbfrange': {
                            let i = 0;
                            while (i + 2 < stack.length) {
                                const start = hexToCid(stack[i].value);
                                const end   = hexToCid(stack[i + 1].value);
                                const third = stack[i + 2];
                                if (third.type === '[') {
                                    const startIdx = i + 3;
                                    let endIdx = startIdx;
                                    while (endIdx < stack.length && stack[endIdx].type !== ']') endIdx++;
                                    const arr = stack.slice(startIdx, endIdx);
                                    for (let k = 0; k < arr.length; k++) {
                                        const str = utf16beBytesToString(decodeHexString(arr[k].value));
                                        out.set(start + k, str);
                                    }
                                    i = endIdx + 1;
                                } else {
                                    const baseBytes = decodeHexString(third.value);
                                    for (let c = start; c <= end; c++) {
                                        const bytes = new Uint8Array(baseBytes);
                                        const lastLo = bytes.length - 1;
                                        bytes[lastLo] = (bytes[lastLo] + (c - start)) & 0xFF;
                                        let carry = Math.floor((decodeHexString(third.value)[lastLo] + (c - start)) / 256);
                                        let pos = lastLo - 1;
                                        while (carry > 0 && pos >= 0) {
                                            const sum = bytes[pos] + carry;
                                            bytes[pos] = sum & 0xFF;
                                            carry = sum >>> 8;
                                            pos--;
                                        }
                                        out.set(c, utf16beBytesToString(bytes));
                                    }
                                    i += 3;
                                }
                            }
                            stack.length = 0;
                            break;
                        }
                        default: /* ignore */
                    }
                } else {
                    stack.push(tok);
                }
            }
            return out;
        }

        function stringToUtf16beHex(str) {
            let s = '';
            for (let i = 0; i < str.length; i++) {
                const c = str.charCodeAt(i);
                s += ((c >>> 8) & 0xFF).toString(16).padStart(2, '0');
                s +=  (c        & 0xFF).toString(16).padStart(2, '0');
            }
            return s.toUpperCase();
        }

        function cidToHex4(cid) {
            return cid.toString(16).padStart(4, '0').toUpperCase();
        }

        function cidToHex2(cid) {
            return cid.toString(16).padStart(2, '0').toUpperCase();
        }

        function advancesByOne(prev, curr) {
            if (prev.length !== curr.length) return false;
            if (prev.length === 0) return false;
            for (let i = 0; i < prev.length - 1; i++) if (prev.charCodeAt(i) !== curr.charCodeAt(i)) return false;
            return curr.charCodeAt(prev.length - 1) === ((prev.charCodeAt(prev.length - 1) + 1) & 0xFFFF);
        }

        function buildToUnicode(map, opts) {
            if (!(map instanceof Map))
                throw new ContractError('fonts/tou-bad-map', 'buildToUnicode expects a Map');
            opts = opts || {};
            const registry   = opts.registry   ?? 'Adobe';
            const ordering   = opts.ordering   ?? 'UCS';
            const supplement = opts.supplement ?? 0;
            const cmapName   = opts.cmapName   ?? 'Adobe-Identity-UCS';
            // Code width in bytes. ISO 32000-1 §9.10.3: "The CMap file shall
            // contain begincodespacerange and endcodespacerange operators that
            // are consistent with the encoding that the font uses. In
            // particular, for a simple font, the codespace shall be one byte
            // long." Default 2 (CID-keyed fonts) keeps the historical output.
            const codeBytes  = opts.codeBytes  ?? 2;
            if (codeBytes !== 1 && codeBytes !== 2)
                throw new ContractError('fonts/tou-bad-code-bytes',
                    'buildToUnicode opts.codeBytes must be 1 or 2',
                    { context: { codeBytes } });
            const hexCode = codeBytes === 1 ? cidToHex2 : cidToHex4;

            const entries = [...map.entries()].sort((a, b) => a[0] - b[0]);
            if (codeBytes === 1) {
                for (const [code] of entries) {
                    if (!Number.isInteger(code) || code < 0 || code > 0xFF)
                        throw new ContractError('fonts/tou-code-out-of-range',
                            'buildToUnicode codeBytes:1 requires source codes in 0x00..0xFF',
                            { context: { code } });
                }
            }
            const ranges = [];
            const singles = [];
            let i = 0;
            while (i < entries.length) {
                let j = i + 1;
                while (j < entries.length
                       && entries[j][0] === entries[j - 1][0] + 1
                       && advancesByOne(entries[j - 1][1], entries[j][1])) {
                    j++;
                }
                if (j - i > 1) ranges.push([entries[i][0], entries[j - 1][0], entries[i][1]]);
                else singles.push(entries[i]);
                i = j;
            }

            const lines = [];
            lines.push('/CIDInit /ProcSet findresource begin');
            lines.push('12 dict begin');
            lines.push('begincmap');
            lines.push('/CIDSystemInfo <<');
            lines.push(`  /Registry (${registry})`);
            lines.push(`  /Ordering (${ordering})`);
            lines.push(`  /Supplement ${supplement}`);
            lines.push('>> def');
            lines.push(`/CMapName /${cmapName} def`);
            lines.push('/CMapType 2 def');
            lines.push('1 begincodespacerange');
            lines.push(codeBytes === 1 ? '<00> <FF>' : '<0000> <FFFF>');
            lines.push('endcodespacerange');

            if (singles.length) {
                for (let k = 0; k < singles.length; k += 100) {
                    const chunk = singles.slice(k, k + 100);
                    lines.push(`${chunk.length} beginbfchar`);
                    for (const [cid, str] of chunk) {
                        lines.push(`<${hexCode(cid)}> <${stringToUtf16beHex(str)}>`);
                    }
                    lines.push('endbfchar');
                }
            }
            if (ranges.length) {
                for (let k = 0; k < ranges.length; k += 100) {
                    const chunk = ranges.slice(k, k + 100);
                    lines.push(`${chunk.length} beginbfrange`);
                    for (const [s, e, str] of chunk) {
                        lines.push(`<${hexCode(s)}> <${hexCode(e)}> <${stringToUtf16beHex(str)}>`);
                    }
                    lines.push('endbfrange');
                }
            }

            lines.push('endcmap');
            lines.push('CMapName currentdict /CMap defineresource pop');
            lines.push('end');
            lines.push('end');
            return lines.join('\n');
        }

        return { parseToUnicode, buildToUnicode };
    }
};
