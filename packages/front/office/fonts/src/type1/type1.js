// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Type 1 font programs (Adobe Type 1 Font Format), module
 * `fontType1`: `readType1(bytes, opts?)`.
 *
 *  - **Forms**: PFB (its `0x80` segments: ASCII, binary, end), PFA (the
 *    eexec section in hex), and a PDF `/FontFile` program (ISO 32000-2
 *    §9.9: the eexec section binary or hex, split at `opts.length1` when
 *    given, else after the `eexec` token; the trailer of zeros and
 *    `cleartomark` optional, `opts.length2` its end when given).
 *  - **eexec**: decrypted with key 55665, its first four bytes dropped.
 *    After an `eexec` token found by search, the white space before the
 *    section is skipped, unless reading it as the section's first byte
 *    decrypts to text and skipping it does not.
 *  - **The cleartext dict**: `FontName`, `FontMatrix`, `FontBBox`, the
 *    built-in `Encoding` (`StandardEncoding`, or the `dup <code> /<name>
 *    put` entries of its array).
 *  - **The Private dict**: `lenIV` (default 4, −1 for charstrings stored
 *    unencrypted), `Subrs`, and the `CharStrings` dict; the binary strings
 *    are read after whatever token the font names its `RD` procedure with.
 *  - **Result**: `{ fontName, fontMatrix, fontBBox, encoding, glyphNames,
 *    glyph(name) }`; `encoding` holds 256 glyph names, `null` for an empty
 *    (`.notdef`) slot; `glyph(name)` gives `{ name, advanceWidth,
 *    leftSideBearing, path }` (see `fontType1Charstring.draw`; `seac`
 *    drawn into the path), or `null` for a name the font lacks; it is
 *    computed on the first call and kept.
 *  - **Errors** (`ParseError`): `fonts/type1-not-type1` (neither a PFB nor
 *    text starting `%!`), `fonts/type1-no-eexec`, `fonts/type1-bad-dict`
 *    (no `CharStrings` dict, or a binary string past the end); a glyph's
 *    charstring throws its error on `glyph(name)`, not on the read. Bytes
 *    that are not a `Uint8Array` throw `ContractError`
 *    `fonts/type1-bad-input`.
 *
 * Strict factory body, capture-free, worker-safe.
 *
 * @module fonts/type1/type1
 */

import { fontErrors } from '../errors.js';
import { encodingStandard } from '../encodings/standard.js';
import { fontType1Charstring } from './charstring.js';

export const fontType1 = {
    name: 'fontType1',
    dependencies: ['fontErrors', 'encodingStandard', 'fontType1Charstring'],
    deps: [fontErrors, encodingStandard, fontType1Charstring],
    factory(errors, standard, charstring) {
        const { ParseError, ContractError } = errors;
        const { STANDARD } = standard;
        const { decrypt, draw } = charstring;

        const isWs = (c) => c === 0x20 || c === 0x0A || c === 0x0D || c === 0x09 || c === 0x0C || c === 0x00;
        const isDelim = (c) => c === 0x28 || c === 0x29 || c === 0x3C || c === 0x3E || c === 0x5B || c === 0x5D || c === 0x7B || c === 0x7D || c === 0x2F || c === 0x25;
        const hexVal = (c) => (c >= 0x30 && c <= 0x39 ? c - 0x30 : c >= 0x41 && c <= 0x46 ? c - 55 : c >= 0x61 && c <= 0x66 ? c - 87 : -1);
        const text = (b, from, to) => String.fromCharCode(...b.subarray(from, to));

        /** The first index of the ASCII `needle` in `b` at or after `from`, or -1. */
        function find(b, needle, from = 0, to = b.length) {
            const n = needle.length;
            outer: for (let i = from; i + n <= to; i++) {
                for (let k = 0; k < n; k++) if (b[i + k] !== needle.charCodeAt(k)) continue outer;
                return i;
            }
            return -1;
        }

        /** `{ clear, cipher }` of a PFB. */
        function splitPfb(b) {
            const clear = [], cipher = [];
            let p = 0;
            while (p + 1 < b.length && b[p] === 0x80) {
                const type = b[p + 1];
                if (type === 3) break;
                if (p + 6 > b.length) break;
                const len = (b[p + 2] | (b[p + 3] << 8) | (b[p + 4] << 16) | (b[p + 5] << 24)) >>> 0;
                const seg = b.subarray(p + 6, Math.min(b.length, p + 6 + len));
                if (type === 2) cipher.push(seg);
                else if (cipher.length === 0) clear.push(seg);
                p += 6 + len;
            }
            return { clear: join(clear), cipher: join(cipher), binary: true };
        }

        function join(parts) {
            const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
            let p = 0;
            for (const x of parts) { out.set(x, p); p += x.length; }
            return out;
        }

        /** True when the first `n` bytes of `b` are all hex digits. */
        function looksHex(b, at) {
            let seen = 0;
            for (let i = at; i < b.length && seen < 4; i++) {
                if (isWs(b[i])) continue;
                if (hexVal(b[i]) < 0) return false;
                seen++;
            }
            return seen === 4;
        }

        function dehex(b, at, to) {
            const out = [];
            let hi = -1;
            for (let i = at; i < to; i++) {
                const c = b[i];
                if (isWs(c)) continue;
                const v = hexVal(c);
                if (v < 0) break;
                if (hi < 0) hi = v; else { out.push((hi << 4) | v); hi = -1; }
            }
            return new Uint8Array(out);
        }

        /** The share of printable ASCII in the first plain bytes of a cipher starting at `at`. */
        function textScore(b, at, binary) {
            const sample = binary ? b.subarray(at, Math.min(b.length, at + 68)) : dehex(b, at, Math.min(b.length, at + 140));
            const plain = decrypt(sample, 55665, 4);
            if (plain.length === 0) return 0;
            let ok = 0;
            for (const c of plain) if ((c >= 0x20 && c < 0x7F) || c === 0x0A || c === 0x0D || c === 0x09) ok++;
            return ok / plain.length;
        }

        /** `{ clear, cipher, binary }` of a PFA or a PDF form. */
        function splitText(b, opts) {
            const l1 = opts && Number.isInteger(opts.length1) ? opts.length1 : -1;
            const l2 = opts && Number.isInteger(opts.length2) ? opts.length2 : -1;
            if (l1 > 0 && l1 < b.length && find(b, 'eexec', Math.max(0, l1 - 32), l1) >= 0) {
                const end = l2 > 0 ? Math.min(b.length, l1 + l2) : b.length;
                const binary = !looksHex(b, l1);
                return { clear: b.subarray(0, l1), cipher: binary ? b.subarray(l1, end) : dehex(b, l1, end), binary };
            }
            const e = find(b, 'eexec');
            if (e < 0) throw new ParseError('fonts/type1-no-eexec', 'no eexec section in the Type 1 program');
            let at = e + 5;
            const candidates = [at];
            while (at < b.length && isWs(b[at]) && candidates.length < 4) candidates.push(++at);
            // Skip the white space unless a byte of it is the section's start.
            let start = candidates[candidates.length - 1];
            const binary = !looksHex(b, start);
            if (binary) {
                const best = textScore(b, start, true);
                for (let k = candidates.length - 2; k >= 1; k--) {
                    if (textScore(b, candidates[k], true) > best + 0.25) { start = candidates[k]; break; }
                }
            }
            return { clear: b.subarray(0, e + 5), cipher: binary ? b.subarray(start) : dehex(b, start, b.length), binary };
        }

        // ── a small PostScript tokenizer over the decrypted bytes ─────────
        /** The next token from `p`: `{ kind, value, start, end }`, or null at the end. */
        function token(b, p) {
            while (p < b.length) {
                const c = b[p];
                if (isWs(c)) { p++; continue; }
                if (c === 0x25) { while (p < b.length && b[p] !== 0x0A && b[p] !== 0x0D) p++; continue; }
                break;
            }
            if (p >= b.length) return null;
            const start = p;
            const c = b[p];
            if (c === 0x28) { // (string)
                let depth = 0;
                for (; p < b.length; p++) {
                    if (b[p] === 0x5C) { p++; continue; }
                    if (b[p] === 0x28) depth++;
                    else if (b[p] === 0x29 && --depth === 0) { p++; break; }
                }
                return { kind: 'string', value: text(b, start + 1, p - 1), start, end: p };
            }
            if (c === 0x5B || c === 0x5D || c === 0x7B || c === 0x7D) return { kind: 'punct', value: String.fromCharCode(c), start, end: p + 1 };
            if (c === 0x3C || c === 0x3E) { // << >> or a hex string
                if (b[p + 1] === c) return { kind: 'punct', value: c === 0x3C ? '<<' : '>>', start, end: p + 2 };
                if (c === 0x3C) { while (p < b.length && b[p] !== 0x3E) p++; return { kind: 'hexstring', value: '', start, end: p + 1 }; }
                return { kind: 'punct', value: '>', start, end: p + 1 };
            }
            if (c === 0x2F) p++;
            while (p < b.length && !isWs(b[p]) && !(isDelim(b[p]) && p > start + (c === 0x2F ? 1 : 0))) p++;
            if (p === start) p++;
            const raw = text(b, start, p);
            if (c === 0x2F) return { kind: 'name', value: raw.slice(1), start, end: p };
            const n = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(raw) ? Number(raw) : /^\d+#[0-9A-Za-z]+$/.test(raw) ? parseInt(raw.split('#')[1], Number(raw.split('#')[0])) : NaN;
            return Number.isFinite(n) ? { kind: 'number', value: n, start, end: p } : { kind: 'word', value: raw, start, end: p };
        }

        /** The numbers of the array or procedure starting at the token at `p`. */
        function numbers(b, p) {
            const open = token(b, p);
            if (!open || (open.value !== '[' && open.value !== '{')) return null;
            const out = [];
            let t = token(b, open.end);
            while (t && t.value !== ']' && t.value !== '}') {
                if (t.kind === 'number') out.push(t.value);
                t = token(b, t.end);
            }
            return out;
        }

        /** The token after the name token `/key` at the top of `b`, searched from `from`. */
        function afterKey(b, key, from = 0) {
            let p = from;
            for (;;) {
                const at = find(b, `/${key}`, p);
                if (at < 0) return null;
                const end = at + key.length + 1;
                if (end >= b.length || isWs(b[end]) || isDelim(b[end])) return end;
                p = end;
            }
        }

        function readEncoding(b) {
            const at = afterKey(b, 'Encoding');
            if (at === null) return STANDARD.map((n) => (n === '.notdef' ? null : n));
            const first = token(b, at);
            if (first && first.kind === 'word' && first.value === 'StandardEncoding') return STANDARD.map((n) => (n === '.notdef' ? null : n));
            const enc = new Array(256).fill(null);
            // dup <code> /<name> put … until the def that ends the array
            let t = first, depth = 0;
            const win = [];
            while (t) {
                if (t.value === '{') depth++;
                else if (t.value === '}') depth--;
                else if (depth === 0 && t.kind === 'word' && t.value === 'def') break;
                if (depth === 0) {
                    win.push(t);
                    if (win.length > 4) win.shift();
                    if (win.length === 4 && win[0].value === 'dup' && win[1].kind === 'number' && win[2].kind === 'name' && win[3].value === 'put') {
                        const code = win[1].value;
                        if (Number.isInteger(code) && code >= 0 && code < 256) enc[code] = win[2].value === '.notdef' ? null : win[2].value;
                    }
                }
                t = token(b, t.end);
            }
            return enc;
        }

        /**
         * The binary string after `len RD`: `[bytes, end]`. The string starts
         * one byte past the RD token.
         */
        function binaryAfter(b, rd, len) {
            const from = rd.end + 1, to = from + len;
            if (len < 0 || to > b.length) throw new ParseError('fonts/type1-bad-dict', `a binary string past the end of the Private dict (${len} bytes at ${from})`);
            return [b.subarray(from, to), to];
        }

        function readPrivate(b) {
            let lenIV = 4;
            const li = afterKey(b, 'lenIV');
            if (li !== null) { const t = token(b, li); if (t && t.kind === 'number' && Number.isInteger(t.value)) lenIV = t.value; }
            const subrs = [];
            const si = afterKey(b, 'Subrs');
            let p = 0;
            if (si !== null) {
                const n = token(b, si);
                const arr = n && token(b, n.end);
                if (n && n.kind === 'number' && arr && arr.value === 'array') {
                    p = arr.end;
                    for (;;) {
                        const dup = token(b, p);
                        if (!dup || dup.value !== 'dup') break;
                        const idx = token(b, dup.end), len = idx && token(b, idx.end), rd = len && token(b, len.end);
                        if (!rd || idx.kind !== 'number' || len.kind !== 'number') break;
                        const [bytes, end] = binaryAfter(b, rd, len.value);
                        if (Number.isInteger(idx.value) && idx.value >= 0 && idx.value < 65536) subrs[idx.value] = bytes;
                        p = end;
                        // NP, |, or noaccess put
                        let t = token(b, p);
                        while (t && t.kind === 'word' && t.value !== 'dup' && (t.value === 'NP' || t.value === '|' || t.value === 'noaccess' || t.value === 'put' || t.value === 'readonly')) { p = t.end; t = token(b, p); }
                    }
                }
            }
            const ci = afterKey(b, 'CharStrings', p);
            if (ci === null) throw new ParseError('fonts/type1-bad-dict', 'no CharStrings dict in the Type 1 program');
            const charStrings = new Map();
            let t = token(b, ci);
            while (t && !(t.kind === 'word' && t.value === 'begin')) t = token(b, t.end);
            if (!t) throw new ParseError('fonts/type1-bad-dict', 'the CharStrings dict does not begin');
            p = t.end;
            for (;;) {
                const nm = token(b, p);
                if (!nm || nm.kind !== 'name') break;
                const len = token(b, nm.end), rd = len && token(b, len.end);
                if (!rd || len.kind !== 'number') break;
                const [bytes, end] = binaryAfter(b, rd, len.value);
                if (!charStrings.has(nm.value)) charStrings.set(nm.value, bytes);
                p = end;
                let u = token(b, p);
                while (u && u.kind === 'word' && u.value !== 'end' && (u.value === 'ND' || u.value === '|-' || u.value === 'noaccess' || u.value === 'def' || u.value === 'readonly')) { p = u.end; u = token(b, p); }
            }
            return { lenIV, subrs, charStrings };
        }

        /**
         * @param {Uint8Array} bytes
         * @param {{ length1?: number, length2?: number }} [opts]
         */
        function readType1(bytes, opts) {
            if (!(bytes instanceof Uint8Array)) throw new ContractError('fonts/type1-bad-input', 'readType1 takes a Uint8Array');
            let s = 0;
            while (s < bytes.length && isWs(bytes[s])) s++;
            let parts;
            if (bytes[0] === 0x80) parts = splitPfb(bytes);
            else if (bytes[s] === 0x25 && bytes[s + 1] === 0x21) parts = splitText(bytes, opts);
            else throw new ParseError('fonts/type1-not-type1', 'not a Type 1 program (neither a PFB nor text starting %!)');
            const { clear, cipher } = parts;
            if (cipher.length < 4) throw new ParseError('fonts/type1-no-eexec', 'no eexec section in the Type 1 program');
            const plain = decrypt(cipher, 55665, 4);
            const priv = readPrivate(plain);

            const fnAt = afterKey(clear, 'FontName');
            const fn = fnAt !== null ? token(clear, fnAt) : null;
            const fmAt = afterKey(clear, 'FontMatrix');
            const fbAt = afterKey(clear, 'FontBBox');
            const fontMatrix = (fmAt !== null && numbers(clear, fmAt)) || [0.001, 0, 0, 0.001, 0, 0];
            const fontBBox = (fbAt !== null && numbers(clear, fbAt)) || [0, 0, 0, 0];

            const plainOf = new Map();
            const dec = (c) => (priv.lenIV < 0 ? c : decrypt(c, 4330, priv.lenIV));
            const subrs = Array.from(priv.subrs, (c) => (c ? dec(c) : null));
            const charstringOf = (name) => {
                const c = priv.charStrings.get(name);
                if (!c) return null;
                if (!plainOf.has(name)) plainOf.set(name, dec(c));
                return plainOf.get(name);
            };
            const cache = new Map();
            function glyph(name) {
                if (cache.has(name)) return cache.get(name);
                const c = charstringOf(name);
                const g = c ? { name, ...draw(c, { subrs, glyph: charstringOf }) } : null;
                cache.set(name, g);
                return g;
            }
            return {
                fontName: fn && (fn.kind === 'name' || fn.kind === 'string') ? fn.value : null,
                fontMatrix: fontMatrix.length === 6 ? fontMatrix : [0.001, 0, 0, 0.001, 0, 0],
                fontBBox: fontBBox.length === 4 ? fontBBox : [0, 0, 0, 0],
                encoding: readEncoding(clear),
                glyphNames: [...priv.charStrings.keys()],
                glyph
            };
        }

        return { readType1 };
    }
};
