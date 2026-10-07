// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview ByteRange computation around a signature's `/Contents`
 * hex string.
 *
 * ISO 32000-2:2020 §12.8.1 — a signature dictionary's `/ByteRange` is
 * an array `[a b c d]` of four integers selecting the two byte ranges
 * `[a, a+b)` and `[c, c+d)` of the document. The gap `[a+b, c)` between
 * them holds the `/Contents` value, the PKCS#7 / CMS blob; its bytes are
 * excluded from the signature digest — otherwise the digest would have
 * to depend on its own value.
 *
 * Gap forms. ISO 32000-2 §12.8.3.3.1 requires the `/Contents`
 * hex string, "with "<" and ">" delimiters", to "fit precisely in the
 * space between the ranges": the gap is the whole `<…>` token — form
 * (b), `gapForm: 'token'`, what `pdfSign` emits and what PDFBox and
 * pyHanko emit and check. Signatures earlier `pdfSign` releases
 * produced left out the hex digits only — form (a), `gapForm: 'digits'`.
 * `auditByteRange` accepts exactly these two gaps.
 *
 * @module pdf/sig/byteRange
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';

export const pdfByteRange = {
    name: 'pdfByteRange',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],
    factory(errors) {
        const { ParseError } = errors;

        const CONTENTS_KEY = new Uint8Array([
            0x2F, 0x43, 0x6F, 0x6E, 0x74, 0x65, 0x6E, 0x74, 0x73   // /Contents
        ]);
        const ENDOBJ = new Uint8Array([0x65, 0x6E, 0x64, 0x6F, 0x62, 0x6A]);

        function _indexOfBytes(haystack, needle, from, to) {
            const n = needle.length;
            const limit = to - n;
            outer: for (let i = from; i <= limit; i++) {
                for (let k = 0; k < n; k++) {
                    if (haystack[i + k] !== needle[k]) continue outer;
                }
                return i;
            }
            return -1;
        }

        function _findEndobj(bytes, from) {
            const at = _indexOfBytes(bytes, ENDOBJ, from, bytes.length);
            return at < 0 ? bytes.length : at;
        }

        function _isWhitespace(b) {
            return b === 0x00 || b === 0x09 || b === 0x0A || b === 0x0C
                || b === 0x0D || b === 0x20;
        }

        /**
         * `[0, gapStart, gapEnd, total - gapEnd]` around a `/Contents` value.
         *
         * Without `opts` the gap is `[contentsOffset, contentsOffset +
         * contentsLength)` — whatever span the caller passes (historically
         * the hex digits, form a). With `opts.token` the gap is that token
         * span instead (form b): it must enclose the digit span by exactly
         * one byte on each side, and those two bytes must be `<` and `>`.
         *
         * @throws {ParseError} `pdf/sig/byterange/bad-input`, `bad-offset`,
         *   `bad-length`, `overflow`; `bad-token` when `opts.token` is not
         *   the `<…>` token around the digit span.
         */
        function computeByteRange(documentBytes, contentsOffset, contentsLength, opts) {
            if (!(documentBytes instanceof Uint8Array)) {
                throw new ParseError('pdf/sig/byterange/bad-input',
                    'documentBytes must be a Uint8Array');
            }
            const total = documentBytes.length;
            if (!Number.isInteger(contentsOffset) || contentsOffset < 0
                || contentsOffset > total) {
                throw new ParseError('pdf/sig/byterange/bad-offset',
                    'contentsOffset out of range',
                    { context: { contentsOffset, total } });
            }
            if (!Number.isInteger(contentsLength) || contentsLength < 0) {
                throw new ParseError('pdf/sig/byterange/bad-length',
                    'contentsLength must be a non-negative integer',
                    { context: { contentsLength } });
            }
            const end = contentsOffset + contentsLength;
            if (end > total) {
                throw new ParseError('pdf/sig/byterange/overflow',
                    '/Contents extends past end of document',
                    { context: { end, total } });
            }
            if (opts && opts.token) {
                const tOff = opts.token.offset;
                const tLen = opts.token.length;
                const tEnd = tOff + tLen;
                if (!Number.isInteger(tOff) || !Number.isInteger(tLen)
                    || tOff !== contentsOffset - 1 || tEnd !== end + 1
                    || tOff < 0 || tEnd > total
                    || documentBytes[tOff] !== 0x3C             // '<'
                    || documentBytes[tEnd - 1] !== 0x3E) {      // '>'
                    throw new ParseError('pdf/sig/byterange/bad-token',
                        'token span must be the "<…>" token enclosing the '
                            + '/Contents hex digits',
                        { context: { token: { offset: tOff, length: tLen },
                                     contentsOffset, contentsLength } });
                }
                return [0, tOff, tEnd, total - tEnd];
            }
            return [0, contentsOffset, end, total - end];
        }

        function extractSignedBytes(documentBytes, byteRange) {
            if (!(documentBytes instanceof Uint8Array)) {
                throw new ParseError('pdf/sig/byterange/bad-input',
                    'documentBytes must be a Uint8Array');
            }
            if (!byteRange || byteRange.length !== 4) {
                throw new ParseError('pdf/sig/byterange/bad-shape',
                    'byteRange must have 4 entries',
                    { context: { length: byteRange && byteRange.length } });
            }
            const a = byteRange[0] | 0;
            const b = byteRange[1] | 0;
            const c = byteRange[2] | 0;
            const d = byteRange[3] | 0;
            if (a < 0 || b < 0 || c < 0 || d < 0
                || a + b > documentBytes.length
                || c + d > documentBytes.length
                || c < a + b) {
                throw new ParseError('pdf/sig/byterange/inconsistent',
                    'byteRange entries inconsistent with documentBytes',
                    { context: { a, b, c, d, total: documentBytes.length } });
            }
            const out = new Uint8Array(b + d);
            out.set(documentBytes.subarray(a, a + b), 0);
            out.set(documentBytes.subarray(c, c + d), b);
            return out;
        }

        /**
         * Non-throwing `/ByteRange` audit.
         *
         * With `opts.contents` (the hex-digit span `findContentsField`
         * returns), the gap must be exactly the `<…>` token (form b) or
         * exactly the digits (form a); any other gap yields
         * `gap-start-mismatch` / `gap-end-mismatch`, measured against the
         * token bounds. `gapForm` names the accepted form: `'token'`,
         * `'digits'`, or `null` (no `opts.contents`, or neither form).
         *
         * @returns {{ok: boolean, issues: Array<{code: string, message: string,
         *   context: object}>, gapForm: ('token'|'digits'|null)}}
         * @throws {ParseError} `pdf/sig/byterange/bad-input`, `bad-shape`.
         */
        function auditByteRange(documentBytes, byteRange, opts) {
            if (!(documentBytes instanceof Uint8Array)) {
                throw new ParseError('pdf/sig/byterange/bad-input',
                    'documentBytes must be a Uint8Array');
            }
            if (!byteRange || byteRange.length !== 4) {
                throw new ParseError('pdf/sig/byterange/bad-shape',
                    'byteRange must have 4 entries',
                    { context: { length: byteRange && byteRange.length } });
            }
            const issues = [];
            const a = byteRange[0] | 0;
            const b = byteRange[1] | 0;
            const c = byteRange[2] | 0;
            const d = byteRange[3] | 0;
            const total = documentBytes.length;
            if (a !== 0) {
                issues.push({
                    code: 'pdf/sig/byterange/non-zero-start',
                    message: 'first range does not start at offset 0',
                    context: { a }
                });
            }
            if (c < a + b) {
                issues.push({
                    code: 'pdf/sig/byterange/self-overlap',
                    message: 'second range starts before first range ends',
                    context: { firstEnd: a + b, secondStart: c }
                });
            }
            if (a + b > total || c + d > total) {
                issues.push({
                    code: 'pdf/sig/byterange/out-of-bounds',
                    message: 'range extends past document end',
                    context: { firstEnd: a + b, secondEnd: c + d, total }
                });
            }
            let gapForm = null;
            if (opts && opts.contents) {
                const cOff = opts.contents.offset | 0;
                const cLen = opts.contents.length | 0;
                // Form (b): the whole `<…>` token. Form (a): the digits.
                const expectedGapStart = cOff - 1;
                const expectedGapEnd   = cOff + cLen + 1;
                if (a + b === expectedGapStart && c === expectedGapEnd) {
                    gapForm = 'token';
                } else if (a + b === cOff && c === cOff + cLen) {
                    gapForm = 'digits';
                }
                // Any other gap is refused, measured against form (b).
                if (gapForm === null && a + b !== expectedGapStart) {
                    issues.push({
                        code: 'pdf/sig/byterange/gap-start-mismatch',
                        message: 'first range end does not align with /Contents '
                            + 'literal start',
                        context: { firstEnd: a + b, expected: expectedGapStart }
                    });
                }
                if (gapForm === null && c !== expectedGapEnd) {
                    issues.push({
                        code: 'pdf/sig/byterange/gap-end-mismatch',
                        message: 'second range start does not align with /Contents '
                            + 'literal end',
                        context: { secondStart: c, expected: expectedGapEnd }
                    });
                }
            }
            if (opts && Array.isArray(opts.others)) {
                for (let i = 0; i < opts.others.length; i++) {
                    const other = opts.others[i];
                    if (!other || other.length !== 4) continue;
                    const r1 = [[a, a + b], [c, c + d]];
                    const oa = other[0] | 0, ob = other[1] | 0;
                    const oc = other[2] | 0, od = other[3] | 0;
                    const r2 = [[oa, oa + ob], [oc, oc + od]];
                    for (const s of r1) {
                        for (const t of r2) {
                            if (s[0] < t[1] && t[0] < s[1]) {
                                issues.push({
                                    code: 'pdf/sig/byterange/cross-overlap',
                                    message: 'byteRange overlaps with another '
                                        + 'signature ByteRange',
                                    context: { thisRange: s, otherRange: t,
                                               otherIndex: i }
                                });
                            }
                        }
                    }
                }
            }
            if (opts && opts.requireFullCoverage && c + d !== total) {
                issues.push({
                    code: 'pdf/sig/byterange/incomplete-coverage',
                    message: 'byteRange does not cover the document up to its end',
                    context: { secondEnd: c + d, total }
                });
            }
            return { ok: issues.length === 0, issues, gapForm };
        }

        function findContentsField(documentBytes, sigObjectOffset) {
            if (!(documentBytes instanceof Uint8Array)) {
                throw new ParseError('pdf/sig/byterange/bad-input',
                    'documentBytes must be a Uint8Array');
            }
            if (!Number.isInteger(sigObjectOffset) || sigObjectOffset < 0
                || sigObjectOffset >= documentBytes.length) {
                throw new ParseError('pdf/sig/byterange/bad-offset',
                    'sigObjectOffset out of range');
            }
            const stop = _findEndobj(documentBytes, sigObjectOffset);
            const keyAt = _indexOfBytes(documentBytes, CONTENTS_KEY,
                sigObjectOffset, stop);
            if (keyAt < 0) {
                throw new ParseError('pdf/sig/byterange/no-contents',
                    '/Contents key not found in signature object',
                    { context: { sigObjectOffset } });
            }
            let p = keyAt + CONTENTS_KEY.length;
            while (p < stop && _isWhitespace(documentBytes[p])) p++;
            if (p >= stop || documentBytes[p] !== 0x3C) { // '<'
                throw new ParseError('pdf/sig/byterange/contents-not-hex',
                    '/Contents must be a hex literal');
            }
            const start = p + 1;
            let end = start;
            while (end < stop && documentBytes[end] !== 0x3E) end++;  // '>'
            if (end >= stop) {
                throw new ParseError('pdf/sig/byterange/contents-unterminated',
                    '/Contents hex literal not terminated before endobj');
            }
            return { offset: start, length: end - start };
        }

        return {
            computeByteRange,
            extractSignedBytes,
            findContentsField,
            auditByteRange
        };
    }
};
