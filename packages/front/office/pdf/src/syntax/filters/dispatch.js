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
 * `typeStreamEntries` types the entries every stream dictionary shares
 * (Table 5: `/Length`, the filter chain, the external-file entries, `/DL`);
 * `typeDecodeParms` types a filter's decode parameters dictionary.
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
        const { ParseError, ContractError } = errors;
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
        /** A filter list as read (`/Filter`, `/FFilter`): names, abbreviations kept. */
        function filterNames(v) {
            if (v === undefined) return [];
            if (isType(v, 'name')) return [v.value];
            if (isType(v, 'array') && v.items.every((it) => isType(it, 'name'))) {
                return v.items.map((it) => it.value);
            }
            return null;
        }

        /** Decode parameters as read, one entry per filter (`null` for a null entry). */
        function filterParms(v) {
            if (isType(v, 'dict')) return [v];
            if (isType(v, 'array') && v.items.every((it) => isType(it, 'dict') || isType(it, 'null'))) {
                return v.items.map((it) => (isType(it, 'dict') ? it : null));
            }
            return null;
        }

        /**
         * The entries common to every stream dictionary (ISO 32000-2 Table 5).
         * Accepts a stream or its dictionary.
         */
        function typeStreamEntries(streamObj) {
            const dict = isType(streamObj, 'stream') ? streamObj.dict : streamObj;
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/filter/not-stream',
                    'typeStreamEntries expects a stream or a stream dictionary',
                    { context: { type: streamObj && streamObj.type } });
            }
            const e = dict.entries;
            const refOf = (v) => (isType(v, 'ref') ? { num: v.num, gen: v.gen } : null);
            return {
                length: isType(e.Length, 'int') ? e.Length.value : refOf(e.Length),
                filter: filterNames(e.Filter),
                decodeParms: filterParms(e.DecodeParms),
                f: isType(e.F, 'string') ? e.F.value : (isType(e.F, 'dict') ? e.F : refOf(e.F)),
                fFilter: filterNames(e.FFilter),
                fDecodeParms: filterParms(e.FDecodeParms),
                dl: isType(e.DL, 'int') && e.DL.value >= 0 ? e.DL.value : null
            };
        }

        const DECODE_READ = Object.freeze({
            int: (v) => (isType(v, 'int') ? v.value : null),
            bool: (v) => (isType(v, 'bool') ? v.value : null),
            name: (v) => (isType(v, 'name') ? v.value : null),
            stream: (v) => (isType(v, 'stream') ? v : null)
        });
        const keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(' ').map((p) => p.split(':'))));
        const PREDICTOR = 'Predictor:int Colors:int BitsPerComponent:int Columns:int';
        // The decode parameters of each filter that has some: the keys and
        // their types (ISO 32000-2 Tables 8 to 14, the Arlington PDF
        // Model's types), as `Key:type` pairs apart by a space.
        const DECODE_PARMS_TYPES = Object.freeze({
            FlateDecode: keyTypes(PREDICTOR),
            LZWDecode: keyTypes(`${PREDICTOR} EarlyChange:int`),
            CCITTFaxDecode: keyTypes('K:int EndOfLine:bool EncodedByteAlign:bool Columns:int Rows:int EndOfBlock:bool '
                + 'BlackIs1:bool DamagedRowsBeforeError:int'),
            DCTDecode: keyTypes('ColorTransform:int'),
            JBIG2Decode: keyTypes('JBIG2Globals:stream'),
            Crypt: keyTypes('Type:name Name:name')
        });
        const DECODE_PARMS_KEYS = Object.freeze(Object.fromEntries(
            Object.entries(DECODE_PARMS_TYPES).map(([filter, types]) => [filter, Object.freeze(Object.keys(types))])));

        /**
         * Type a filter's decode parameters dictionary, `filter` its name
         * (an abbreviation resolved): one field per key of its list, named
         * after the key in lower case (`BlackIs1` → `blackis1`), present only
         * when the key is — an integer, a boolean or a name by its value, a
         * stream or a reference as read, `null` for a value of another type;
         * the other keys in `_extras`. The decode path does not use it.
         */
        function typeDecodeParms(dict, filter) {
            const name = typeof filter === 'string' ? resolveAbbrev(filter) : filter;
            if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(DECODE_PARMS_TYPES, name)) {
                throw new ContractError('pdf/filter/decodeparms/filter',
                    'filter must be a key of DECODE_PARMS_KEYS',
                    { context: { filter } });
            }
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/filter/decodeparms/not-dict',
                    'decode parameters must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const types = DECODE_PARMS_TYPES[name];
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (!Object.prototype.hasOwnProperty.call(types, k)) out._extras[k] = v;
                else out[k.toLowerCase()] = isType(v, 'ref') ? v : DECODE_READ[types[k]](v);
            }
            return out;
        }

        return {
            typeStreamEntries,
            typeDecodeParms,
            DECODE_PARMS_KEYS,
            decode, decodeChain, encodeChain, register, names, decoders,
            normalizeFilterList,
            applyDecodeChain,
            applyEncodeChain,
            decodeStream
        };
    }
};
