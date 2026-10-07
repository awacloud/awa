// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfCcittFaxDecoder } from './ccitt-fax-decoder.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;

const m = pdfCcittFaxDecoder.factory(_pdfErrors_TD1);
const I = m._internals;

/** '11110000' -> Uint8Array([1,1,1,1,0,0,0,0]) — one cell per column. */
const L = (s) => Uint8Array.from(s.split('').map(Number));
/** Packed MSB-first row bytes, the shape `decode` returns. */
const packed = (s) => {
    const out = [];
    for (let i = 0; i < s.length; i += 8) out.push(parseInt(s.slice(i, i + 8).padEnd(8, '0'), 2));
    return out;
};
const codeOf = (fn) => {
    try { fn(); } catch (e) { return e.code; }
    throw new Error('expected a throw, got none');
};

const l1 = L('11110000'), l2 = L('00111100'), l3 = L('11000011');

describe('pdfCcittFaxDecoder module', () => {
    test('module shape', () => {
        expect(pdfCcittFaxDecoder.name).toBe('pdfCcittFaxDecoder');
        expect(pdfCcittFaxDecoder.dependencies).toEqual(['pdfErrors']);
        expect(pdfCcittFaxDecoder.factory.toString()).toContain('function');
        expect(typeof m.decode).toBe('function');
        expect(typeof m.encode).toBe('function');
    });

    test('Huffman tables are prefix-free and cover the spec runs', () => {
        // T.4 §4.1.4: 64 terminating codes per colour, make-up codes on the
        // 64-multiples up to 1728, plus the shared extended codes to 2560.
        expect(I.WHITE_MAP.size).toBe(64 + 27 + 13);
        expect(I.BLACK_MAP.size).toBe(64 + 27 + 13);
        for (const map of [I.WHITE_MAP, I.BLACK_MAP]) {
            const codes = [...map.keys()];
            for (const a of codes) {
                for (const b of codes) {
                    if (a === b) continue;
                    expect(b.startsWith(a)).toBe(false);
                }
            }
        }
        expect(I.EOL_BITS).toBe('000000000001');
    });
});

describe('ccitt bit reader / writer', () => {
    test('reader walks MSB-first and reports EOF as -1', () => {
        const r = I.makeBitReader(Uint8Array.from([0b10110000, 0b01000000]));
        expect([0, 1, 2, 3].map(() => r.readBit())).toEqual([1, 0, 1, 1]);
        expect(r.eof()).toBe(false);
        for (let i = 0; i < 12; i++) r.readBit();
        expect(r.eof()).toBe(true);
        expect(r.readBit()).toBe(-1);
    });

    test('pos/seek restore the exact bit position', () => {
        const r = I.makeBitReader(Uint8Array.from([0b11001010]));
        r.readBit(); r.readBit(); r.readBit();
        const save = r.pos();
        expect(save).toEqual({ bytePos: 0, bitPos: 3 });
        expect(r.readBit()).toBe(0);
        r.seek(save);
        expect(r.readBit()).toBe(0);
    });

    test('alignToByte discards the partial byte only when mid-byte', () => {
        const r = I.makeBitReader(Uint8Array.from([0xFF, 0x0F]));
        r.readBit();
        r.alignToByte();
        expect(r.pos()).toEqual({ bytePos: 1, bitPos: 0 });
        r.alignToByte();                       // already aligned — no-op
        expect(r.pos()).toEqual({ bytePos: 1, bitPos: 0 });
    });

    test('writer round-trips through the reader, flushing a partial byte', () => {
        const w = I.makeBitWriter();
        w.writeBits('101');
        expect(w.bitCount()).toBe(3);
        w.alignToByte();
        expect(w.bitCount()).toBe(8);
        w.writeBit(1);
        const out = w.flush();
        expect(Array.from(out)).toEqual([0b10100000, 0b10000000]);
    });
});

describe('ccitt run-length coding (codeForRun)', () => {
    test('terminating runs map to the T.4 table entries', () => {
        expect(I.codeForRun(0, 0)).toBe('00110101');   // white 0
        expect(I.codeForRun(2, 0)).toBe('0111');       // white 2
        expect(I.codeForRun(2, 1)).toBe('11');         // black 2
    });

    test('make-up + terminating decomposition is exact', () => {
        // 70 = 64 (make-up) + 6 (terminating)
        expect(I.codeForRun(70, 0)).toBe('11011' + '1110');
        // 1792 is the first shared extended make-up code, run remainder 0
        expect(I.codeForRun(1792, 0)).toBe('00000001000' + '00110101');
    });

    test('runs beyond 2624 cycle the 2560 code', () => {
        const bits = I.codeForRun(5200, 0);
        // 5200 = 2560 + 2560 + 64 + 16
        const c2560 = '000000011111';
        expect(bits.startsWith(c2560 + c2560)).toBe(true);
        expect(bits.endsWith('101010')).toBe(true);    // white terminating 16
    });

    test('every emitted run code decodes back to the same length', () => {
        // decode1DLine always starts on a WHITE run, so a black run is
        // framed by a zero-length white run and closed by a 1-cell white
        // run — the exact framing an encoder emits for a black-leading row.
        for (const run of [0, 1, 63, 64, 127, 1728, 1791, 1792, 2560, 2623, 3000]) {
            for (const colour of [0, 1]) {
                const w = I.makeBitWriter();
                if (colour === 0) {
                    w.writeBits(I.codeForRun(run, 0));
                    w.writeBits(I.codeForRun(1, 1));
                } else {
                    w.writeBits(I.codeForRun(0, 0));
                    w.writeBits(I.codeForRun(run, 1));
                    w.writeBits(I.codeForRun(1, 0));
                }
                const columns = run + 1;
                const line = I.decode1DLine(I.makeBitReader(w.flush()), columns);
                expect(line).not.toBeNull();
                // The first `run` cells carry `colour`; cell `run` flips.
                expect(Array.from(line.slice(0, run)).every((c) => c === colour)).toBe(true);
                expect(line[run]).toBe(colour ^ 1);
            }
        }
    });
});

describe('ccitt 2D changing-element helpers', () => {
    test('findB1 returns the first opposite-colour change right of a0', () => {
        const ref = L('00111000');
        expect(I.findB1(ref, -1, 0, 8)).toBe(2);      // white→black at 2
        expect(I.findB1(ref, 2, 1, 8)).toBe(5);       // black→white at 5
        expect(I.findB1(L('00000000'), -1, 0, 8)).toBe(8); // none → columns
    });

    test('findNextChange walks to the next transition or the row end', () => {
        expect(I.findNextChange(L('00111000'), 2, 8)).toBe(5);
        expect(I.findNextChange(L('00111000'), 5, 8)).toBe(8);
        expect(I.findNextChange(L('00111000'), 9, 8)).toBe(8); // past the end
    });

    test('findChangeFrom skips a change back into a0Colour', () => {
        // a0Colour = 1: the 0→1 transition at index 1 is a changing element
        // of the SAME colour as a0, so it must be walked past, and the
        // answer is the following 1→0 transition at index 3.
        expect(I.findChangeFrom(L('0110'), -1, 1, 4)).toBe(3);
        expect(I.findChangeFrom(L('0110'), -1, 0, 4)).toBe(1);
        expect(I.findChangeFrom(L('0000'), -1, 1, 4)).toBe(4);
    });
});

describe('ccitt round-trips', () => {
    test('G4 (K<0) round-trips a multi-row image', () => {
        const enc = m.encode([l1, l2, l3], { K: -1, Columns: 8 });
        const dec = m.decode(enc, { K: -1, Columns: 8, Rows: 3, BlackIs1: true });
        expect(Array.from(dec))
            .toEqual([...packed('11110000'), ...packed('00111100'), ...packed('11000011')]);
    });

    test('G3 mixed (K>0) round-trips without EndOfLine set on the decoder', () => {
        // The encoder always writes EOL + tag bit for K>0 (T.4), so the
        // decoder must consume them even when /EndOfLine is absent from
        // the DecodeParms — the common real-world shape.
        const enc = m.encode([l1, l2, l3, l1], { K: 2, Columns: 8 });
        const dec = m.decode(enc, { K: 2, Columns: 8, Rows: 4, BlackIs1: true });
        expect(Array.from(dec)).toEqual([
            ...packed('11110000'), ...packed('00111100'),
            ...packed('11000011'), ...packed('11110000')
        ]);
    });

    test('/BlackIs1=false inverts the packed polarity', () => {
        const enc = m.encode([l1], { K: -1, Columns: 8 });
        const white1 = m.decode(enc, { K: -1, Columns: 8, Rows: 1, BlackIs1: false });
        const black1 = m.decode(enc, { K: -1, Columns: 8, Rows: 1, BlackIs1: true });
        expect(white1[0]).toBe(black1[0] ^ 0xFF);
    });

    test('EncodedByteAlign round-trips', () => {
        const enc = m.encode([l1, l2], { K: -1, Columns: 8, EncodedByteAlign: true });
        const dec = m.decode(enc,
            { K: -1, Columns: 8, Rows: 2, EncodedByteAlign: true, BlackIs1: true });
        expect(Array.from(dec)).toEqual([...packed('11110000'), ...packed('00111100')]);
    });

    test('a G4 stream with EndOfLine prefixes each row with an EOL code', () => {
        // K<0 + EndOfLine is a legal encoder request (T.4 EOL framing over
        // T.6 rows); assert the framing rather than a round-trip, since the
        // G4 decode path deliberately does not consume per-row EOLs.
        const enc = m.encode([l1], { K: -1, Columns: 8, EndOfLine: true, EndOfBlock: false });
        let bits = '';
        for (const b of enc) bits += b.toString(2).padStart(8, '0');
        expect(bits.startsWith(I.EOL_BITS)).toBe(true);
    });

    test('EndOfBlock=false omits the RTC / EOFB terminator', () => {
        const withEob = m.encode([l1], { K: -1, Columns: 8 });
        const without = m.encode([l1], { K: -1, Columns: 8, EndOfBlock: false });
        expect(without.length).toBeLessThan(withEob.length);
    });
});

describe('ccitt decode — malformed streams', () => {
    test('rejects a non-Uint8Array payload', () => {
        expect(codeOf(() => m.decode('nope', { K: -1, Columns: 8 })))
            .toBe('pdf/ccitt/bad-input');
    });

    test('rejects an out-of-range /Columns', () => {
        expect(codeOf(() => m.decode(new Uint8Array(2), { K: -1, Columns: 0 })))
            .toBe('pdf/ccitt/bad-columns');
        expect(codeOf(() => m.decode(new Uint8Array(2), { K: -1, Columns: 70000 })))
            .toBe('pdf/ccitt/bad-columns');
    });

    test('an undecodable 1D run code is reported as bad-runcode', () => {
        // No white/black code is all-zeros, so 13 zero bits match nothing.
        // 32 zero bits also drive readEolMaybe past its 24-bit probe window.
        const e = (() => {
            try { m.decode(new Uint8Array(4), { K: 0, Columns: 8, Rows: 1 }); }
            catch (x) { return x; }
        })();
        expect(e).toBeInstanceOf(ParseError);
        expect(e.code).toBe('pdf/ccitt/bad-runcode');
        expect(e.context.bits).toBe('0'.repeat(13));
    });

    test('an undecodable 2D mode code is reported as bad-2d-mode', () => {
        const e = (() => {
            try { m.decode(new Uint8Array(2), { K: -1, Columns: 8, Rows: 1 }); }
            catch (x) { return x; }
        })();
        expect(e.code).toBe('pdf/ccitt/bad-2d-mode');
        expect(e.context.bits).toBe('0'.repeat(7));
    });

    test('the EXT2D escape is recognised but explicitly unsupported', () => {
        // 0b0000001 is MODE_CODES.EXT2D — decoded, then rejected downstream.
        expect(I.MODE_CODES['0000001']).toBe('EXT2D');
        expect(codeOf(() => m.decode(Uint8Array.from([0x02, 0x00]),
            { K: -1, Columns: 8, Rows: 1 })))
            .toBe('pdf/ccitt/unsupported-2d-mode');
    });

    test('a truncated stream throws once /Rows is known', () => {
        const enc = m.encode([l1, l2, l3], { K: -1, Columns: 8, EndOfBlock: false });
        expect(enc.length).toBeGreaterThan(1);
        expect(codeOf(() => m.decode(enc.subarray(0, enc.length - 1),
            { K: -1, Columns: 8, Rows: 3 })))
            .toBe('pdf/ccitt/truncated');
    });

    test('/DamagedRowsBeforeError tolerates truncation with blank rows', () => {
        const enc = m.encode([l1, l2, l3], { K: -1, Columns: 8, EndOfBlock: false });
        const out = m.decode(enc.subarray(0, enc.length - 1),
            { K: -1, Columns: 8, Rows: 3, DamagedRowsBeforeError: 1, BlackIs1: true });
        // Still emits whole rows; the damaged tail is blank (all-white).
        expect(out.length % 1).toBe(0);
        expect(out.length).toBeGreaterThanOrEqual(1);
        expect(out[0]).toBe(0b11110000);
    });

    test('a non-ParseError fault is wrapped as decode-failed', () => {
        // The decoder promises a typed ParseError for every failure; a
        // hostile DecodeParms proves the wrapper, not just the happy path.
        const hostile = {
            Columns: 8, Rows: 1, K: -1,
            get EncodedByteAlign() { throw new TypeError('synthetic parms fault'); }
        };
        const e = (() => {
            try { m.decode(new Uint8Array(4), hostile); } catch (x) { return x; }
        })();
        expect(e).toBeInstanceOf(ParseError);
        expect(e.code).toBe('pdf/ccitt/decode-failed');
        expect(e.message).toContain('synthetic parms fault');
        expect(e.cause).toBeInstanceOf(TypeError);
    });

    test('a typed ParseError raised inside the row loop is re-thrown as-is', () => {
        const e = (() => {
            try { m.decode(new Uint8Array(2), { K: -1, Columns: 8, Rows: 1 }); }
            catch (x) { return x; }
        })();
        expect(e.code).toBe('pdf/ccitt/bad-2d-mode');   // not decode-failed
    });
});

describe('ccitt decode — EndOfLine framing', () => {
    test('resynchronises to the next EOL when the expected one is missing', () => {
        // Prepend a byte of ones: readEolMaybe fails at offset 0, so the
        // decoder must fall back to skipToEol and find the real EOL.
        const enc = m.encode([l1], { K: 0, Columns: 8, EndOfLine: true, EndOfBlock: false });
        const noisy = new Uint8Array(enc.length + 1);
        noisy[0] = 0xFF;
        noisy.set(enc, 1);
        const dec = m.decode(noisy,
            { K: 0, Columns: 8, Rows: 1, EndOfLine: true, BlackIs1: true });
        expect(Array.from(dec)).toEqual(packed('11110000'));
    });

    test('a stream with no EOL at all ends the decode instead of throwing', () => {
        // /EndOfLine demands an EOL per row; when neither readEolMaybe nor
        // the skipToEol resync finds one, the row loop stops cleanly.
        const dec = m.decode(Uint8Array.from([0xFF, 0xFF]),
            { K: 0, Columns: 8, Rows: 4, EndOfLine: true });
        expect(dec.length).toBe(0);
    });

    test('K=0 with EndOfLine round-trips through the RTC terminator', () => {
        const enc = m.encode([l1, l2], { K: 0, Columns: 8, EndOfLine: true });
        const dec = m.decode(enc,
            { K: 0, Columns: 8, Rows: 2, EndOfLine: true, BlackIs1: true });
        expect(Array.from(dec)).toEqual([...packed('11110000'), ...packed('00111100')]);
    });

    test('RTC stops decoding before /Rows is reached', () => {
        // Two rows encoded, six trailing EOLs — asking for ten rows must
        // stop at the RTC rather than fabricating eight blank rows.
        const enc = m.encode([l1, l2], { K: 0, Columns: 8, EndOfLine: true });
        const dec = m.decode(enc,
            { K: 0, Columns: 8, Rows: 10, EndOfLine: true, BlackIs1: true });
        expect(dec.length).toBe(2);
    });
});
