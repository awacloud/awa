// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview FlateDecode filter wrapper.
 *
 * PDF FlateDecode (ISO 32000-2:2020 §7.4.4) uses zlib framing (RFC 1950).
 * `@awacloud/fw/io/compress/zlib` produces and consumes this format.
 *
 * Supports the optional `Predictor` DecodeParms:
 *   - 1                          : None (default)
 *   - 2                          : TIFF Predictor 2
 *   - 10, 11, 12, 13, 14         : PNG None/Sub/Up/Average/Paeth (per row)
 *   - 15                         : PNG optimum (encoder picks per row;
 *                                  decoder reads tag byte regardless)
 *
 * @module pdf/syntax/filters/flate
 */

/**
 * Module factory — worker-safe, self-contained.
 *
 * `fwZlib` is injected via the runtime dependency resolution.
 */
import { pdfErrors } from '../../errors.js';
import { zlib } from '@awacloud/fw/io/compress/zlib.js';

export const pdfFlate = {
    name: 'pdfFlate',
    dependencies: ['pdfErrors', 'zlib'],
    deps: [pdfErrors, zlib],
    factory(errors, fwZlib) {
        const { ParseError } = errors;
        if (!fwZlib || typeof fwZlib.unzlibSync !== 'function'
                    || typeof fwZlib.zlibSync   !== 'function') {
            throw new ParseError('pdf/flate/missing-fw',
                'pdfFlate requires the @awacloud/fw zlib module',
                { context: { keys: fwZlib && Object.keys(fwZlib) } });
        }

        function paeth(a, b, c) {
            const p = a + b - c;
            const pa = Math.abs(p - a);
            const pb = Math.abs(p - b);
            const pc = Math.abs(p - c);
            if (pa <= pb && pa <= pc) return a;
            if (pb <= pc) return b;
            return c;
        }

        function predictorParams(params) {
            const predictor = (params && params.predictor != null)
                ? params.predictor | 0 : ((params && params.Predictor != null)
                    ? params.Predictor | 0 : 1);
            const columns = (params && params.columns != null)
                ? params.columns | 0 : ((params && params.Columns != null)
                    ? params.Columns | 0 : 1);
            const colors = (params && params.colors != null)
                ? params.colors | 0 : ((params && params.Colors != null)
                    ? params.Colors | 0 : 1);
            const bpc = (params && params.bitsPerComponent != null)
                ? params.bitsPerComponent | 0
                : ((params && params.BitsPerComponent != null)
                    ? params.BitsPerComponent | 0 : 8);
            if (predictor !== 1 && predictor !== 2
                && (predictor < 10 || predictor > 15)) {
                throw new ParseError('pdf/flate/bad-predictor',
                    'unsupported Predictor value',
                    { context: { predictor } });
            }
            if (columns <= 0 || colors <= 0 || bpc <= 0) {
                throw new ParseError('pdf/flate/bad-predictor-params',
                    'Columns, Colors and BitsPerComponent must be > 0',
                    { context: { columns, colors, bpc } });
            }
            // Stride/row size in bytes — we support byte-aligned configs
            // (bpc multiple of 8) for the predictor codec. Sub-byte
            // configurations decode the raw bytes per row but apply
            // byte-wise PNG filters (TIFF Predictor 2 requires bpc=8).
            const bitsPerPixel = colors * bpc;
            const bytesPerPixel = Math.max(1, (bitsPerPixel + 7) >> 3);
            const rowBytes = ((columns * bitsPerPixel) + 7) >> 3;
            return { predictor, columns, colors, bpc, bytesPerPixel, rowBytes };
        }

        function pngUnfilterRow(filter, row, prevRow, bpp) {
            const out = new Uint8Array(row.length);
            for (let i = 0; i < row.length; i++) {
                const left = i >= bpp ? out[i - bpp] : 0;
                const up = prevRow ? prevRow[i] : 0;
                const upLeft = (prevRow && i >= bpp) ? prevRow[i - bpp] : 0;
                let v = row[i];
                switch (filter) {
                    case 0: break;                                  // None
                    case 1: v = (v + left) & 0xFF; break;           // Sub
                    case 2: v = (v + up) & 0xFF; break;             // Up
                    case 3: v = (v + ((left + up) >> 1)) & 0xFF; break; // Avg
                    case 4: v = (v + paeth(left, up, upLeft)) & 0xFF; break;
                    default:
                        throw new ParseError('pdf/flate/bad-png-filter',
                            'unknown PNG filter tag',
                            { context: { tag: filter } });
                }
                out[i] = v;
            }
            return out;
        }

        function pngFilterRow(filter, row, prevRow, bpp) {
            const out = new Uint8Array(row.length);
            for (let i = 0; i < row.length; i++) {
                const left = i >= bpp ? row[i - bpp] : 0;
                const up = prevRow ? prevRow[i] : 0;
                const upLeft = (prevRow && i >= bpp) ? prevRow[i - bpp] : 0;
                const v = row[i];
                switch (filter) {
                    case 0: out[i] = v; break;
                    case 1: out[i] = (v - left) & 0xFF; break;
                    case 2: out[i] = (v - up) & 0xFF; break;
                    case 3: out[i] = (v - ((left + up) >> 1)) & 0xFF; break;
                    case 4: out[i] = (v - paeth(left, up, upLeft)) & 0xFF; break;
                    default:
                        throw new ParseError('pdf/flate/bad-png-filter',
                            'unknown PNG filter tag',
                            { context: { tag: filter } });
                }
            }
            return out;
        }

        function tiff2Decode(bytes, p) {
            // TIFF Predictor 2: each sample = previous-sample-in-row + cur.
            // Operates per row, per component, byte-aligned (bpc=8).
            if (p.bpc !== 8) {
                throw new ParseError('pdf/flate/tiff-bpc-unsupported',
                    'TIFF Predictor 2 requires BitsPerComponent=8',
                    { context: { bpc: p.bpc } });
            }
            const out = new Uint8Array(bytes.length);
            const stride = p.colors;
            const rowBytes = p.rowBytes;
            const rows = (bytes.length / rowBytes) | 0;
            for (let r = 0; r < rows; r++) {
                const base = r * rowBytes;
                for (let i = 0; i < rowBytes; i++) {
                    const left = i >= stride ? out[base + i - stride] : 0;
                    out[base + i] = (bytes[base + i] + left) & 0xFF;
                }
            }
            return out;
        }

        function tiff2Encode(bytes, p) {
            if (p.bpc !== 8) {
                throw new ParseError('pdf/flate/tiff-bpc-unsupported',
                    'TIFF Predictor 2 requires BitsPerComponent=8',
                    { context: { bpc: p.bpc } });
            }
            const out = new Uint8Array(bytes.length);
            const stride = p.colors;
            const rowBytes = p.rowBytes;
            const rows = (bytes.length / rowBytes) | 0;
            for (let r = 0; r < rows; r++) {
                const base = r * rowBytes;
                for (let i = 0; i < rowBytes; i++) {
                    const left = i >= stride ? bytes[base + i - stride] : 0;
                    out[base + i] = (bytes[base + i] - left) & 0xFF;
                }
            }
            return out;
        }

        function pngDecode(bytes, p) {
            const rowBytes = p.rowBytes;
            const stride = rowBytes + 1; // +1 for filter tag
            if (bytes.length % stride !== 0) {
                throw new ParseError('pdf/flate/png-row-mismatch',
                    'predicted stream length is not a multiple of (rowBytes+1)',
                    { context: { length: bytes.length, stride } });
            }
            const rows = bytes.length / stride;
            const out = new Uint8Array(rows * rowBytes);
            let prev = null;
            for (let r = 0; r < rows; r++) {
                const tag = bytes[r * stride];
                const row = bytes.subarray(r * stride + 1, r * stride + stride);
                const unfiltered = pngUnfilterRow(tag, row, prev, p.bytesPerPixel);
                out.set(unfiltered, r * rowBytes);
                prev = unfiltered;
            }
            return out;
        }

        function pngEncode(bytes, p) {
            // For predictors 10..14, force the single filter type
            // (Predictor - 10). For Predictor 15 (optimum), use Up for
            // rows after the first, None for the first — a simple and
            // deterministic heuristic; downstream decoders read the tag.
            const rowBytes = p.rowBytes;
            if (bytes.length % rowBytes !== 0) {
                throw new ParseError('pdf/flate/png-row-mismatch',
                    'input length is not a multiple of rowBytes',
                    { context: { length: bytes.length, rowBytes } });
            }
            const rows = bytes.length / rowBytes;
            const outStride = rowBytes + 1;
            const out = new Uint8Array(rows * outStride);
            const forced = p.predictor === 15 ? -1 : (p.predictor - 10);
            let prev = null;
            for (let r = 0; r < rows; r++) {
                const row = bytes.subarray(r * rowBytes, (r + 1) * rowBytes);
                let tag = forced;
                if (tag < 0) tag = r === 0 ? 0 : 2; // optimum heuristic
                const filtered = pngFilterRow(tag, row, prev, p.bytesPerPixel);
                out[r * outStride] = tag;
                out.set(filtered, r * outStride + 1);
                prev = row;
            }
            return out;
        }

        // fw's inflate reports "input exhausted before the final block" as
        // error code 0 ('unexpected EOF'); every other failure has its own code.
        function endedBeforeFinalBlock(e) {
            return !!e && e.code === 0;
        }

        // Inflate `bytes` through the streaming decoder WITHOUT signalling the
        // end of input, and return everything it emitted (possibly empty).
        function inflatePrefix(bytes) {
            const chunks = [];
            let total = 0;
            const stream = new fwZlib.UnzlibStream((chunk) => {
                chunks.push(chunk);
                total += chunk.length;
            });
            stream.push(bytes, false);
            const out = new Uint8Array(total);
            let off = 0;
            for (const chunk of chunks) { out.set(chunk, off); off += chunk.length; }
            return out;
        }

        function markTruncated(out) {
            Object.defineProperty(out, 'truncated', { value: true, enumerable: false });
            return out;
        }

        function decode(bytes, params) {
            if (!(bytes instanceof Uint8Array)) {
                throw new ParseError('pdf/flate/bad-input',
                    'FlateDecode expects Uint8Array');
            }
            let raw;
            let truncated = false;
            try {
                raw = fwZlib.unzlibSync(bytes);
            } catch (e) {
                const inflateFailed = () => new ParseError('pdf/flate/inflate-failed',
                    'inflate failed: ' + (e && e.message),
                    { context: { length: bytes.length }, cause: e });
                if (!endedBeforeFinalBlock(e)
                        || typeof fwZlib.UnzlibStream !== 'function') {
                    throw inflateFailed();
                }
                // A stream that ends before its final deflate block yields the
                // bytes decoded so far, flagged `truncated` (viewers do the same).
                let prefix;
                try { prefix = inflatePrefix(bytes); } catch { throw inflateFailed(); }
                if (prefix.length === 0) throw inflateFailed();
                raw = prefix;
                truncated = true;
            }
            const done = (out) => (truncated ? markTruncated(out) : out);
            if (!params) return done(raw);
            const hasPredictor = (params.predictor != null && params.predictor !== 1)
                || (params.Predictor != null && params.Predictor !== 1);
            if (!hasPredictor) return done(raw);
            const p = predictorParams(params);
            if (p.predictor === 1) return done(raw);
            // A truncated prefix keeps only its whole predicted rows; a complete
            // stream keeps the strict row check.
            const stride = p.predictor === 2 ? p.rowBytes : p.rowBytes + 1;
            if (truncated) raw = raw.subarray(0, raw.length - (raw.length % stride));
            if (p.predictor === 2) return done(tiff2Decode(raw, p));
            return done(pngDecode(raw, p));
        }

        function encode(bytes, params) {
            if (!(bytes instanceof Uint8Array)) {
                throw new ParseError('pdf/flate/bad-input',
                    'FlateEncode expects Uint8Array');
            }
            let payload = bytes;
            if (params) {
                const hasPredictor = (params.predictor != null && params.predictor !== 1)
                    || (params.Predictor != null && params.Predictor !== 1);
                if (hasPredictor) {
                    const p = predictorParams(params);
                    if (p.predictor === 2) payload = tiff2Encode(bytes, p);
                    else if (p.predictor >= 10) payload = pngEncode(bytes, p);
                }
            }
            try {
                return fwZlib.zlibSync(payload);
            } catch (e) {
                throw new ParseError('pdf/flate/deflate-failed',
                    'deflate failed: ' + (e && e.message),
                    { context: { length: payload.length }, cause: e });
            }
        }
        return { decode, encode };
    }
};
