// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: read side of three legacy or heavyweight filters.
 *
 * Covers the read side of three filters that are still encountered in
 * legacy PDFs but are deprecated or impractical to fully implement in
 * pure JS:
 *
 *   - LZWDecode    — thin wrapper over @awacloud/fw/io/compress/lzw using
 *                    the TIFF profile (MSB-first, 8-bit minCodeBits,
 *                    CLEAR/END markers). The PDF /EarlyChange
 *                    DecodeParm is supported.
 *   - CCITTFaxDecode — validates the `/DecodeParms` dictionary (K, Columns,
 *                    Rows, EncodedByteAlign, EndOfLine, EndOfBlock, BlackIs1,
 *                    DamagedRowsBeforeError) and decodes through
 *                    `pdfCcittFaxDecoder`, a full ITU-T T.4 (Group 3, 1-D and
 *                    mixed 1-D/2-D) and T.6 (Group 4) decoder.
 *   - DCTDecode    — passthrough (JPEG bytes are returned as-is).
 *   - JPXDecode    — passthrough (JPEG 2000 bytes are returned as-is).
 *
 * @module pdf/extra/legacy-deprecated-filters
 */

import { pdfErrors } from '../errors.js';
import { lzw } from '@awacloud/fw/io/compress/lzw.js';
import { pdfCcittFaxDecoder } from './ccitt-fax-decoder.js';

export const pdfLegacyDeprecatedFilters = {
    name: 'pdfLegacyDeprecatedFilters',
    dependencies: ['pdfErrors', 'lzw', 'pdfCcittFaxDecoder'],
    deps: [pdfErrors, lzw, pdfCcittFaxDecoder],

    factory(errors, lzwImpl, ccittImpl) {
        const { ParseError } = errors;
        const CCITT_KEYS = new Set([
            'K', 'EndOfLine', 'EncodedByteAlign', 'Columns', 'Rows',
            'EndOfBlock', 'BlackIs1', 'DamagedRowsBeforeError'
        ]);
        if (!lzwImpl || typeof lzwImpl.decode !== 'function'
                     || typeof lzwImpl.encode !== 'function') {
            throw new ParseError('pdf/filters/missing-lzw',
                'legacy-deprecated-filters requires the @awacloud/fw lzw factory output');
        }
        if (!ccittImpl || typeof ccittImpl.decode !== 'function') {
            throw new ParseError('pdf/filters/missing-ccitt',
                'legacy-deprecated-filters requires the pdfCcittFaxDecoder factory output');
        }

        function asBytes(x) {
            if (x instanceof Uint8Array) return x;
            throw new ParseError('pdf/filters/bad-input',
                'filter input must be Uint8Array',
                { context: { type: typeof x } });
        }

        function lzwDecode(bytes, decodeParms) {
            asBytes(bytes);
            const earlyChange = decodeParms && decodeParms.EarlyChange != null
                ? decodeParms.EarlyChange : 1;
            if (earlyChange !== 0 && earlyChange !== 1) {
                throw new ParseError('pdf/lzw/bad-earlychange',
                    '/EarlyChange must be 0 or 1',
                    { context: { value: earlyChange } });
            }
            try {
                return lzwImpl.decode(bytes, {
                    bigEndian: true,
                    minCodeBits: 8,
                    maxBits: 12,
                    useClearEnd: true
                });
            } catch (cause) {
                throw new ParseError('pdf/lzw/decode-failed',
                    'LZWDecode failed: ' + cause.message,
                    { cause });
            }
        }

        function lzwEncode(bytes) {
            asBytes(bytes);
            try {
                return lzwImpl.encode(bytes, {
                    bigEndian: true,
                    minCodeBits: 8,
                    maxBits: 12,
                    useClearEnd: true
                });
            } catch (cause) {
                throw new ParseError('pdf/lzw/encode-failed',
                    'LZWEncode failed: ' + cause.message,
                    { cause });
            }
        }

        function validateCcittParms(parms) {
            if (parms == null) return { K: 0 };
            if (typeof parms !== 'object') {
                throw new ParseError('pdf/ccitt/bad-parms',
                    'CCITT DecodeParms must be an object');
            }
            for (const k of Object.keys(parms)) {
                if (!CCITT_KEYS.has(k)) {
                    throw new ParseError('pdf/ccitt/unknown-parm',
                        'unknown CCITT DecodeParm',
                        { context: { key: k } });
                }
            }
            const out = {
                K: parms.K != null ? parms.K | 0 : 0,
                EndOfLine: !!parms.EndOfLine,
                EncodedByteAlign: !!parms.EncodedByteAlign,
                Columns: parms.Columns != null ? parms.Columns | 0 : 1728,
                Rows: parms.Rows != null ? parms.Rows | 0 : 0,
                EndOfBlock: parms.EndOfBlock !== false,
                BlackIs1: !!parms.BlackIs1,
                DamagedRowsBeforeError: parms.DamagedRowsBeforeError | 0
            };
            return out;
        }

        function ccittFaxDecode(bytes, decodeParms) {
            asBytes(bytes);
            const parms = validateCcittParms(decodeParms);
            // Real T.4/T.6 codec is provided by pdfCcittFaxDecoder.
            //   K < 0  : Group 4 (T.6), pure 2D.
            //   K == 0 : Group 3 1D (T.4 baseline).
            //   K > 0  : Group 3 mixed — each block of K rows starts with
            //            a 1D-coded row followed by up to K-1 2D-coded rows.
            return ccittImpl.decode(bytes, parms);
        }

        function dctDecode(bytes) {
            // JPEG SOI marker check, then passthrough.
            asBytes(bytes);
            if (bytes.length >= 2 && (bytes[0] !== 0xFF || bytes[1] !== 0xD8)) {
                throw new ParseError('pdf/dct/bad-soi',
                    'DCTDecode input missing JPEG SOI marker');
            }
            return bytes;
        }

        function jpxDecode(bytes) {
            asBytes(bytes);
            // Either codestream (SOC FF4F) or JP2 box stream (sig
            // 0000000C 6A50 2020 0D0A 870A). Accept both.
            if (bytes.length >= 2) {
                if (bytes[0] === 0xFF && bytes[1] === 0x4F) return bytes;
                if (bytes.length >= 12 &&
                    bytes[4] === 0x6A && bytes[5] === 0x50 &&
                    bytes[6] === 0x20 && bytes[7] === 0x20) return bytes;
            }
            throw new ParseError('pdf/jpx/bad-signature',
                'JPXDecode input does not look like JPEG 2000');
        }

        return {
            lzwDecode, lzwEncode,
            validateCcittParms, ccittFaxDecode,
            dctDecode, jpxDecode,
            CCITT_KEYS
        };
    }
};
