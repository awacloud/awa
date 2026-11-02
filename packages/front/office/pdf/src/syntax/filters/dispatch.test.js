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

describe('typeStreamEntries', () => {
    const { typeStreamEntries } = pdfFilterDispatch.factory(_err, passthrough, hex, a85, rl);
    const bytes = (s) => te.encode(s);
    const ABSENT = { length: null, filter: [], decodeParms: null, f: null, fFilter: [], fDecodeParms: null, dl: null };

    test('every Table 5 entry, from a stream', () => {
        const parms = obj.dict({ Predictor: obj.int(12), Columns: obj.int(4) });
        const fparms = obj.dict({ K: obj.int(-1) });
        const s = obj.stream(obj.dict({
            Length: obj.int(42), Filter: obj.array([obj.name('ASCII85Decode'), obj.name('FlateDecode')]),
            DecodeParms: obj.array([obj.nul(), parms]), F: obj.string(bytes('data.bin')),
            FFilter: obj.name('CCITTFaxDecode'), FDecodeParms: fparms, DL: obj.int(1000)
        }), new Uint8Array(0));
        expect(typeStreamEntries(s)).toEqual({
            length: 42, filter: ['ASCII85Decode', 'FlateDecode'], decodeParms: [null, parms],
            f: bytes('data.bin'), fFilter: ['CCITTFaxDecode'], fDecodeParms: [fparms], dl: 1000
        });
    });

    test('a bare stream dictionary is read the same way; references for Length and F', () => {
        const fs = obj.dict({ Type: obj.name('Filespec') });
        expect(typeStreamEntries(obj.dict({ Length: obj.ref(9, 0), F: fs }))).toEqual({ ...ABSENT, length: { num: 9, gen: 0 }, f: fs });
        expect(typeStreamEntries(obj.dict({ F: obj.ref(4, 2) })).f).toEqual({ num: 4, gen: 2 });
    });

    test('a name filter gives a one-name list, abbreviations kept as read', () => {
        const r = typeStreamEntries(obj.dict({ Filter: obj.name('Fl'), DecodeParms: obj.dict({}) }));
        expect(r.filter).toEqual(['Fl']);
        expect(r.decodeParms).toEqual([obj.dict({})]);
    });

    test('absent entries: empty filter lists, the others null', () => {
        expect(typeStreamEntries(obj.stream(obj.dict({}), new Uint8Array(0)))).toEqual(ABSENT);
    });

    test('a value of another type gives null', () => {
        const wrong = obj.bool(true);
        expect(typeStreamEntries(obj.dict({
            Length: obj.real(4.5), Filter: wrong, DecodeParms: wrong, F: obj.int(3),
            FFilter: obj.array([obj.name('A'), obj.int(1)]), FDecodeParms: obj.array([obj.int(1)]), DL: obj.int(-1)
        }))).toEqual({ length: null, filter: null, decodeParms: null, f: null, fFilter: null, fDecodeParms: null, dl: null });
    });

    test('neither a stream nor a dictionary throws pdf/filter/not-stream', () => {
        let err = null;
        try { typeStreamEntries(obj.array([])); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(ParseError);
        expect(err.code).toBe('pdf/filter/not-stream');
        expect(() => typeStreamEntries(null)).toThrow(ParseError);
    });
});

describe('typeDecodeParms (A40d)', () => {
    const { typeDecodeParms, DECODE_PARMS_KEYS } = pdfFilterDispatch.factory(_err, passthrough, hex, a85, rl);
    const { ContractError } = _err;
    const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };

    test('Flate and LZW predictor parameters, an abbreviation resolved', () => {
        const d = obj.dict({ Predictor: obj.int(12), Colors: obj.int(3), BitsPerComponent: obj.int(8), Columns: obj.int(4), Foo: obj.int(1) });
        const r = typeDecodeParms(d, 'FlateDecode');
        expect([r.predictor, r.colors, r.bitspercomponent, r.columns, r._extras, r.raw]).toEqual([12, 3, 8, 4, { Foo: obj.int(1) }, d]);
        const l = typeDecodeParms(obj.dict({ EarlyChange: obj.int(0), Predictor: obj.int(2) }), 'LZW');
        expect([l.earlychange, l.predictor]).toEqual([0, 2]);
        expect(typeDecodeParms(obj.dict({ EarlyChange: obj.int(0) }), 'Fl')._extras).toEqual({ EarlyChange: obj.int(0) });
    });

    test('CCITT fax, DCT, JBIG2 and Crypt parameters; a wrong type null', () => {
        const c = typeDecodeParms(obj.dict({ K: obj.int(-1), EndOfLine: obj.bool(true), EncodedByteAlign: obj.bool(false), Columns: obj.int(1728),
            Rows: obj.int(10), EndOfBlock: obj.bool(true), BlackIs1: obj.bool(false), DamagedRowsBeforeError: obj.int(0) }), 'CCF');
        expect([c.k, c.endofline, c.encodedbytealign, c.columns, c.rows, c.endofblock, c.blackis1, c.damagedrowsbeforeerror])
            .toEqual([-1, true, false, 1728, 10, true, false, 0]);
        expect(typeDecodeParms(obj.dict({ ColorTransform: obj.int(1) }), 'DCTDecode').colortransform).toBe(1);
        const g = obj.ref(8, 0);
        expect(typeDecodeParms(obj.dict({ JBIG2Globals: g }), 'JBIG2Decode').jbig2globals).toBe(g);
        const cr = typeDecodeParms(obj.dict({ Type: obj.name('CryptFilterDecodeParms'), Name: obj.name('StdCF') }), 'Crypt');
        expect([cr.type, cr.name]).toEqual(['CryptFilterDecodeParms', 'StdCF']);
        expect(typeDecodeParms(obj.dict({ K: obj.name('x') }), 'CCITTFaxDecode').k).toBe(null);
    });

    test('every filter of DECODE_PARMS_KEYS types every key of its list; errors', () => {
        expect(Object.keys(DECODE_PARMS_KEYS).sort()).toEqual(['CCITTFaxDecode', 'Crypt', 'DCTDecode', 'FlateDecode', 'JBIG2Decode', 'LZWDecode']);
        for (const [filter, keys] of Object.entries(DECODE_PARMS_KEYS)) {
            const entries = {};
            for (const k of keys) entries[k] = obj.ref(1, 0);
            expect(typeDecodeParms(obj.dict(entries), filter)._extras).toEqual({});
        }
        expect(code(() => typeDecodeParms(obj.array([]), 'FlateDecode'))).toEqual([ParseError.name, 'pdf/filter/decodeparms/not-dict']);
        expect(code(() => typeDecodeParms(obj.dict({}), 'ASCIIHexDecode'))).toEqual([ContractError.name, 'pdf/filter/decodeparms/filter']);
    });
});
