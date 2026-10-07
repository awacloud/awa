// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview PDF tokenizer — splits a `Uint8Array` of PDF source into
 * a stream of tokens per ISO 32000-2:2020 §7.2 (Lexical conventions).
 *
 * Tokens emitted (kind → payload):
 *
 * | kind         | payload                                        |
 * |--------------|------------------------------------------------|
 * | `'ws'`       | whitespace run (only when `keepWhitespace`)    |
 * | `'comment'`  | comment body (bytes between `%` and EOL)       |
 * | `'name'`     | name string, `#xx` hex-escapes decoded         |
 * | `'int'`      | parsed JS number (safe integer)                |
 * | `'real'`     | parsed JS number (float)                       |
 * | `'string'`   | literal string `(...)` decoded → Uint8Array    |
 * | `'hex'`      | hex string `<...>` decoded → Uint8Array        |
 * | `'open_arr'` | `[`                                            |
 * | `'close_arr'`| `]`                                            |
 * | `'open_dict'`| `<<`                                           |
 * | `'close_dict'`| `>>`                                          |
 * | `'kw'`       | keyword bytes as ASCII string                  |
 * | `'eof_marker'`| `%%EOF`                                       |
 *
 * @module pdf/syntax/tokenizer
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfShared } from '../_shared/index.js';

export const pdfTokenizer = {
    name: 'pdfTokenizer',
    dependencies: ['pdfErrors', 'pdfShared'],
    deps: [pdfErrors, pdfShared],
    factory(errors, shared) {
        const { ParseError } = errors;
        const { ASCII, isWs, isEol, isDigit, isRegular, hexNibble } = shared;
        const {
            HT, LF, CR, FF,
            LPAREN, RPAREN, LANGLE, RANGLE, LBRACK, RBRACK,
            SLASH, PERCENT, BACKSLASH,
            PLUS, MINUS, DOT,
            ZERO,
            HASH
        } = ASCII;

        function tokenize(bytes, opts) {
            if (!(bytes instanceof Uint8Array)) {
                throw new ParseError('pdf/tokenizer/bad-input',
                    'tokenize() expects a Uint8Array', { context: { typeof: typeof bytes } });
            }
            const keepWs = !!(opts && opts.keepWhitespace);
            let i  = (opts && opts.start | 0) || 0;
            const N = (opts && Number.isFinite(opts.end))
                ? Math.min(opts.end | 0, bytes.length) : bytes.length;
            let lookahead = null;

            function pos() { return i; }
            function seek(n) {
                if (n < 0 || n > bytes.length) {
                    throw new ParseError('pdf/tokenizer/bad-seek',
                        'seek out of range', { context: { offset: n, total: bytes.length } });
                }
                i = n; lookahead = null;
            }

            function readName() {
                const start = i;
                i++;
                const out = [];
                while (i < N) {
                    const b = bytes[i];
                    if (!isRegular(b)) break;
                    if (b === HASH) {
                        if (i + 2 >= N) {
                            throw new ParseError('pdf/tokenizer/bad-name-escape',
                                'truncated #xx escape in name', { context: { offset: i } });
                        }
                        const hi = hexNibble(bytes[i + 1]);
                        const lo = hexNibble(bytes[i + 2]);
                        if (hi < 0 || lo < 0) {
                            throw new ParseError('pdf/tokenizer/bad-name-escape',
                                'invalid hex digits in name escape', { context: { offset: i } });
                        }
                        out.push((hi << 4) | lo);
                        i += 3;
                    } else {
                        out.push(b); i++;
                    }
                }
                const value = new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(out));
                return { kind: 'name', value, offset: start, end: i };
            }

            function readNumber() {
                const start = i;
                let isReal = false;
                if (bytes[i] === PLUS || bytes[i] === MINUS) i++;
                while (i < N) {
                    const b = bytes[i];
                    if (isDigit(b)) { i++; continue; }
                    if (b === DOT && !isReal) { isReal = true; i++; continue; }
                    break;
                }
                const raw = new TextDecoder('latin1').decode(bytes.subarray(start, i));
                if (raw === '' || raw === '+' || raw === '-' || raw === '.') {
                    throw new ParseError('pdf/tokenizer/bad-number',
                        'empty number token', { context: { offset: start } });
                }
                const n = Number(raw);
                if (!Number.isFinite(n)) {
                    throw new ParseError('pdf/tokenizer/bad-number',
                        'cannot parse number', { context: { raw, offset: start } });
                }
                return { kind: isReal ? 'real' : 'int', value: n, offset: start, end: i, raw };
            }

            function readLiteralString() {
                const start = i;
                i++;
                const out = [];
                let depth = 1;
                while (i < N && depth > 0) {
                    const b = bytes[i];
                    if (b === LPAREN) { depth++; out.push(b); i++; continue; }
                    if (b === RPAREN) { depth--; if (depth === 0) { i++; break; } out.push(b); i++; continue; }
                    if (b === BACKSLASH) {
                        if (i + 1 >= N) {
                            throw new ParseError('pdf/tokenizer/bad-string',
                                'trailing backslash in literal string', { context: { offset: i } });
                        }
                        const nxt = bytes[i + 1];
                        if (nxt === LF)        { i += 2; continue; }
                        if (nxt === CR) {
                            i += 2;
                            if (i < N && bytes[i] === LF) i++;
                            continue;
                        }
                        if (nxt === 0x6E) { out.push(LF); i += 2; continue; }
                        if (nxt === 0x72) { out.push(CR); i += 2; continue; }
                        if (nxt === 0x74) { out.push(HT); i += 2; continue; }
                        if (nxt === 0x62) { out.push(0x08); i += 2; continue; }
                        if (nxt === 0x66) { out.push(FF); i += 2; continue; }
                        if (nxt === LPAREN || nxt === RPAREN || nxt === BACKSLASH) {
                            out.push(nxt); i += 2; continue;
                        }
                        if (nxt >= ZERO && nxt <= ZERO + 7) {
                            let v = 0, k = 0;
                            i++;
                            while (k < 3 && i < N && bytes[i] >= ZERO && bytes[i] <= ZERO + 7) {
                                v = (v << 3) | (bytes[i] - ZERO);
                                i++; k++;
                            }
                            out.push(v & 0xFF);
                            continue;
                        }
                        i++;
                        continue;
                    }
                    if (b === CR) {
                        out.push(LF);
                        i++;
                        if (i < N && bytes[i] === LF) i++;
                        continue;
                    }
                    out.push(b); i++;
                }
                if (depth !== 0) {
                    throw new ParseError('pdf/tokenizer/unterminated-string',
                        'literal string was not closed', { context: { offset: start } });
                }
                return { kind: 'string', value: Uint8Array.from(out), offset: start, end: i };
            }

            function readHexString() {
                const start = i;
                i++;
                const nibbles = [];
                while (i < N) {
                    const b = bytes[i];
                    if (b === RANGLE) { i++; break; }
                    if (isWs(b)) { i++; continue; }
                    const v = hexNibble(b);
                    if (v < 0) {
                        throw new ParseError('pdf/tokenizer/bad-hex',
                            'non-hex byte in hex string', { context: { offset: i, byte: b } });
                    }
                    nibbles.push(v); i++;
                }
                if (nibbles.length % 2 === 1) nibbles.push(0);
                const out = new Uint8Array(nibbles.length / 2);
                for (let k = 0; k < out.length; k++)
                    out[k] = (nibbles[2 * k] << 4) | nibbles[2 * k + 1];
                return { kind: 'hex', value: out, offset: start, end: i };
            }

            function readKeyword() {
                const start = i;
                while (i < N && isRegular(bytes[i])) i++;
                const raw = new TextDecoder('latin1').decode(bytes.subarray(start, i));
                if (raw === '') {
                    throw new ParseError('pdf/tokenizer/empty-keyword',
                        'empty keyword', { context: { offset: start } });
                }
                return { kind: 'kw', value: raw, offset: start, end: i };
            }

            function next() {
                if (lookahead) { const t = lookahead; lookahead = null; return t; }
                while (i < N) {
                    const b = bytes[i];
                    if (isWs(b)) {
                        if (keepWs) {
                            const start = i;
                            while (i < N && isWs(bytes[i])) i++;
                            return { kind: 'ws', offset: start, end: i };
                        }
                        i++; continue;
                    }
                    if (b === PERCENT) {
                        if (i + 4 < N
                            && bytes[i + 1] === PERCENT
                            && bytes[i + 2] === 0x45
                            && bytes[i + 3] === 0x4F
                            && bytes[i + 4] === 0x46) {
                            const start = i;
                            i += 5;
                            return { kind: 'eof_marker', offset: start, end: i };
                        }
                        while (i < N && !isEol(bytes[i])) i++;
                        if (i < N && bytes[i] === CR) i++;
                        if (i < N && bytes[i] === LF) i++;
                        continue;
                    }
                    break;
                }
                if (i >= N) return null;

                const b = bytes[i];
                if (b === SLASH) return readName();
                if (b === LBRACK) { const off = i++; return { kind: 'open_arr', offset: off, end: i }; }
                if (b === RBRACK) { const off = i++; return { kind: 'close_arr', offset: off, end: i }; }
                if (b === LANGLE) {
                    if (i + 1 < N && bytes[i + 1] === LANGLE) {
                        const off = i; i += 2;
                        return { kind: 'open_dict', offset: off, end: i };
                    }
                    return readHexString();
                }
                if (b === RANGLE) {
                    if (i + 1 < N && bytes[i + 1] === RANGLE) {
                        const off = i; i += 2;
                        return { kind: 'close_dict', offset: off, end: i };
                    }
                    throw new ParseError('pdf/tokenizer/unexpected-rangle',
                        'lone > outside hex string', { context: { offset: i } });
                }
                if (b === LPAREN) return readLiteralString();
                if (b === PLUS || b === MINUS || b === DOT || isDigit(b)) return readNumber();
                return readKeyword();
            }

            function peek() {
                if (!lookahead) lookahead = next();
                return lookahead;
            }

            return { next, peek, pos, seek, bytes };
        }

        function lastIndexOfBytes(bytes, needle, from) {
            const N = bytes.length, M = needle.length;
            if (M === 0 || M > N) return -1;
            let start = Number.isFinite(from) ? Math.min(from | 0, N - M) : N - M;
            outer: for (let i = start; i >= 0; i--) {
                for (let k = 0; k < M; k++) if (bytes[i + k] !== needle[k]) continue outer;
                return i;
            }
            return -1;
        }

        return { tokenize, lastIndexOfBytes };
    }
};
