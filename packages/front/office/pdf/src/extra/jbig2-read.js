// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: JBIG2Decode partial reader.
 *
 * JBIG2 is the bilevel image codec referenced by /Filter /JBIG2Decode
 * (ISO 32000-2:2020 §7.4.7). A full decoder is out of scope; this
 * module parses the segment header chain (ISO/IEC 14492:2001 §7.2) and
 * returns descriptors so callers can at least enumerate the embedded
 * data without pulling in a heavyweight decoder.
 *
 * Status: PARTIAL — header-only.
 *
 * @module pdf/extra/jbig2-read
 */

import { pdfErrors } from '../errors.js';

export const pdfJbig2Read = {
    name: 'pdfJbig2Read',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],

    factory(errors) {
        const { ParseError } = errors;
        const SEGMENT_TYPES = {
            0:  'symbolDictionary',
            4:  'intermediateTextRegion',
            6:  'immediateTextRegion',
            7:  'immediateLosslessTextRegion',
            16: 'patternDictionary',
            20: 'intermediateHalftoneRegion',
            22: 'immediateHalftoneRegion',
            23: 'immediateLosslessHalftoneRegion',
            36: 'intermediateGenericRegion',
            38: 'immediateGenericRegion',
            39: 'immediateLosslessGenericRegion',
            40: 'intermediateGenericRefinementRegion',
            42: 'immediateGenericRefinementRegion',
            43: 'immediateLosslessGenericRefinementRegion',
            48: 'pageInformation',
            49: 'endOfPage',
            50: 'endOfStripe',
            51: 'endOfFile',
            52: 'profiles',
            53: 'tables',
            62: 'extension'
        };

        function readUint32BE(b, o) {
            return (b[o] * 0x1000000) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
        }

        function readReferredSegmentCount(b, o) {
            // First byte's top 3 bits = count; if = 7 => long form (next 3 bytes hold (count<<5)|reserved).
            const head = b[o];
            const small = head >>> 5;
            if (small !== 7) {
                return { count: small, fieldBytes: 1 };
            }
            // Long form: 4 bytes total, count uses 29 high bits of next 32-bit value.
            const longVal = readUint32BE(b, o) & 0x1FFFFFFF;
            return { count: longVal, fieldBytes: 4 };
        }

        function refSegSize(count) {
            // Each retention flag bit + alignment to byte, plus references.
            // We don't need the retention flag bytes' contents; just to skip.
            return Math.ceil((count + 1) / 8);
        }

        function refNumberSize(maxSegNum) {
            if (maxSegNum <= 0xFF)      return 1;
            if (maxSegNum <= 0xFFFF)    return 2;
            return 4;
        }

        function parseSegments(bytes) {
            if (!(bytes instanceof Uint8Array)) {
                throw new ParseError('pdf/jbig2/bad-input',
                    'JBIG2Decode expects Uint8Array');
            }
            const out = [];
            let o = 0;
            let lastSegNum = 0;
            while (o + 11 <= bytes.length) {
                const start = o;
                const segNum = readUint32BE(bytes, o); o += 4;
                const flags = bytes[o++];
                const type = flags & 0x3F;
                const retainBit = (flags >> 6) & 1;
                const deferredNonRetainBit = (flags >> 7) & 1;

                const ref = readReferredSegmentCount(bytes, o);
                o += ref.fieldBytes;
                // Skip retention flag bytes (count+1 bits rounded up).
                o += refSegSize(ref.count);
                // Skip referred segment numbers.
                const rns = refNumberSize(Math.max(segNum, lastSegNum));
                o += ref.count * rns;
                if (o + 4 > bytes.length) {
                    throw new ParseError('pdf/jbig2/truncated-header',
                        'JBIG2 segment header truncated',
                        { context: { segNum, offset: start } });
                }
                // Page association — 1 or 4 bytes; we assume 1-byte mode
                // unless the page-association-size flag in the header
                // suggests 4 (we have no header — JBIG2 sequential
                // streams in PDF are headerless, defaulting to 1).
                o += 1;
                if (o + 4 > bytes.length) {
                    throw new ParseError('pdf/jbig2/truncated-data-length',
                        'JBIG2 segment data length truncated',
                        { context: { segNum, offset: start } });
                }
                const dataLength = readUint32BE(bytes, o); o += 4;
                const dataStart = o;
                if (dataLength !== 0xFFFFFFFF) {
                    if (dataStart + dataLength > bytes.length) {
                        throw new ParseError('pdf/jbig2/truncated-data',
                            'JBIG2 segment data truncated',
                            { context: { segNum, dataLength } });
                    }
                    o = dataStart + dataLength;
                } else {
                    // Unknown length — caller must scan for EOF.
                    // We bail and surface the partial descriptor.
                    o = bytes.length;
                }
                out.push({
                    segmentNumber: segNum,
                    type,
                    typeName: SEGMENT_TYPES[type] || 'unknown',
                    referredCount: ref.count,
                    retain: !!retainBit,
                    deferredNonRetain: !!deferredNonRetainBit,
                    dataOffset: dataStart,
                    dataLength: dataLength === 0xFFFFFFFF ? null : dataLength,
                    unknownLength: dataLength === 0xFFFFFFFF
                });
                lastSegNum = Math.max(lastSegNum, segNum);
                if (type === 51) break; // endOfFile
            }
            return out;
        }

        function enumerateGenericRegions(bytes) {
            const segs = parseSegments(bytes);
            return segs.filter(s => s.type === 36 || s.type === 38 || s.type === 39);
        }

        function decode(_bytes) {
            throw new ParseError('pdf/jbig2/not-implemented',
                'JBIG2Decode full decode not implemented — header-only',
                { context: { status: 'partial' } });
        }

        return {
            parseSegments,
            enumerateGenericRegions,
            decode,
            SEGMENT_TYPES,
            STATUS: 'partial — header-only'
        };
    }
};
