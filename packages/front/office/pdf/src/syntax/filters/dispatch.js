// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Filter dispatch — applies a PDF filter chain
 * (`/Filter` + `/DecodeParms`) on raw stream bytes per ISO 32000-2:2020
 * §7.4.
 *
 * The dispatch map ships Flate/AHx/A85/RL (+ DCT/JPX/Crypt passthrough);
 * LZW, CCITTFax and JBIG2 are not in the map; their implementations live on
 * extras and are wired with `register(name, impl)` — no extra registers itself.
 *
 * @module pdf/syntax/filters/dispatch
 */

/**
 * Module factory — collects all registered decoders into one map.
 * Worker-safe: factory body is self-contained.
 */
import { pdfErrors } from '../../errors.js';
import { pdfFlate } from './flate.js';
import { pdfAsciiHex } from './asciiHex.js';
import { pdfAscii85 } from './ascii85.js';
import { pdfRunLength } from './runLength.js';

export const pdfFilterDispatch = {
    name: 'pdfFilterDispatch',
    dependencies: ['pdfErrors', 'pdfFlate', 'pdfAsciiHex', 'pdfAscii85', 'pdfRunLength'],
    deps: [pdfErrors, pdfFlate, pdfAsciiHex, pdfAscii85, pdfRunLength],
    factory(errors, flate, asciiHex, ascii85, runLength) {
        const { ParseError } = errors;
        function isType(node, kind) { return !!(node && node.type === kind); }

        const ABBREV = {
            Fl: 'FlateDecode',
            AHx: 'ASCIIHexDecode',
            A85: 'ASCII85Decode',
            RL: 'RunLengthDecode',
            LZW: 'LZWDecode',
            DCT: 'DCTDecode',
            JPX: 'JPXDecode',
            CCF: 'CCITTFaxDecode'
        };
        function resolveAbbrev(name) { return ABBREV[name] || name; }
        function passthrough() {
            return {
                decode(bytes) { return bytes; },
                encode(bytes) { return bytes; }
            };
        }

        function normalizeFilterList(filterEntry) {
            if (!filterEntry) return [];
            if (filterEntry.type === 'name') {
                return [resolveAbbrev(filterEntry.value)];
            }
            if (filterEntry.type === 'array') {
                const out = [];
                for (const it of filterEntry.items) {
                    if (it.type !== 'name') {
                        throw new ParseError('pdf/filter/non-name',
                            '/Filter array entries must be names',
                            { context: { kind: it.type } });
                    }
                    out.push(resolveAbbrev(it.value));
                }
                return out;
            }
            throw new ParseError('pdf/filter/bad-type',
                '/Filter must be a name or array of names',
                { context: { type: filterEntry.type } });
        }

        function applyDecodeChain(bytes, filters, params, decoders) {
            let cur = bytes;
            for (let i = 0; i < filters.length; i++) {
                const name = filters[i];
                const p    = params ? (params[i] || null) : null;
                const dec  = decoders[name];
                if (!dec) {
                    throw new ParseError('pdf/filter/unsupported',
                        `filter "${name}" not registered`,
                        { context: { name, available: Object.keys(decoders) } });
                }
                cur = dec.decode(cur, p);
            }
            return cur;
        }

        function applyEncodeChain(bytes, filters, params, decoders) {
            let cur = bytes;
            for (let i = 0; i < filters.length; i++) {
                const name = filters[i];
                const p    = params ? (params[i] || null) : null;
                const enc  = decoders[name];
                if (!enc || typeof enc.encode !== 'function') {
                    throw new ParseError('pdf/filter/no-encoder',
                        `filter "${name}" has no encoder`,
                        { context: { name } });
                }
                cur = enc.encode(cur, p);
            }
            return cur;
        }

        // Marshal a typed dict node ({type:'dict', entries:{K: {type,value}}})
        // to a plain key -> value object, per ISO 32000-2:2020 §7.4 — the
        // decoders (e.g. pdfFlate's predictor) expect plain values, not
        // typed AST nodes (a typed node read as plain silently no-ops the
        // predictor).
        function plainParams(dictNode) {
            const entries = dictNode.entries || {};
            const out = {};
            for (const key of Object.keys(entries)) {
                const v = entries[key];
                out[key] = v ? v.value : undefined;
            }
            return out;
        }

        function decodeParmsList(entry, count) {
            if (!entry) return null;
            if (entry.type === 'null') return null;
            if (entry.type === 'dict') {
                const arr = new Array(count).fill(null);
                if (count > 0) arr[0] = plainParams(entry);
                return arr;
            }
            if (entry.type === 'array') {
                return entry.items.map(it => (it.type === 'dict' ? plainParams(it) : null));
            }
            throw new ParseError('pdf/filter/bad-decodeparms',
                '/DecodeParms must be a dict, array, or null',
                { context: { type: entry.type } });
        }

        function decodeStream(streamObj, decoders) {
            if (!isType(streamObj, 'stream')) {
                throw new ParseError('pdf/filter/not-stream',
                    'decodeStream expects a stream object');
            }
            const dict = streamObj.dict;
            const filters = normalizeFilterList(dict.entries.Filter);
            const params  = decodeParmsList(dict.entries.DecodeParms, filters.length);
            return applyDecodeChain(streamObj.raw, filters, params, decoders);
        }

        const decoders = {
            FlateDecode:     flate,
            ASCIIHexDecode:  asciiHex,
            ASCII85Decode:   ascii85,
            RunLengthDecode: runLength,
            DCTDecode:       passthrough(),
            JPXDecode:       passthrough(),
            Crypt:           passthrough()
        };
        function decode(streamObj) { return decodeStream(streamObj, decoders); }
        function decodeChain(bytes, filters, params) {
            return applyDecodeChain(bytes, filters, params, decoders);
        }
        function encodeChain(bytes, filters, params) {
            return applyEncodeChain(bytes, filters, params, decoders);
        }
        function register(name, impl) { decoders[name] = impl; }
        function names() { return Object.keys(decoders); }
        return {
            decode, decodeChain, encodeChain, register, names, decoders,
            normalizeFilterList,
            applyDecodeChain,
            applyEncodeChain,
            decodeStream
        };
    }
};
