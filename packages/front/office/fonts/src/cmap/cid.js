// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview CID CMap — Adobe Technical Note #5014 + ISO 32000-2
 * §9.7.5. The CMap of a composite (`Type0`) font maps its character codes
 * to CIDs, in the same textual language as a ToUnicode CMap
 * (`cmapToUnicode`) with other operators:
 *
 * ```
 *   N begincodespacerange  <lo> <hi> …            endcodespacerange
 *   N begincidrange        <lo> <hi> cid …        endcidrange
 *   N begincidchar         <code> cid …           endcidchar
 *   N beginnotdefrange     <lo> <hi> cid …        endnotdefrange
 *   N beginnotdefchar      <code> cid …           endnotdefchar
 *   /Parent-H usecmap
 *   /CMapName /Name-H def   /WMode 0 def
 * ```
 *
 * A code's byte length is its hex string's (`<41>` one byte, `<8140>`
 * two): a code is identified by its value AND its length. A range maps
 * its codes to consecutive CIDs from its own; a later definition wins
 * over an earlier one. A notdef range maps every code it holds to its one
 * CID, and is used only when no range holds the code.
 *
 * Factory output:
 *
 *  - `parseCidCMap(src)` → `{ name, wMode, useCMap, codespace, ranges,
 *    notdef }` (`codespace`: `{bytes, low, high}[]`; `ranges` and
 *    `notdef`: `{bytes, low, high, cid}[]`, in definition order);
 *  - `chain(base, own)` → the CMap `own` over its parent `base` (the
 *    parent's mappings first, so the child's win);
 *  - `cidOf(cmap, code, bytes)` → the CID of a `bytes` long code, or
 *    `null`.
 *
 * A `usecmap` is reported, not followed: the caller resolves the parent
 * (an embedded stream, a predefined CMap it knows) and chains it. A
 * malformed hex string is a `ParseError`; an operator this reader does
 * not know is skipped.
 *
 * Strict factory-only.
 *
 * @module fonts/cmap/cid
 */

import { fontErrors } from '../errors.js';

export const cmapCid = {
    name: 'cmapCid',
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
                    if (end < 0) throw new ParseError('fonts/cid-unterminated-hex', 'unterminated hex string in CMap');
                    yield { type: 'hex', value: src.slice(i + 1, end) };
                    i = end + 1; continue;
                }
                if (c === '[' || c === ']' || c === '{' || c === '}') { yield { type: c }; i++; continue; }
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

        /** A hex code: its value and its byte length. */
        function code(tok) {
            const hex = tok.value.replace(/\s+/g, '');
            if (hex.length === 0 || (hex.length & 1) || !/^[0-9A-Fa-f]+$/.test(hex))
                throw new ParseError('fonts/cid-bad-hex', 'a CMap code must be an even count of hex digits', { context: { hex } });
            return { bytes: hex.length / 2, value: parseInt(hex, 16) };
        }

        /** The `stack` read as groups of `size` operands, each passed to `take`. */
        function groups(stack, size, take) {
            for (let i = 0; i + size <= stack.length; i += size) take(stack.slice(i, i + size));
        }

        function parseCidCMap(src) {
            if (typeof src !== 'string')
                throw new ContractError('fonts/cid-bad-input', 'parseCidCMap expects a string', { context: { actual: typeof src } });
            const out = { name: null, wMode: 0, useCMap: null, codespace: [], ranges: [], notdef: [] };
            const range = (list) => ([lo, hi, cid]) => {
                if (lo.type !== 'hex' || hi.type !== 'hex' || cid.type !== 'num') return;
                const a = code(lo), b = code(hi);
                if (a.bytes === b.bytes && b.value >= a.value) list.push({ bytes: a.bytes, low: a.value, high: b.value, cid: cid.value });
            };
            const one = (list) => ([c, cid]) => {
                if (c.type !== 'hex' || cid.type !== 'num') return;
                const a = code(c);
                list.push({ bytes: a.bytes, low: a.value, high: a.value, cid: cid.value });
            };
            let stack = [];
            for (const tok of tokens(src)) {
                if (tok.type !== 'op') { stack.push(tok); continue; }
                switch (tok.value) {
                    case 'endcodespacerange':
                        groups(stack, 2, ([lo, hi]) => {
                            if (lo.type !== 'hex' || hi.type !== 'hex') return;
                            const a = code(lo), b = code(hi);
                            if (a.bytes === b.bytes) out.codespace.push({ bytes: a.bytes, low: a.value, high: b.value });
                        });
                        break;
                    case 'endcidrange': groups(stack, 3, range(out.ranges)); break;
                    case 'endcidchar': groups(stack, 2, one(out.ranges)); break;
                    case 'endnotdefrange': groups(stack, 3, range(out.notdef)); break;
                    case 'endnotdefchar': groups(stack, 2, one(out.notdef)); break;
                    case 'usecmap': {
                        const last = stack[stack.length - 1];
                        if (last && last.type === 'name') out.useCMap = last.value;
                        break;
                    }
                    case 'def': {
                        const [key, value] = stack.slice(-2);
                        if (key && key.type === 'name') {
                            if (key.value === 'CMapName' && value && value.type === 'name') out.name = value.value;
                            else if (key.value === 'WMode' && value && value.type === 'num') out.wMode = value.value;
                        }
                        break;
                    }
                    default: /* any other operator: its operands dropped */
                }
                stack = [];
            }
            return out;
        }

        function chain(base, own) {
            const seen = new Set();
            const codespace = [];
            for (const r of [...base.codespace, ...own.codespace]) {
                const k = `${r.bytes}:${r.low}:${r.high}`;
                if (!seen.has(k)) { seen.add(k); codespace.push(r); }
            }
            return {
                name: own.name, wMode: own.wMode, useCMap: base.useCMap, codespace,
                ranges: [...base.ranges, ...own.ranges], notdef: [...base.notdef, ...own.notdef]
            };
        }

        function cidOf(cmap, value, bytes) {
            for (let i = cmap.ranges.length - 1; i >= 0; i--) {
                const r = cmap.ranges[i];
                if (r.bytes === bytes && value >= r.low && value <= r.high) return r.cid + (value - r.low);
            }
            for (let i = cmap.notdef.length - 1; i >= 0; i--) {
                const r = cmap.notdef[i];
                if (r.bytes === bytes && value >= r.low && value <= r.high) return r.cid;
            }
            return null;
        }

        return { parseCidCMap, chain, cidOf };
    }
};
