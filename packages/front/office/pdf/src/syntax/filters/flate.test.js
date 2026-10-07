// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfFlate } from './flate.js';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman }   from '@awacloud/fw/io/compress/huffman.js';
import { deflate }   from '@awacloud/fw/io/compress/deflate.js';
import { lz77 }     from '@awacloud/fw/io/compress/lz77.js';
import { adler32}    from '@awacloud/fw/io/calc/adler32.js';
import { zlib }      from '@awacloud/fw/io/compress/zlib.js';
import { pdfErrors } from '../../errors.js';
import { pdfFilterDispatch } from './dispatch.js';
import { pdfAsciiHex } from './asciiHex.js';
import { pdfAscii85 } from './ascii85.js';
import { pdfRunLength } from './runLength.js';
import { pdfParserObj } from '../parser-obj.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const errors = _pdfErrors_TD1;
const { ParseError } = errors;
const createFlate = (fwZlib) => pdfFlate.factory(errors, fwZlib);

const te = new TextEncoder();
const rt = new ModuleRuntime();
rt.register(bitstream); rt.register(huffman); rt.register(lz77); rt.register(deflate);
rt.register(adler32);   rt.register(zlib);
const fw = rt.resolve('zlib');

describe('createFlate', () => {
    test('roundtrips data', () => {
        const src = te.encode('hello hello hello hello hello hello hello');
        const flate = createFlate(fw);
        const enc = flate.encode(src);
        const dec = flate.decode(enc);
        expect(Array.from(dec)).toEqual(Array.from(src));
    });

    test('rejects bad fw input', () => {
        expect(() => createFlate(null)).toThrow(ParseError);
        expect(() => createFlate({})).toThrow(ParseError);
    });

    test('decode rejects non-Uint8Array', () => {
        const flate = createFlate(fw);
        expect(() => flate.decode('nope')).toThrow(ParseError);
    });

    test('decode wraps inflate errors', () => {
        const flate = createFlate(fw);
        expect(() => flate.decode(new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF])))
            .toThrow(ParseError);
    });
});

describe('createFlate predictor', () => {
    // 4x3 grayscale, bpc=8, colors=1, columns=4
    // Synthetic gradient-ish data with patterns.
    const makeImage = (cols, rows, colors) => {
        const out = new Uint8Array(cols * rows * colors);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                for (let k = 0; k < colors; k++) {
                    out[(r * cols + c) * colors + k] = (r * 13 + c * 7 + k * 31) & 0xFF;
                }
            }
        }
        return out;
    };

    test('roundtrips TIFF Predictor 2 (gray)', () => {
        const flate = createFlate(fw);
        const src = makeImage(8, 4, 1);
        const params = { Predictor: 2, Columns: 8, Colors: 1, BitsPerComponent: 8 };
        const enc = flate.encode(src, params);
        const dec = flate.decode(enc, params);
        expect(Array.from(dec)).toEqual(Array.from(src));
    });

    test('roundtrips TIFF Predictor 2 (RGB)', () => {
        const flate = createFlate(fw);
        const src = makeImage(6, 5, 3);
        const params = { Predictor: 2, Columns: 6, Colors: 3, BitsPerComponent: 8 };
        const enc = flate.encode(src, params);
        const dec = flate.decode(enc, params);
        expect(Array.from(dec)).toEqual(Array.from(src));
    });

    test('roundtrips PNG Up (Predictor 12)', () => {
        const flate = createFlate(fw);
        const src = makeImage(10, 6, 1);
        const params = { Predictor: 12, Columns: 10, Colors: 1, BitsPerComponent: 8 };
        const enc = flate.encode(src, params);
        const dec = flate.decode(enc, params);
        expect(Array.from(dec)).toEqual(Array.from(src));
    });

    test('roundtrips all PNG predictors 10..14', () => {
        const flate = createFlate(fw);
        const src = makeImage(7, 5, 3);
        for (let pr = 10; pr <= 14; pr++) {
            const params = { Predictor: pr, Columns: 7, Colors: 3, BitsPerComponent: 8 };
            const enc = flate.encode(src, params);
            const dec = flate.decode(enc, params);
            expect(Array.from(dec)).toEqual(Array.from(src));
        }
    });

    test('roundtrips PNG optimum (Predictor 15)', () => {
        const flate = createFlate(fw);
        const src = makeImage(12, 8, 1);
        const params = { Predictor: 15, Columns: 12, Colors: 1, BitsPerComponent: 8 };
        const enc = flate.encode(src, params);
        const dec = flate.decode(enc, params);
        expect(Array.from(dec)).toEqual(Array.from(src));
    });

    test('Predictor=1 is a no-op', () => {
        const flate = createFlate(fw);
        const src = te.encode('hello world');
        const params = { Predictor: 1, Columns: src.length };
        const enc = flate.encode(src, params);
        const dec = flate.decode(enc, params);
        expect(Array.from(dec)).toEqual(Array.from(src));
    });

    test('rejects unsupported Predictor value', () => {
        const flate = createFlate(fw);
        const src = makeImage(4, 2, 1);
        expect(() => flate.encode(src, { Predictor: 7, Columns: 4 })).toThrow(ParseError);
    });

    test('rejects mismatched row length on decode', () => {
        const flate = createFlate(fw);
        const src = makeImage(4, 2, 1);
        const enc = flate.encode(src, { Predictor: 12, Columns: 4 });
        // Decode with wrong columns triggers stride mismatch.
        expect(() => flate.decode(enc, { Predictor: 12, Columns: 5 }))
            .toThrow(ParseError);
    });

    test('camelCase param names also work', () => {
        const flate = createFlate(fw);
        const src = makeImage(5, 3, 1);
        const enc = flate.encode(src, { predictor: 12, columns: 5, colors: 1, bitsPerComponent: 8 });
        const dec = flate.decode(enc, { predictor: 12, columns: 5 });
        expect(Array.from(dec)).toEqual(Array.from(src));
    });
});

describe('createFlate — malformed input and predictor guards', () => {
    const codeOf = (fn) => {
        try { fn(); } catch (e) { return e.code; }
        throw new Error('expected a throw, got none');
    };
    const flate = createFlate(fw);

    test('encode rejects non-Uint8Array', () => {
        expect(codeOf(() => flate.encode('nope'))).toBe('pdf/flate/bad-input');
        expect(codeOf(() => flate.encode([1, 2, 3]))).toBe('pdf/flate/bad-input');
    });

    test('Columns / Colors / BitsPerComponent must all be > 0', () => {
        const src = new Uint8Array([1, 2, 3, 4]);
        expect(codeOf(() => flate.encode(src, { Predictor: 12, Columns: 0 })))
            .toBe('pdf/flate/bad-predictor-params');
        expect(codeOf(() => flate.encode(src, { Predictor: 12, Columns: 4, Colors: 0 })))
            .toBe('pdf/flate/bad-predictor-params');
        expect(codeOf(() => flate.encode(src,
            { Predictor: 12, Columns: 4, Colors: 1, BitsPerComponent: 0 })))
            .toBe('pdf/flate/bad-predictor-params');
    });

    test('TIFF Predictor 2 refuses a non-8 BitsPerComponent, both directions', () => {
        const src = new Uint8Array([1, 2, 3, 4]);
        const parms = { Predictor: 2, Columns: 4, Colors: 1, BitsPerComponent: 4 };
        expect(codeOf(() => flate.encode(src, parms)))
            .toBe('pdf/flate/tiff-bpc-unsupported');
        // Decode side has its own guard: feed it a well-formed zlib frame so
        // the throw provably comes from tiff2Decode, not from inflate.
        const framed = fw.zlibSync(src);
        expect(flate.decode(framed)).toEqual(src);
        expect(codeOf(() => flate.decode(framed, parms)))
            .toBe('pdf/flate/tiff-bpc-unsupported');
    });

    test('PNG decode rejects an unknown per-row filter tag', () => {
        // rowBytes = 4 (columns 4, colors 1, bpc 8) → stride 5; tag byte 7
        // is not one of None/Sub/Up/Average/Paeth.
        const predicted = new Uint8Array([7, 10, 20, 30, 40]);
        const framed = fw.zlibSync(predicted);
        expect(codeOf(() => flate.decode(framed, { Predictor: 12, Columns: 4 })))
            .toBe('pdf/flate/bad-png-filter');
        // Same bytes with a legal tag (0 = None) decode to the row verbatim.
        const ok = fw.zlibSync(new Uint8Array([0, 10, 20, 30, 40]));
        expect(Array.from(flate.decode(ok, { Predictor: 12, Columns: 4 })))
            .toEqual([10, 20, 30, 40]);
    });

    test('PNG encode rejects an input that is not a whole number of rows', () => {
        expect(codeOf(() => flate.encode(new Uint8Array(7), { Predictor: 12, Columns: 4 })))
            .toBe('pdf/flate/png-row-mismatch');
    });

    test('deflate failures are wrapped as pdf/flate/deflate-failed', () => {
        // The factory only requires both zlib entry points to be callable, so
        // a throwing zlibSync exercises the encode-side catch.
        const boom = createFlate({
            unzlibSync: () => new Uint8Array(0),
            zlibSync() { throw new Error('synthetic deflate failure'); }
        });
        const e = (() => { try { boom.encode(new Uint8Array([1])); } catch (x) { return x; } })();
        expect(e).toBeInstanceOf(ParseError);
        expect(e.code).toBe('pdf/flate/deflate-failed');
        expect(e.message).toContain('synthetic deflate failure');
    });
});

describe('createFlate — truncated streams', () => {
    const flate = createFlate(fw);
    const errOf = (fn) => {
        try { fn(); } catch (e) { return e; }
        throw new Error('expected a throw, got none');
    };

    // 64 KiB of content-stream-like operators, varied enough that the
    // deflate payload spans many KiB.
    const makeContent = (size) => {
        const parts = [];
        let len = 0;
        let seed = 12345;
        for (let i = 0; len < size; i++) {
            seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
            const line = `BT /F${seed % 7} ${8 + (seed % 9)} Tf ${(seed % 500) + 36}.${seed % 100} `
                + `${(seed >> 8) % 800}.${(seed >> 4) % 1000} Td (Line ${i} word${seed % 997}) Tj ET\n`;
            parts.push(line);
            len += line.length;
        }
        return te.encode(parts.join('')).subarray(0, size);
    };
    const original = makeContent(64 * 1024);
    const complete = fw.zlibSync(original);
    // Drop the final 20 bytes (the Adler-32 footer and the tail of the last
    // deflate block): the stream ends before its final block completes.
    const cut = complete.subarray(0, complete.length - 20);

    test('the synthetic cut is an unexpected-EOF failure for strict inflate', () => {
        const e = errOf(() => fw.unzlibSync(cut));
        expect(e.code).toBe(0);
        expect(e.message).toBe('unexpected EOF');
    });

    test('a stream that ends before its final block yields the decoded prefix', () => {
        const out = flate.decode(cut);
        expect(out).toBeInstanceOf(Uint8Array);
        expect(out.length).toBeGreaterThan(0);
        expect(out.length).toBeLessThan(original.length);
        expect(original.subarray(0, out.length)).toEqual(out);
        expect(out.truncated).toBe(true);
    });

    test('the truncated flag is non-enumerable', () => {
        const out = flate.decode(cut);
        expect(Object.keys(out)).not.toContain('truncated');
        expect(Object.prototype.propertyIsEnumerable.call(out, 'truncated')).toBe(false);
        expect(Object.getOwnPropertyDescriptor(out, 'truncated').value).toBe(true);
        // Spread and equality only see the bytes.
        expect([...out]).toEqual(Array.from(original.subarray(0, out.length)));
        expect(out).toEqual(new Uint8Array(original.subarray(0, out.length)));
    });

    test('a complete stream is unchanged and carries no truncated flag', () => {
        const out = flate.decode(complete);
        expect(out).toEqual(original);
        expect(out.truncated).toBeUndefined();
        expect(Object.getOwnPropertyDescriptor(out, 'truncated')).toBeUndefined();
    });

    test('a bad zlib header still throws pdf/flate/inflate-failed with the cause', () => {
        const junk = new Uint8Array(64);
        for (let i = 0; i < junk.length; i++) junk[i] = (i * 151 + 7) & 0xFF;
        junk[0] = 0xFF; junk[1] = 0xFF;
        const e = errOf(() => flate.decode(junk));
        expect(e).toBeInstanceOf(ParseError);
        expect(e.code).toBe('pdf/flate/inflate-failed');
        expect(e.cause).toBeInstanceOf(Error);
        expect(e.cause.code).not.toBe(0);
    });

    test('a corrupted Adler-32 footer on a complete stream behaves as before', () => {
        // fw's unzlibSync does not verify the Adler-32 trailer: a complete
        // stream with a wrong checksum decoded before this change and still
        // decodes, unflagged — the recovery arm is never entered.
        const bad = new Uint8Array(complete);
        bad[bad.length - 1] ^= 0xFF;
        bad[bad.length - 2] ^= 0x5A;
        expect(fw.unzlibSync(bad)).toEqual(original);
        const out = flate.decode(bad);
        expect(out).toEqual(original);
        expect(out.truncated).toBeUndefined();
    });

    test('a stream truncated inside the zlib header throws (nothing decoded)', () => {
        for (const n of [0, 1]) {
            const e = errOf(() => flate.decode(complete.subarray(0, n)));
            expect(e).toBeInstanceOf(ParseError);
            expect(e.code).toBe('pdf/flate/inflate-failed');
            expect(e.cause).toBeInstanceOf(Error);
        }
    });

    test('an unexpected EOF with an empty decoded prefix throws with the ORIGINAL cause', () => {
        // Header plus five bytes: strict inflate fails with code 0, the stream
        // path decodes nothing, so the strict error is kept as the cause.
        const slice = complete.subarray(0, 7);
        const strict = errOf(() => fw.unzlibSync(slice));
        expect(strict.code).toBe(0);
        const e = errOf(() => flate.decode(slice));
        expect(e).toBeInstanceOf(ParseError);
        expect(e.code).toBe('pdf/flate/inflate-failed');
        expect(e.cause.code).toBe(0);
        expect(e.cause.message).toBe('unexpected EOF');
    });

    test('a throwing stream path rethrows inflate-failed with the ORIGINAL cause', () => {
        const original0 = Object.assign(new Error('unexpected EOF'), { code: 0 });
        function ThrowingStream() {}
        ThrowingStream.prototype.push = () => { throw new Error('stream boom'); };
        const stubbed = createFlate({
            zlibSync: fw.zlibSync,
            unzlibSync() { throw original0; },
            UnzlibStream: ThrowingStream
        });
        const e = errOf(() => stubbed.decode(new Uint8Array([0x78, 0x9C, 1, 2, 3])));
        expect(e.code).toBe('pdf/flate/inflate-failed');
        expect(e.cause).toBe(original0);
    });

    test('without UnzlibStream an unexpected EOF still throws as before', () => {
        const original0 = Object.assign(new Error('unexpected EOF'), { code: 0 });
        const stubbed = createFlate({
            zlibSync: fw.zlibSync,
            unzlibSync() { throw original0; }
        });
        const e = errOf(() => stubbed.decode(new Uint8Array([0x78, 0x9C, 1, 2, 3])));
        expect(e.code).toBe('pdf/flate/inflate-failed');
        expect(e.cause).toBe(original0);
    });

    test('other inflate failures are never recovered', () => {
        // A non-EOF failure from the strict path throws even though the
        // stream path would have produced bytes.
        const other = Object.assign(new Error('invalid distance'), { code: 3 });
        let streamUsed = false;
        function DecodingStream(ondata) { this.ondata = ondata; }
        DecodingStream.prototype.push = function () {
            streamUsed = true;
            this.ondata(new Uint8Array([1, 2, 3]), false);
        };
        const stubbed = createFlate({
            zlibSync: fw.zlibSync,
            unzlibSync() { throw other; },
            UnzlibStream: DecodingStream
        });
        const e = errOf(() => stubbed.decode(new Uint8Array([0x78, 0x9C, 1, 2, 3])));
        expect(e.code).toBe('pdf/flate/inflate-failed');
        expect(e.cause).toBe(other);
        expect(streamUsed).toBe(false);
    });

    const makeNoise = (length) => {
        const out = new Uint8Array(length);
        let seed = 99;
        for (let i = 0; i < out.length; i++) {
            seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
            out[i] = (seed >> 16) & 0x0F;
        }
        return out;
    };

    test('PNG predictor on a truncated prefix decodes whole rows only', () => {
        const params = { Predictor: 12, Columns: 4, Colors: 1, BitsPerComponent: 8 };
        const src = makeNoise(4 * 4000);
        const truncatedEnc = (() => {
            const enc = flate.encode(src, params);
            return enc.subarray(0, enc.length - 20);
        })();
        // The raw prefix ends mid-row (stride = Columns + 1 = 5)...
        const raw = flate.decode(truncatedEnc);
        expect(raw.truncated).toBe(true);
        expect(raw.length % 5).not.toBe(0);
        // ...yet the predicted decode keeps the whole rows, no row mismatch.
        const out = flate.decode(truncatedEnc, params);
        expect(out.truncated).toBe(true);
        expect(out.length).toBe(Math.floor(raw.length / 5) * 4);
        expect(out.length).toBeGreaterThan(0);
        expect(src.subarray(0, out.length)).toEqual(out);
        expect(Object.keys(out)).not.toContain('truncated');
    });

    test('TIFF predictor on a truncated prefix decodes whole rows only', () => {
        const params = { Predictor: 2, Columns: 7, Colors: 3, BitsPerComponent: 8 };
        const src = makeNoise(21 * 3000);
        const enc = flate.encode(src, params);
        const truncatedEnc = enc.subarray(0, enc.length - 20);
        const raw = flate.decode(truncatedEnc);
        expect(raw.length % 21).not.toBe(0);
        const out = flate.decode(truncatedEnc, params);
        expect(out.truncated).toBe(true);
        expect(out.length).toBe(Math.floor(raw.length / 21) * 21);
        expect(out.length).toBeGreaterThan(0);
        expect(src.subarray(0, out.length)).toEqual(out);
    });

    test('a complete predicted stream keeps the strict row check', () => {
        // 9 bytes is not a whole number of 5-byte predicted rows.
        const framed = fw.zlibSync(new Uint8Array([0, 1, 2, 3, 4, 0, 5, 6, 7]));
        const e = errOf(() => flate.decode(framed, { Predictor: 12, Columns: 4 }));
        expect(e.code).toBe('pdf/flate/png-row-mismatch');
    });

    test('the dispatch returns the prefix of a truncated FlateDecode stream', () => {
        const { obj } = pdfParserObj.factory();
        const dispatch = pdfFilterDispatch.factory(errors, flate,
            pdfAsciiHex.factory(errors), pdfAscii85.factory(errors),
            pdfRunLength.factory(errors));
        const stream = obj.stream(obj.dict({ Filter: obj.name('FlateDecode') }), cut);
        const out = dispatch.decode(stream);
        expect(out.length).toBeGreaterThan(0);
        expect(original.subarray(0, out.length)).toEqual(out);
        expect(out.truncated).toBe(true);
    });

    test('the recovery rule is stated inside the factory', () => {
        expect(pdfFlate.factory.toString()).toContain('truncated');
    });
});

describe('pdfFlate module', () => {
    test('module shape', () => {
        expect(pdfFlate.name).toBe('pdfFlate');
        expect(pdfFlate.dependencies).toEqual(['pdfErrors', 'zlib']);
        expect(pdfFlate.factory.toString()).toContain('function');
        const m = pdfFlate.factory(_pdfErrors_TD1, fw);
        expect(typeof m.decode).toBe('function');
        expect(typeof m.encode).toBe('function');
    });
});
