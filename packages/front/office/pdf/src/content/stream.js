// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Content stream parser per ISO 32000-2:2020 §7.8 + §8.2.
 *
 * Reads a `Uint8Array` of content-stream bytes (the result of decoding
 * any `/Filter` chain on a page's `/Contents` stream) and produces an
 * ordered list of operations.
 *
 * Inline images (`BI ... ID ... EI`) are captured as one synthetic
 * operation `{ op: 'BI', args: [{type:'dict', entries}], data: Uint8Array }`.
 *
 * @module pdf/content/stream
 */

/**
 * Module factory — worker-safe, self-contained.
 *
 * Note: `pdfParser` and `pdfContentOps` are declared as dependencies for
 * forward-looking DI; the current shim materialises a tokenizer+parser
 * directly. When called via the runtime with empty-stub deps, the shim
 * fallbacks are used.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfContentOps } from './ops.js';

export const pdfContentStream = {
    name: 'pdfContentStream',
    dependencies: ['pdfErrors', 'pdfParser', 'pdfContentOps'],
    deps: [pdfErrors, pdfParser, pdfContentOps],
    factory(errors, parserMod, opsMod) {
        const { ParseError } = errors;

        const SP = 0x20, HT = 0x09, LF = 0x0A, CR = 0x0D;
        const E = 0x45, I = 0x49;

        // `parserMod` must expose `tokenize` + `parseObject` (the shim
        // below materialises a compound object that satisfies this).
        // `opsMod` must expose `isOp`.
        const tokenize    = parserMod && parserMod.tokenize;
        const parseObject = parserMod && parserMod.parseObject;
        const isOp        = opsMod    && opsMod.isOp;

        function isWsByte(b) {
            return b === SP || b === HT || b === LF || b === CR || b === 0x0C || b === 0x00;
        }

        function findInlineImageEnd(bytes, from) {
            for (let i = from; i < bytes.length - 1; i++) {
                if (bytes[i] === E && bytes[i + 1] === I) {
                    const prev = i > 0 ? bytes[i - 1] : SP;
                    const next = i + 2 < bytes.length ? bytes[i + 2] : SP;
                    if (isWsByte(prev) && (isWsByte(next) || i + 2 === bytes.length)) {
                        let end = i;
                        if (end > from && isWsByte(bytes[end - 1])) end--;
                        return { dataEnd: end, eiEnd: i + 2 };
                    }
                }
            }
            return null;
        }

        function readInlineImage(tok, bytes) {
            const entries = {};
            for (;;) {
                const t = tok.peek();
                if (!t) {
                    throw new ParseError('pdf/content/inline-image/no-ID',
                        'inline image missing ID marker');
                }
                if (t.kind === 'kw' && t.value === 'ID') {
                    tok.next();
                    break;
                }
                if (t.kind !== 'name') {
                    throw new ParseError('pdf/content/inline-image/bad-key',
                        'inline image dict keys must be names',
                        { context: { offset: t.offset, kind: t.kind } });
                }
                const key = tok.next().value;
                entries[key] = parseObject(tok);
            }
            let p = tok.pos();
            if (p < bytes.length && (bytes[p] === SP || bytes[p] === HT
                                      || bytes[p] === LF || bytes[p] === CR)) {
                p++;
            }
            const dataStart = p;
            const located = findInlineImageEnd(bytes, dataStart);
            if (!located) {
                throw new ParseError('pdf/content/inline-image/no-EI',
                    'inline image missing EI marker',
                    { context: { dataStart } });
            }
            tok.seek(located.eiEnd);
            return {
                op: 'BI',
                args: [{ type: 'dict', entries }],
                data: bytes.subarray(dataStart, located.dataEnd)
            };
        }

        function parseContentStream(bytes) {
            if (!(bytes instanceof Uint8Array)) {
                throw new ParseError('pdf/content/bad-input',
                    'parseContentStream expects Uint8Array',
                    { context: { typeof: typeof bytes } });
            }
            const tok = tokenize(bytes);
            const out = [];
            let argStack = [];

            for (;;) {
                const t = tok.peek();
                if (!t) break;
                if (t.kind === 'kw') {
                    if (t.value === 'true' || t.value === 'false' || t.value === 'null') {
                        argStack.push(parseObject(tok));
                        continue;
                    }
                    if (t.value === 'BI') {
                        tok.next();
                        const inline = readInlineImage(tok, bytes);
                        argStack = [];
                        out.push(inline);
                        continue;
                    }
                    if (!isOp(t.value)) {
                        throw new ParseError('pdf/content/unknown-op',
                            `unknown content-stream operator "${t.value}"`,
                            { context: { offset: t.offset, op: t.value } });
                    }
                    tok.next();
                    out.push({ op: t.value, args: argStack });
                    argStack = [];
                    continue;
                }
                argStack.push(parseObject(tok));
            }

            if (argStack.length > 0) {
                out.push({ op: '__trailing__', args: argStack });
            }

            return out;
        }

        return { parseContentStream };
    }
};
