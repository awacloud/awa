// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Classical PDF cross-reference table parser per ISO
 * 32000-2:2020 §7.5.4, plus the two cross-reference-stream helpers the
 * incremental writer needs (§7.5.8): `readXrefStreamDict` reads the
 * dictionary of a `/Type /XRef` stream section WITHOUT decoding its data,
 * and `buildXrefStream` emits an uncompressed `/Type /XRef` stream section
 * for an incremental update over a stream base.
 *
 * @module pdf/syntax/xref
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfTokenizer } from './tokenizer.js';
import { pdfParser } from './parser.js';

export const pdfXref = {
    name: 'pdfXref',
    dependencies: ['pdfErrors', 'pdfTokenizer', 'pdfParser'],
    deps: [pdfErrors, pdfTokenizer, pdfParser],
    factory(errors, tokenizerMod, parserMod) {
        const { ParseError, RenderError } = errors;
        const tokenize = tokenizerMod.tokenize;
        const lastIndexOfBytes = tokenizerMod.lastIndexOfBytes;
        const parseObject = parserMod.parseObject;
        const LF = 0x0A, CR = 0x0D, SP = 0x20;

        function locateStartXref(bytes) {
            const tail = Math.max(0, bytes.length - 8192);
            const idx = lastIndexOfBytes(bytes,
                new Uint8Array([0x73, 0x74, 0x61, 0x72, 0x74, 0x78, 0x72, 0x65, 0x66]),
                bytes.length);
            if (idx < tail) return -1;
            return idx;
        }

        function readStartXref(bytes, at) {
            const tok = tokenize(bytes, { start: at });
            const kw = tok.next();
            if (!kw || kw.kind !== 'kw' || kw.value !== 'startxref') {
                throw new ParseError('pdf/xref/no-startxref',
                    'startxref keyword not found',
                    { context: { offset: at } });
            }
            const num = tok.next();
            if (!num || num.kind !== 'int' || num.value < 0) {
                throw new ParseError('pdf/xref/bad-startxref',
                    'startxref must be followed by a non-negative integer',
                    { context: { offset: at } });
            }
            return num.value;
        }

        function parseIntBytes(bytes, off, len) {
            let n = 0;
            for (let i = 0; i < len; i++) {
                const b = bytes[off + i];
                if (b < 0x30 || b > 0x39) {
                    throw new ParseError('pdf/xref/bad-digit',
                        'expected ASCII digit in xref entry',
                        { context: { offset: off + i, byte: b } });
                }
                n = n * 10 + (b - 0x30);
            }
            return n;
        }

        function parseXrefTable(bytes, at) {
            const tok = tokenize(bytes, { start: at });
            const kw = tok.next();
            if (!kw || kw.kind !== 'kw' || kw.value !== 'xref') {
                throw new ParseError('pdf/xref/no-xref-keyword',
                    'expected xref keyword',
                    { context: { offset: at } });
            }
            const entries = {};
            for (;;) {
                const first = tok.peek();
                if (!first || first.kind !== 'int') {
                    if (first) tok.seek(first.offset);
                    break;
                }
                tok.next();
                const cnt = tok.next();
                if (!cnt || cnt.kind !== 'int' || cnt.value < 0) {
                    throw new ParseError('pdf/xref/bad-subsection-header',
                        'xref subsection header must be `<first> <count>`',
                        { context: { offset: first.offset } });
                }
                let p = tok.pos();
                if (p < bytes.length && bytes[p] === CR) p++;
                if (p < bytes.length && bytes[p] === LF) p++;
                for (let k = 0; k < cnt.value; k++) {
                    if (p + 20 > bytes.length) {
                        throw new ParseError('pdf/xref/truncated-entry',
                            'truncated xref entry',
                            { context: { offset: p, expected: 20 } });
                    }
                    const off = parseIntBytes(bytes, p, 10);
                    if (bytes[p + 10] !== SP) {
                        throw new ParseError('pdf/xref/bad-entry-format',
                            'xref entry missing space at col 10',
                            { context: { offset: p } });
                    }
                    const gen = parseIntBytes(bytes, p + 11, 5);
                    if (bytes[p + 16] !== SP) {
                        throw new ParseError('pdf/xref/bad-entry-format',
                            'xref entry missing space at col 16',
                            { context: { offset: p } });
                    }
                    const tag = bytes[p + 17];
                    if (tag !== 0x6E && tag !== 0x66) {
                        throw new ParseError('pdf/xref/bad-entry-flag',
                            'xref entry flag must be n or f',
                            { context: { offset: p, byte: tag } });
                    }
                    entries[first.value + k] = {
                        offset: off,
                        gen,
                        free: tag === 0x66
                    };
                    p += 20;
                }
                tok.seek(p);
            }
            return { entries, end: tok.pos() };
        }

        function parseTrailerDict(bytes, at) {
            const tok = tokenize(bytes, { start: at });
            const kw = tok.next();
            if (!kw || kw.kind !== 'kw' || kw.value !== 'trailer') {
                throw new ParseError('pdf/xref/no-trailer',
                    'expected trailer keyword',
                    { context: { offset: at } });
            }
            const dict = parseObject(tok);
            if (dict.type !== 'dict') {
                throw new ParseError('pdf/xref/trailer-not-dict',
                    'trailer must be a dictionary',
                    { context: { offset: at } });
            }
            return { dict, end: tok.pos() };
        }

        /**
         * Read the dictionary of the cross-reference stream section at `at`
         * (`N G obj << /Type /XRef … >> stream`, §7.5.8). The stream data is
         * NOT decoded — the dict alone carries the section's trailer keys
         * (`/Root`, `/Info`, `/ID`, `/Size`, `/Prev`) — so no filter module
         * is needed and an indirect `/Length` is not an obstacle here.
         *
         * @param {Uint8Array} bytes
         * @param {number} at  Offset designated by `startxref` or a `/Prev`.
         * @returns {{num: number, gen: number, dict: object}}
         * @throws ParseError `pdf/xref/not-xref-stream` — no indirect object
         *   at `at`, or one that is not a `/Type /XRef` stream.
         */
        function readXrefStreamDict(bytes, at) {
            const notStream = (why) => new ParseError('pdf/xref/not-xref-stream',
                `no cross-reference stream at offset ${at}: ${why}`,
                { context: { offset: at } });
            if (!Number.isInteger(at) || at < 0 || at >= bytes.length) {
                throw notStream('offset outside the file');
            }
            let num, gen, kw, dict, after;
            try {
                const tok = tokenize(bytes, { start: at });
                num = tok.next();
                gen = tok.next();
                kw = tok.next();
                if (!num || num.kind !== 'int' || !gen || gen.kind !== 'int'
                    || !kw || kw.kind !== 'kw' || kw.value !== 'obj') {
                    throw notStream('no indirect object header');
                }
                dict = parseObject(tok);
                after = tok.peek();
            } catch (e) {
                if (e && e.code === 'pdf/xref/not-xref-stream') throw e;
                throw notStream('the object does not parse');
            }
            const type = dict && dict.type === 'dict' && dict.entries.Type;
            if (!type || type.type !== 'name' || type.value !== 'XRef'
                || !after || after.kind !== 'kw' || after.value !== 'stream') {
                throw notStream('the object is not a /Type /XRef stream');
            }
            return { num: num.value, gen: gen.value, dict };
        }

        /** Smallest number of bytes (>= 1) that holds `n` big-endian. */
        function byteWidth(n) {
            let w = 1;
            while (n > 0xFF) { n = Math.floor(n / 256); w++; }
            return w;
        }

        function hexLit(bytes) {
            const H = '0123456789ABCDEF';
            let s = '<';
            for (let i = 0; i < bytes.length; i++) {
                s += H[bytes[i] >> 4] + H[bytes[i] & 0xF];
            }
            return s + '>';
        }

        function isRef(r) {
            return !!r && Number.isInteger(r.num) && r.num >= 1;
        }

        /**
         * Emit one uncompressed cross-reference stream section for an
         * incremental update (§7.5.8, §7.5.6), as the complete indirect
         * object `num 0 obj << /Type /XRef … >> stream … endstream endobj`.
         * The caller appends `startxref` / `%%EOF`.
         *
         * Rows: object 0's free-list head, one type-1 row per `entries`
         * item, and the stream's own type-1 row at `offset`. `/Index` lists
         * one pair per contiguous run of object numbers; `/W` is the
         * narrowest `[1 w2 w3]` that fits; `/Size` is `num + 1` or
         * `opts.size`, whichever is larger. No `/Filter`: the data is
         * written uncompressed, so no filter module is involved.
         *
         * `opts.encrypt` (an indirect reference) is written as
         * `/Encrypt n g R` right after `/ID`: an update over an encrypted
         * document repeats the document's `/Encrypt` (ISO 32000-2 §7.5.6).
         * Without it the output is unchanged.
         *
         * @param {{num: number, offset: number,
         *          entries: Array<{num: number, offset: number, gen?: number}>,
         *          size?: number, prev: number,
         *          root: {num: number, gen?: number},
         *          info?: {num: number, gen?: number}|null,
         *          id?: Array<Uint8Array>|null,
         *          encrypt?: {num: number, gen?: number}|null}} opts
         * @returns {Uint8Array}
         * @throws RenderError `pdf/xref/bad-stream-section` on an unusable
         *   `num`, `offset`, `prev`, `root`, `encrypt` (anything but an
         *   indirect reference — a direct `/Encrypt` dictionary is not
         *   written here) or entry.
         */
        function buildXrefStream(opts) {
            const bad = (why) => new RenderError('pdf/xref/bad-stream-section',
                `cannot build the cross-reference stream: ${why}`);
            if (!opts || !Number.isInteger(opts.num) || opts.num < 1) {
                throw bad('num must be an integer >= 1');
            }
            if (!Number.isInteger(opts.offset) || opts.offset < 0) {
                throw bad('offset must be an integer >= 0');
            }
            if (!Number.isInteger(opts.prev) || opts.prev < 0) {
                throw bad('prev must be an integer >= 0');
            }
            if (!isRef(opts.root)) throw bad('root must be { num >= 1, gen }');
            if (opts.encrypt != null && !isRef(opts.encrypt)) {
                throw bad('encrypt must be an indirect reference { num >= 1, gen }');
            }
            const rows = new Map();
            rows.set(0, [0, 0, 65535]);
            for (const e of opts.entries || []) {
                if (!e || !Number.isInteger(e.num) || e.num < 1
                    || !Number.isInteger(e.offset) || e.offset < 0) {
                    throw bad('each entry needs num >= 1 and offset >= 0');
                }
                rows.set(e.num, [1, e.offset, e.gen | 0]);
            }
            rows.set(opts.num, [1, opts.offset, 0]);

            const nums = Array.from(rows.keys()).sort((a, b) => a - b);
            let max2 = 0, max3 = 0;
            for (const r of rows.values()) {
                if (r[1] > max2) max2 = r[1];
                if (r[2] > max3) max3 = r[2];
            }
            const w = [1, byteWidth(max2), byteWidth(max3)];
            const rec = w[0] + w[1] + w[2];
            const data = new Uint8Array(nums.length * rec);
            let o = 0;
            for (const n of nums) {
                const r = rows.get(n);
                let at = o;
                for (let f = 0; f < 3; f++) {
                    let v = r[f];
                    for (let k = w[f] - 1; k >= 0; k--) {
                        data[at + k] = v & 0xFF;
                        v = Math.floor(v / 256);
                    }
                    at += w[f];
                }
                o += rec;
            }

            const index = [];
            for (let i = 0; i < nums.length;) {
                let j = i;
                while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
                index.push(`${nums[i]} ${j - i + 1}`);
                i = j + 1;
            }

            const size = Math.max(opts.num + 1,
                Number.isInteger(opts.size) ? opts.size : 0);
            let d = `<< /Type /XRef /Size ${size} /W [${w.join(' ')}]`
                + ` /Index [${index.join(' ')}]`
                + ` /Root ${opts.root.num} ${opts.root.gen | 0} R`;
            if (isRef(opts.info)) d += ` /Info ${opts.info.num} ${opts.info.gen | 0} R`;
            if (opts.id && opts.id[0] instanceof Uint8Array
                && opts.id[1] instanceof Uint8Array) {
                d += ` /ID [${hexLit(opts.id[0])}${hexLit(opts.id[1])}]`;
            }
            if (isRef(opts.encrypt)) {
                d += ` /Encrypt ${opts.encrypt.num} ${opts.encrypt.gen | 0} R`;
            }
            d += ` /Prev ${opts.prev} /Length ${data.length} >>`;

            const te = new TextEncoder();
            const head = te.encode(`${opts.num} 0 obj\n${d}\nstream\n`);
            const tail = te.encode('\nendstream\nendobj\n');
            const out = new Uint8Array(head.length + data.length + tail.length);
            out.set(head, 0);
            out.set(data, head.length);
            out.set(tail, head.length + data.length);
            return out;
        }

        return {
            locateStartXref,
            readStartXref,
            parseXrefTable,
            parseTrailerDict,
            readXrefStreamDict,
            buildXrefStream
        };
    }
};
