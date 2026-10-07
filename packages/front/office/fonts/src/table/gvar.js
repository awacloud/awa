// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `gvar` — Glyph Variations (OT §10.6.5).
 *
 * Per-glyph tuple records describing how glyf points shift across the
 * variation axes. Each glyph references one or more tuples (a tuple is
 * a peak axis coordinate in F2Dot14) and per-point delta values for x
 * and y.
 *
 * @module fonts/table/gvar
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';

export const tableGvar = {
    name: 'tableGvar',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        const EMBEDDED_PEAK_TUPLE   = 0x8000;
        const INTERMEDIATE_REGION   = 0x4000;
        const PRIVATE_POINT_NUMBERS = 0x2000;
        const TUPLE_INDEX_MASK      = 0x0FFF;

        function parseGvar(bytes) {
            if (bytes.length < 20)
                throw new ParseError('fonts/gvar-short', 'gvar header truncated');
            const r = new BinaryReader(bytes);
            const major = r.readUint16();
            const minor = r.readUint16();
            if (major !== 1)
                throw new ParseError('fonts/gvar-version', `unsupported gvar major ${major}`,
                    { context: { major, minor } });
            const axisCount = r.readUint16();
            const sharedTupleCount = r.readUint16();
            const sharedTuplesOffset = r.readUint32();
            const glyphCount = r.readUint16();
            const flags = r.readUint16();
            const glyphVariationDataArrayOffset = r.readUint32();

            const useLong = (flags & 1) !== 0;
            const offsets = new Array(glyphCount + 1);
            for (let i = 0; i <= glyphCount; i++) {
                offsets[i] = useLong ? r.readUint32() : (r.readUint16() * 2);
            }

            const sharedTuples = new Array(sharedTupleCount);
            if (sharedTupleCount && sharedTuplesOffset) {
                const sr = new BinaryReader(bytes, sharedTuplesOffset, bytes.length - sharedTuplesOffset);
                for (let i = 0; i < sharedTupleCount; i++) {
                    const tuple = new Array(axisCount);
                    for (let k = 0; k < axisCount; k++) tuple[k] = sr.readF2Dot14();
                    sharedTuples[i] = tuple;
                }
            }

            return {
                majorVersion: major, minorVersion: minor,
                axisCount, glyphCount, flags,
                sharedTuples,
                getGlyphVariationData(gid) {
                    if (gid < 0 || gid >= glyphCount) return null;
                    const start = glyphVariationDataArrayOffset + offsets[gid];
                    const end   = glyphVariationDataArrayOffset + offsets[gid + 1];
                    if (end <= start) return null;
                    return new Uint8Array(bytes.buffer, bytes.byteOffset + start, end - start);
                },
                parseGlyphVariations(gid) {
                    const raw = this.getGlyphVariationData(gid);
                    if (!raw) return null;
                    return parseGlyphVariationData(raw, axisCount, sharedTuples);
                }
            };
        }

        function parseGlyphVariationData(bytes, axisCount, sharedTuples) {
            const r = new BinaryReader(bytes);
            const tupleVariationCount = r.readUint16();
            const tupleVariationCountValue = tupleVariationCount & 0x0FFF;
            const sharedPointsBit = !!(tupleVariationCount & 0x8000);
            void sharedPointsBit;
            const dataOffset = r.readUint16();
            const headers = [];
            for (let i = 0; i < tupleVariationCountValue; i++) {
                const variationDataSize = r.readUint16();
                const tupleIndex        = r.readUint16();
                const idx = tupleIndex & TUPLE_INDEX_MASK;
                const hasEmbedded = !!(tupleIndex & EMBEDDED_PEAK_TUPLE);
                const intermediate = !!(tupleIndex & INTERMEDIATE_REGION);
                const privatePts = !!(tupleIndex & PRIVATE_POINT_NUMBERS);
                let peak;
                if (hasEmbedded) {
                    peak = new Array(axisCount);
                    for (let k = 0; k < axisCount; k++) peak[k] = r.readF2Dot14();
                } else {
                    peak = sharedTuples[idx] || null;
                }
                let intermediateStart, intermediateEnd;
                if (intermediate) {
                    intermediateStart = new Array(axisCount);
                    for (let k = 0; k < axisCount; k++) intermediateStart[k] = r.readF2Dot14();
                    intermediateEnd = new Array(axisCount);
                    for (let k = 0; k < axisCount; k++) intermediateEnd[k] = r.readF2Dot14();
                }
                headers.push({ variationDataSize, peak, intermediateStart, intermediateEnd, privatePts });
            }
            const serialised = new Uint8Array(bytes.buffer, bytes.byteOffset + dataOffset, bytes.length - dataOffset);
            return { tupleVariationCount: tupleVariationCountValue, headers, serialisedData: serialised };
        }

        function unpackPointNumbers(bytes, offset) {
            let i = offset;
            const first = bytes[i++];
            let count;
            if (first === 0) return { points: [], bytesConsumed: 1 };
            if (first & 0x80) count = ((first & 0x7F) << 8) | bytes[i++];
            else count = first;
            const points = new Array(count);
            let last = 0;
            let idx = 0;
            while (idx < count) {
                const control = bytes[i++];
                const wordsFlag = !!(control & 0x80);
                const runLen = (control & 0x7F) + 1;
                for (let k = 0; k < runLen && idx < count; k++) {
                    let delta;
                    if (wordsFlag) {
                        delta = ((bytes[i] << 8) | bytes[i + 1]); i += 2;
                    } else {
                        delta = bytes[i++];
                    }
                    last += delta;
                    points[idx++] = last;
                }
            }
            return { points, bytesConsumed: i - offset };
        }

        function unpackDeltas(bytes, offset, count) {
            let i = offset;
            const out = new Array(count);
            let idx = 0;
            while (idx < count) {
                const control = bytes[i++];
                const wordsFlag = !!(control & 0x40);
                const zerosFlag = !!(control & 0x80);
                const runLen = (control & 0x3F) + 1;
                for (let k = 0; k < runLen && idx < count; k++) {
                    if (zerosFlag) {
                        out[idx++] = 0;
                    } else if (wordsFlag) {
                        out[idx++] = ((bytes[i] << 24) >> 16) | bytes[i + 1]; i += 2;
                    } else {
                        out[idx++] = (bytes[i] << 24) >> 24; i++;
                    }
                }
            }
            return { deltas: out, bytesConsumed: i - offset };
        }

        return {
            parseGvar, parseGlyphVariationData,
            unpackPointNumbers, unpackDeltas,
            EMBEDDED_PEAK_TUPLE, INTERMEDIATE_REGION, PRIVATE_POINT_NUMBERS, TUPLE_INDEX_MASK
        };
    }
};
