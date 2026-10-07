// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfFilterDispatch } from './dispatch.js';
import { pdfFlate } from './flate.js';
import { pdfParserObj } from '../parser-obj.js';
import { pdfAsciiHex } from './asciiHex.js';
import { pdfAscii85 }  from './ascii85.js';
import { pdfRunLength } from './runLength.js';
import { pdfErrors } from '../../errors.js';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman }   from '@awacloud/fw/io/compress/huffman.js';
import { deflate }   from '@awacloud/fw/io/compress/deflate.js';
import { lz77 }     from '@awacloud/fw/io/compress/lz77.js';
import { adler32}    from '@awacloud/fw/io/calc/adler32.js';
import { zlib }      from '@awacloud/fw/io/compress/zlib.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _err = _pdfErrors_TD1;
const { ParseError } = _err;
const { obj } = pdfParserObj.factory();

const te = new TextEncoder();

const hex = pdfAsciiHex.factory(_err);
const a85 = pdfAscii85.factory(_err);
const rl  = pdfRunLength.factory(_err);
const passthrough = { decode: (b) => b, encode: (b) => b };
const { normalizeFilterList, applyDecodeChain, applyEncodeChain, decodeStream } =
    pdfFilterDispatch.factory(_err, passthrough, hex, a85, rl);

const decoders = {
    ASCIIHexDecode:  hex,
    ASCII85Decode:   a85,
    RunLengthDecode: rl,
    FlateDecode:     passthrough  // stand-in for tests that don't need real Flate
};

// Real FlateDecode (with predictor support) for the /DecodeParms
// marshalling tests below — these must exercise the actual predictor
// codec, not the passthrough stand-in.
const rt = new ModuleRuntime();
rt.register(bitstream); rt.register(huffman); rt.register(lz77); rt.register(deflate);
rt.register(adler32);   rt.register(zlib);
const fwZlib = rt.resolve('zlib');
const realFlate = pdfFlate.factory(_err, fwZlib);
const flateDecoders = { FlateDecode: realFlate };

describe('normalizeFilterList', () => {
    test('null → []', () => {
        expect(normalizeFilterList(null)).toEqual([]);
    });

    test('single name', () => {
        expect(normalizeFilterList(obj.name('FlateDecode')))
            .toEqual(['FlateDecode']);
    });

    test('expands abbreviations', () => {
        expect(normalizeFilterList(obj.name('AHx')))
            .toEqual(['ASCIIHexDecode']);
        expect(normalizeFilterList(obj.name('Fl')))
            .toEqual(['FlateDecode']);
    });

    test('array', () => {
        const v = obj.array([obj.name('AHx'), obj.name('FlateDecode')]);
        expect(normalizeFilterList(v))
            .toEqual(['ASCIIHexDecode', 'FlateDecode']);
    });

    test('rejects non-name entries', () => {
        expect(() => normalizeFilterList(obj.array([obj.int(1)])))
            .toThrow(ParseError);
    });

    test('rejects unsupported type', () => {
        expect(() => normalizeFilterList(obj.int(1)))
            .toThrow(ParseError);
    });
});

describe('applyDecodeChain', () => {
    test('chains decoders left-to-right', () => {
        const src = te.encode('48656C6C6F>');
        const out = applyDecodeChain(src, ['ASCIIHexDecode'], null, decoders);
        expect(new TextDecoder().decode(out)).toBe('Hello');
    });

    test('errors on unknown filter', () => {
        expect(() => applyDecodeChain(new Uint8Array(0), ['FooDecode'], null, decoders))
            .toThrow(ParseError);
    });
});

describe('applyEncodeChain', () => {
    test('errors on missing encoder', () => {
        const noEncoder = { ASCIIHexDecode: { decode: (b) => b } };
        expect(() => applyEncodeChain(new Uint8Array(0), ['ASCIIHexDecode'], null, noEncoder))
            .toThrow(ParseError);
    });
});

describe('decodeStream', () => {
    test('walks /Filter chain', () => {
        const stream = obj.stream(
            obj.dict({ Filter: obj.name('AHx') }),
            te.encode('48656C6C6F>')
        );
        const out = decodeStream(stream, decoders);
        expect(new TextDecoder().decode(out)).toBe('Hello');
    });

    test('rejects non-stream input', () => {
        expect(() => decodeStream(obj.dict({}), decoders)).toThrow(ParseError);
    });

    test('rejects malformed /DecodeParms', () => {
        const stream = obj.stream(
            obj.dict({
                Filter: obj.name('AHx'),
                DecodeParms: obj.int(99)
            }),
            te.encode('00>')
        );
        expect(() => decodeStream(stream, decoders)).toThrow(ParseError);
    });
});

describe('decodeStream /DecodeParms marshalling (BL-1531)', () => {
    // 6x5 grayscale synthetic image, byte-aligned (bpc=8) — matches the
    // shape flate.test.js uses to exercise the predictor codec directly.
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

    test('single-dict /DecodeParms: Predictor 12 is actually applied', () => {
        const cols = 6, rows = 5, colors = 1;
        const src = makeImage(cols, rows, colors);
        const plainParams = { Predictor: 12, Columns: cols, Colors: colors, BitsPerComponent: 8 };
        const encoded = realFlate.encode(src, plainParams);

        // Sanity check: decoding with the SAME typed marshalling path but no
        // predictor applied must NOT reproduce src — i.e. the predictor is
        // load-bearing for this assertion (guards against a vacuous test).
        const noPredictorOut = realFlate.decode(encoded, null);
        expect(Array.from(noPredictorOut)).not.toEqual(Array.from(src));

        const stream = obj.stream(
            obj.dict({
                Filter: obj.name('FlateDecode'),
                DecodeParms: obj.dict({
                    Predictor: obj.int(12),
                    Columns: obj.int(cols),
                    Colors: obj.int(colors),
                    BitsPerComponent: obj.int(8)
                })
            }),
            encoded
        );
        const out = decodeStream(stream, flateDecoders);
        expect(Array.from(out)).toEqual(Array.from(src));
    });

    test('array /DecodeParms: one params dict per filter, with a null entry', () => {
        const cols = 4, rows = 3, colors = 1;
        const src = makeImage(cols, rows, colors);
        const plainParams = { Predictor: 12, Columns: cols, Colors: colors, BitsPerComponent: 8 };
        const flateEncoded = realFlate.encode(src, plainParams);
        const hexEncoded = hex.encode(flateEncoded);

        // /Filter [ASCIIHexDecode FlateDecode] — decoded in that order:
        // hex-decode first, then flate-decode (with predictor) second.
        const stream = obj.stream(
            obj.dict({
                Filter: obj.array([obj.name('AHx'), obj.name('Fl')]),
                DecodeParms: obj.array([
                    obj.nul(),
                    obj.dict({
                        Predictor: obj.int(12),
                        Columns: obj.int(cols),
                        Colors: obj.int(colors),
                        BitsPerComponent: obj.int(8)
                    })
                ])
            }),
            hexEncoded
        );
        const chainDecoders = { ASCIIHexDecode: hex, FlateDecode: realFlate };
        const out = decodeStream(stream, chainDecoders);
        expect(Array.from(out)).toEqual(Array.from(src));
    });

    test('absent /DecodeParms: decoded bytes byte-identical to today (no predictor)', () => {
        const src = te.encode('plain flate stream, no predictor at all');
        const encoded = realFlate.encode(src);
        const stream = obj.stream(
            obj.dict({ Filter: obj.name('FlateDecode') }),
            encoded
        );
        const out = decodeStream(stream, flateDecoders);
        expect(Array.from(out)).toEqual(Array.from(src));
        // Same result as calling the decoder directly with no params —
        // proves the marshalling path is a no-op when /DecodeParms is absent.
        expect(Array.from(out)).toEqual(Array.from(realFlate.decode(encoded, null)));
    });
});

describe('pdfFilterDispatch module', () => {
    test('module shape + worker safety', () => {
        expect(pdfFilterDispatch.name).toBe('pdfFilterDispatch');
        expect(pdfFilterDispatch.dependencies).toEqual([
            'pdfErrors', 'pdfFlate', 'pdfAsciiHex', 'pdfAscii85', 'pdfRunLength']);
        expect(pdfFilterDispatch.factory.toString()).toContain('function');
    });

    test('registers all standard filters', () => {
        const fakeFlate = { decode: (b) => b, encode: (b) => b };
        const m = pdfFilterDispatch.factory(_pdfErrors_TD1, fakeFlate, hex, a85, rl);
        const names = m.names();
        for (const expected of ['FlateDecode', 'ASCIIHexDecode',
                'ASCII85Decode', 'RunLengthDecode',
                'DCTDecode', 'JPXDecode', 'Crypt']) {
            expect(names).toContain(expected);
        }
    });

    test('register() adds a new decoder', () => {
        const m = pdfFilterDispatch.factory(passthrough, hex, a85, rl);
        m.register('Custom', { decode: (b) => new Uint8Array(b.length).fill(7) });
        const out = m.decodeChain(new Uint8Array(3), ['Custom'], null);
        expect(Array.from(out)).toEqual([7, 7, 7]);
    });

    test('DCT and JPX are passthrough', () => {
        const m = pdfFilterDispatch.factory(passthrough, hex, a85, rl);
        const src = new Uint8Array([1, 2, 3]);
        expect(Array.from(m.decodeChain(src, ['DCTDecode'], null))).toEqual([1, 2, 3]);
        expect(Array.from(m.decodeChain(src, ['JPXDecode'], null))).toEqual([1, 2, 3]);
    });
});
