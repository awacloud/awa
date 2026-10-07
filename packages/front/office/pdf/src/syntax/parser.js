// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview PDF object parser — turns a tokenizer stream into a tree
 * of typed PDF objects per ISO 32000-2:2020 §7.3 (Objects).
 *
 * Object types produced:
 *
 * | type      | shape                                                  |
 * |-----------|--------------------------------------------------------|
 * | `null`    | `{ type: 'null' }`                                     |
 * | `bool`    | `{ type: 'bool',   value: boolean }`                   |
 * | `int`     | `{ type: 'int',    value: number }`                    |
 * | `real`    | `{ type: 'real',   value: number }`                    |
 * | `name`    | `{ type: 'name',   value: string }`                    |
 * | `string`  | `{ type: 'string', value: Uint8Array, syntax: 'lit'\|'hex' }` |
 * | `array`   | `{ type: 'array',  items: object[] }`                  |
 * | `dict`    | `{ type: 'dict',   entries: { [name: string]: object } }` |
 * | `ref`     | `{ type: 'ref',    num: int, gen: int }`               |
 * | `stream`  | `{ type: 'stream', dict, raw: Uint8Array }`            |
 *
 * Indirect object definitions (`<num> <gen> obj ... endobj`) are parsed
 * by `parseIndirect()` and return `{ num, gen, value }`.
 *
 * Companion files:
 * - `parser-obj.js` — `obj.*` constructors and `getEntry`, `isType`.
 *
 * @module pdf/syntax/parser
 */

/**
 * Module factory — worker-safe, self-contained.
 *
 * Receives `pdfErrors` and `pdfTokenizer` via DI ; carries its own
 * stream-length and `endstream` helpers in the body so the factory is
 * self-sufficient.
 *
 * Re-exports the injected `pdfTokenizer`'s `tokenize` alongside the
 * parser's own API: `pdfContentStream` declares `pdfParser` as its
 * `tokenize` source, so the returned module must expose it for the
 * public module graph to resolve a working `parseContentStream`.
 */
import { pdfErrors } from '../errors.js';
import { pdfParserObj } from './parser-obj.js';
import { pdfTokenizer } from './tokenizer.js';

export const pdfParser = {
    name: 'pdfParser',
    dependencies: ['pdfErrors', 'pdfParserObj', 'pdfTokenizer'],
    deps: [pdfErrors, pdfParserObj, pdfTokenizer],
    factory(errors, parserObj, tokenizerMod) {
        const { ParseError } = errors;
        const { obj, getEntry, isType } = parserObj;
        const tokenize = tokenizerMod.tokenize;
        const LF = 0x0A, CR = 0x0D;

        // --- stream-length and `endstream` helpers ---
        function resolveStreamLength(streamDict, resolveRef) {
            const e = streamDict.entries && streamDict.entries.Length;
            if (!e) return -1;
            if (e.type === 'int') return e.value;
            if (e.type === 'ref' && typeof resolveRef === 'function') {
                const r = resolveRef(e);
                if (r && r.type === 'int') return r.value;
            }
            return -1;
        }
        function findEndstream(bytes, from, quota) {
            const needle = [0x65,0x6E,0x64,0x73,0x74,0x72,0x65,0x61,0x6D]; // endstream
            const lim = Math.min(bytes.length, from + (quota | 0));
            outer: for (let i = from; i + needle.length <= lim; i++) {
                for (let k = 0; k < needle.length; k++) {
                    if (bytes[i + k] !== needle[k]) continue outer;
                }
                // Walk back over trailing EOL whitespace before `endstream`.
                let end = i;
                if (end > from && bytes[end - 1] === LF) end--;
                if (end > from && bytes[end - 1] === CR) end--;
                return end;
            }
            return -1;
        }
        function skipEolWs(tok) {
            const b = tok.bytes;
            let p = tok.pos();
            while (p < b.length) {
                const c = b[p];
                if (c === 0x20 || c === 0x09 || c === LF || c === CR) p++;
                else break;
            }
            tok.seek(p);
        }

        // --- parserLimits (mutable per-instance state) ---
        const parserLimits = {
            maxDepth: 200,
            maxArrayLen: 1_000_000,
            maxStreamBytes: 256 * 1024 * 1024
        };
        function setParserLimits(partial) {
            if (partial && typeof partial === 'object') {
                if (Number.isInteger(partial.maxDepth) && partial.maxDepth > 0)
                    parserLimits.maxDepth = partial.maxDepth;
                if (Number.isInteger(partial.maxArrayLen) && partial.maxArrayLen > 0)
                    parserLimits.maxArrayLen = partial.maxArrayLen;
                if (Number.isInteger(partial.maxStreamBytes)
                    && partial.maxStreamBytes > 0)
                    parserLimits.maxStreamBytes = partial.maxStreamBytes;
            }
            return parserLimits;
        }

        function parseObject(tok) {
            const t = tok.next();
            if (!t) {
                throw new ParseError('pdf/parser/eof', 'unexpected end of input');
            }
            return continueParse(tok, t, 0);
        }

        function continueParse(tok, t, depth) {
            if (depth > parserLimits.maxDepth) {
                throw new ParseError('pdf/parser/depth-exceeded',
                    'parser depth limit exceeded',
                    { context: { depth, limit: parserLimits.maxDepth,
                                 offset: t && t.offset } });
            }
            switch (t.kind) {
                case 'kw':
                    if (t.value === 'null')  return { type: 'null' };
                    if (t.value === 'true')  return { type: 'bool', value: true };
                    if (t.value === 'false') return { type: 'bool', value: false };
                    throw new ParseError('pdf/parser/unexpected-keyword',
                        `unexpected keyword "${t.value}"`,
                        { context: { offset: t.offset, keyword: t.value } });
                case 'name':
                    return { type: 'name', value: t.value };
                case 'string':
                    return { type: 'string', value: t.value, syntax: 'lit' };
                case 'hex':
                    return { type: 'string', value: t.value, syntax: 'hex' };
                case 'int':
                    return tryReadRef(tok, t);
                case 'real':
                    return { type: 'real', value: t.value };
                case 'open_arr':
                    return readArray(tok, t.offset, depth);
                case 'open_dict':
                    return readDict(tok, t.offset, depth);
                case 'close_arr':
                case 'close_dict':
                    throw new ParseError('pdf/parser/unbalanced',
                        `unexpected ${t.kind}`,
                        { context: { offset: t.offset } });
                default:
                    throw new ParseError('pdf/parser/unexpected-token',
                        `unexpected token of kind "${t.kind}"`,
                        { context: { offset: t.offset, kind: t.kind } });
            }
        }

        function tryReadRef(tok, intTok) {
            const at = tok.pos();
            const p1 = tok.peek();
            if (!p1 || p1.kind !== 'int') {
                return { type: 'int', value: intTok.value };
            }
            tok.next();
            const p2 = tok.peek();
            if (p2 && p2.kind === 'kw' && p2.value === 'R') {
                tok.next();
                return { type: 'ref', num: intTok.value | 0, gen: p1.value | 0 };
            }
            tok.seek(at);
            return { type: 'int', value: intTok.value };
        }

        function readArray(tok, startOff, depth) {
            const items = [];
            for (;;) {
                const p = tok.peek();
                if (!p) {
                    throw new ParseError('pdf/parser/unterminated-array',
                        'array not closed',
                        { context: { offset: startOff } });
                }
                if (p.kind === 'close_arr') { tok.next(); return { type: 'array', items }; }
                if (items.length >= parserLimits.maxArrayLen) {
                    throw new ParseError('pdf/parser/array-too-long',
                        'array exceeds parserLimits.maxArrayLen',
                        { context: { length: items.length,
                                     limit: parserLimits.maxArrayLen,
                                     offset: startOff } });
                }
                const sub = tok.next();
                items.push(continueParse(tok, sub, (depth | 0) + 1));
            }
        }

        function readDict(tok, startOff, depth) {
            const entries = {};
            for (;;) {
                const p = tok.peek();
                if (!p) {
                    throw new ParseError('pdf/parser/unterminated-dict',
                        'dict not closed',
                        { context: { offset: startOff } });
                }
                if (p.kind === 'close_dict') { tok.next(); return { type: 'dict', entries }; }
                if (p.kind !== 'name') {
                    throw new ParseError('pdf/parser/dict-key-not-name',
                        'expected /Name as dict key',
                        { context: { offset: p.offset, kind: p.kind } });
                }
                const keyTok = tok.next();
                const sub = tok.next();
                if (!sub) {
                    throw new ParseError('pdf/parser/eof', 'unexpected end of input');
                }
                const value = continueParse(tok, sub, (depth | 0) + 1);
                entries[keyTok.value] = value;
            }
        }

        function parseIndirect(tok, resolveRef) {
            const t1 = tok.next();
            if (!t1 || t1.kind !== 'int') {
                throw new ParseError('pdf/parser/indirect-bad-num',
                    'expected object number',
                    { context: { offset: t1 ? t1.offset : tok.pos() } });
            }
            const t2 = tok.next();
            if (!t2 || t2.kind !== 'int') {
                throw new ParseError('pdf/parser/indirect-bad-gen',
                    'expected generation number',
                    { context: { offset: t2 ? t2.offset : tok.pos() } });
            }
            const t3 = tok.next();
            if (!t3 || t3.kind !== 'kw' || t3.value !== 'obj') {
                throw new ParseError('pdf/parser/indirect-missing-obj',
                    'expected obj keyword',
                    { context: { offset: t3 ? t3.offset : tok.pos() } });
            }

            const value = parseObject(tok);
            let body = value;

            const after = tok.peek();
            if (value.type === 'dict' && after && after.kind === 'kw' && after.value === 'stream') {
                tok.next();
                const bytes = tok.bytes;
                let p = tok.pos();
                if (p < bytes.length && bytes[p] === CR) p++;
                if (p < bytes.length && bytes[p] === LF) p++;
                tok.seek(p);

                const dataStart = tok.pos();
                const length = resolveStreamLength(value, resolveRef);
                let dataEnd;
                if (Number.isFinite(length) && length >= 0
                    && dataStart + length <= bytes.length) {
                    dataEnd = dataStart + length;
                } else {
                    dataEnd = findEndstream(bytes, dataStart,
                        parserLimits.maxStreamBytes);
                    if (dataEnd < 0) {
                        throw new ParseError('pdf/parser/stream/no-endstream',
                            'cannot locate endstream within quota',
                            { context: { offset: dataStart,
                                         num: t1.value, gen: t2.value,
                                         quota: parserLimits.maxStreamBytes } });
                    }
                }
                const raw = bytes.subarray(dataStart, dataEnd);
                tok.seek(dataEnd);
                skipEolWs(tok);
                const endTok = tok.next();
                if (!endTok || endTok.kind !== 'kw' || endTok.value !== 'endstream') {
                    throw new ParseError('pdf/parser/stream/expected-endstream',
                        'expected endstream',
                        { context: { offset: endTok ? endTok.offset : tok.pos() } });
                }
                body = { type: 'stream', dict: value, raw };
            }

            const endObj = tok.next();
            if (!endObj || endObj.kind !== 'kw' || endObj.value !== 'endobj') {
                throw new ParseError('pdf/parser/indirect-missing-endobj',
                    'expected endobj',
                    { context: { offset: endObj ? endObj.offset : tok.pos(),
                                 num: t1.value, gen: t2.value } });
            }
            return { num: t1.value, gen: t2.value, value: body };
        }

        function parseFromBytes(bytes) {
            const tok = tokenize(bytes);
            return parseObject(tok);
        }
        function parseIndirectFromBytes(bytes, at, resolveRef) {
            const tok = tokenize(bytes, { start: at | 0 });
            return parseIndirect(tok, resolveRef);
        }

        return {
            tokenize,
            parseObject,
            parseIndirect,
            parseFromBytes,
            parseIndirectFromBytes,
            parserLimits,
            setParserLimits,
            obj,
            getEntry,
            isType
        };
    }
};
