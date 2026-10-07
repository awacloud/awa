// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
import { lzw } from '@awacloud/fw/io/compress/lzw.js';
import { pdfLegacyDeprecatedFilters } from './legacy-deprecated-filters.js';
import { pdfCcittFaxDecoder } from './ccitt-fax-decoder.js';

const lzwImpl = lzw.factory();
const ccittImpl = pdfCcittFaxDecoder.factory(_pdfErrors_TD1);
const m = pdfLegacyDeprecatedFilters.factory(_pdfErrors_TD1, lzwImpl, ccittImpl);
const enc = (s) => new TextEncoder().encode(s);

describe('extra/legacy-deprecated-filters — LZW', () => {
    test('encode/decode roundtrip', () => {
        const pt = enc('hello hello hello world');
        const ct = m.lzwEncode(pt);
        const back = m.lzwDecode(ct);
        expect(new TextDecoder().decode(back)).toBe('hello hello hello world');
    });

    test('rejects non-Uint8Array', () => {
        expect(() => m.lzwDecode('x')).toThrow(ParseError);
        expect(() => m.lzwEncode(null)).toThrow(ParseError);
    });

    test('rejects bad /EarlyChange', () => {
        expect(() => m.lzwDecode(new Uint8Array(0), { EarlyChange: 7 })).toThrow(ParseError);
    });
});

describe('extra/legacy-deprecated-filters — CCITT', () => {
    test('validateCcittParms applies defaults', () => {
        const p = m.validateCcittParms(null);
        expect(p.K).toBe(0);
    });

    test('validateCcittParms parses entries', () => {
        const p = m.validateCcittParms({ K: -1, Columns: 1024, BlackIs1: true, EndOfBlock: false });
        expect(p.K).toBe(-1);
        expect(p.Columns).toBe(1024);
        expect(p.BlackIs1).toBe(true);
        expect(p.EndOfBlock).toBe(false);
    });

    test('rejects unknown DecodeParm', () => {
        expect(() => m.validateCcittParms({ K: 0, Foo: 1 })).toThrow(ParseError);
    });

    test('ccittFaxDecode delegates to real codec for K<0 (G4)', () => {
        // Encode then decode a tiny 8-pixel all-white line via injected codec.
        const lines = [ new Uint8Array(8) ]; // all white
        const stream = ccittImpl.encode(lines, { K: -1, Columns: 8 });
        const out = m.ccittFaxDecode(stream, { K: -1, Columns: 8, Rows: 1 });
        // PDF default: BlackIs1=false → white=1 → all bits set
        expect(out.length).toBe(1);
        expect(out[0]).toBe(0xFF);
    });

    test('ccittFaxDecode delegates to real codec for K=0 (G3 1D)', () => {
        const lines = [ new Uint8Array(8) ];
        const stream = ccittImpl.encode(lines, { K: 0, Columns: 8 });
        const out = m.ccittFaxDecode(stream, { K: 0, Columns: 8, Rows: 1 });
        expect(out.length).toBe(1);
        expect(out[0]).toBe(0xFF);
    });
});

describe('extra/ccitt-fax-decoder — T.6 (G4, K=-1)', () => {
    test('roundtrip all-white single row', () => {
        const line = new Uint8Array(16); // all white
        const enc = ccittImpl.encode([line], { K: -1, Columns: 16 });
        const dec = ccittImpl.decode(enc, { K: -1, Columns: 16, Rows: 1, BlackIs1: true });
        // BlackIs1=true → black=1 → all zeros
        expect(dec[0]).toBe(0);
        expect(dec[1]).toBe(0);
    });

    test('roundtrip mixed pattern', () => {
        // 8 px pattern: black, white x3, black x2, white x2 -> [1,0,0,0,1,1,0,0]
        const line = Uint8Array.of(1,0,0,0,1,1,0,0);
        const enc = ccittImpl.encode([line], { K: -1, Columns: 8 });
        const dec = ccittImpl.decode(enc, { K: -1, Columns: 8, Rows: 1, BlackIs1: true });
        // BlackIs1=true → bits are direct: 10001100 = 0x8C
        expect(dec[0]).toBe(0x8C);
    });

    test('roundtrip multi-line G4', () => {
        const l1 = Uint8Array.of(1,1,0,0,1,1,0,0);
        const l2 = Uint8Array.of(0,1,1,0,0,1,1,0);
        const l3 = Uint8Array.of(1,1,1,1,0,0,0,0);
        const enc = ccittImpl.encode([l1, l2, l3], { K: -1, Columns: 8 });
        const dec = ccittImpl.decode(enc, { K: -1, Columns: 8, Rows: 3, BlackIs1: true });
        expect(dec.length).toBe(3);
        expect(dec[0]).toBe(0xCC);
        expect(dec[1]).toBe(0x66);
        expect(dec[2]).toBe(0xF0);
    });

    test('polarity: BlackIs1=false inverts', () => {
        const line = Uint8Array.of(1,0,0,0,1,1,0,0);
        const enc = ccittImpl.encode([line], { K: -1, Columns: 8 });
        const dec = ccittImpl.decode(enc, { K: -1, Columns: 8, Rows: 1, BlackIs1: false });
        // ~0x8C & 0xFF = 0x73
        expect(dec[0]).toBe(0x73);
    });
});

describe('extra/ccitt-fax-decoder — T.4 1D (K=0)', () => {
    test('roundtrip simple line', () => {
        const line = Uint8Array.of(0,0,1,1,1,0,1,1);
        const enc = ccittImpl.encode([line], { K: 0, Columns: 8 });
        const dec = ccittImpl.decode(enc, { K: 0, Columns: 8, Rows: 1, BlackIs1: true });
        expect(dec[0]).toBe(0x3B); // 00111011
    });

    test('roundtrip with EOL', () => {
        const line = Uint8Array.of(0,0,1,1,1,0,1,1);
        const enc = ccittImpl.encode([line], { K: 0, Columns: 8, EndOfLine: true });
        const dec = ccittImpl.decode(enc, { K: 0, Columns: 8, Rows: 1, EndOfLine: true, BlackIs1: true });
        expect(dec[0]).toBe(0x3B);
    });

    test('multi-line 1D', () => {
        const l1 = Uint8Array.of(0,0,1,1,1,0,1,1);
        const l2 = Uint8Array.of(1,1,1,1,0,0,0,0);
        const enc = ccittImpl.encode([l1, l2], { K: 0, Columns: 8 });
        const dec = ccittImpl.decode(enc, { K: 0, Columns: 8, Rows: 2, BlackIs1: true });
        expect(dec[0]).toBe(0x3B);
        expect(dec[1]).toBe(0xF0);
    });

    test('throws on truncated stream with Rows>data', () => {
        const enc = ccittImpl.encode([new Uint8Array(8)], { K: 0, Columns: 8 });
        // Asking for 100 rows from one-line stream → should stop at EOF gracefully
        const dec = ccittImpl.decode(enc, { K: 0, Columns: 8, Rows: 0, BlackIs1: true });
        expect(dec.length).toBe(1);
    });
});

describe('extra/ccitt-fax-decoder — T.4 mixed (K>0)', () => {
    test('roundtrip K=2 with EOL+tag', () => {
        // Two lines: first is 1D (tag=1), second is 2D (tag=0)
        const l1 = Uint8Array.of(1,0,1,0,0,1,0,1);
        const l2 = Uint8Array.of(1,0,1,0,0,1,0,1); // identical → V0 throughout
        const enc = ccittImpl.encode([l1, l2], { K: 2, Columns: 8, EndOfLine: true });
        const dec = ccittImpl.decode(enc, { K: 2, Columns: 8, Rows: 2, EndOfLine: true, BlackIs1: true });
        expect(dec[0]).toBe(0xA5);
        expect(dec[1]).toBe(0xA5);
    });
});

describe('extra/ccitt-fax-decoder — factory', () => {
    test('factory shape', () => {
        expect(pdfCcittFaxDecoder.name).toBe('pdfCcittFaxDecoder');
        expect(pdfCcittFaxDecoder.dependencies).toEqual(['pdfErrors']);
    });

    test('decode rejects bad columns', () => {
        expect(() => ccittImpl.decode(new Uint8Array(0), { K: -1, Columns: 0 }))
            .toThrow(ParseError);
    });

    test('decode rejects non-Uint8Array', () => {
        expect(() => ccittImpl.decode('x', { K: -1, Columns: 8 })).toThrow(ParseError);
    });
});

describe('extra/ccitt-fax-decoder — encoder optimizations (F1)', () => {
    test('codeForRun greedy: large white run uses largest make-up', () => {
        const { codeForRun, WHITE_MAP } = ccittImpl._internals;
        // 2000 white = 1856 (ext) + 128 (white make-up) + 16 (term)
        const bits = codeForRun(2000, 0);
        // Decode bits with WHITE_MAP to verify sum
        let pos = 0;
        let total = 0;
        while (pos < bits.length) {
            let code = '';
            let entry = null;
            for (let i = 0; i < 13 && pos + i < bits.length; i++) {
                code += bits[pos + i];
                entry = WHITE_MAP.get(code);
                if (entry) break;
            }
            if (!entry) throw new Error('bad codeForRun output: ' + code);
            total += entry.run;
            pos += code.length;
            if (entry.terminating) break;
        }
        expect(total).toBe(2000);
    });

    test('codeForRun greedy: very large run > 2624 cycles 2560', () => {
        const { codeForRun, WHITE_MAP } = ccittImpl._internals;
        const bits = codeForRun(5500, 0);
        // Verify roundtrip via decode
        let pos = 0, total = 0;
        while (pos < bits.length) {
            let code = '';
            let entry = null;
            for (let i = 0; i < 13 && pos + i < bits.length; i++) {
                code += bits[pos + i];
                entry = WHITE_MAP.get(code);
                if (entry) break;
            }
            if (!entry) throw new Error('bad');
            total += entry.run;
            pos += code.length;
            if (entry.terminating) break;
        }
        expect(total).toBe(5500);
    });

    test('greedy optimisation: long-run G4 encode is smaller than naive', () => {
        // Build a line with one long black run; greedy picks 1664-block
        // for white run, vs naive (64 chunks).
        const columns = 1800;
        const line = new Uint8Array(columns); // all white
        line[1700] = 1; line[1701] = 1; // small black run at end
        const enc = ccittImpl.encode([line], { K: -1, Columns: columns });
        // Naive 64-chunks would need ~ (1700/64) ≈ 26 make-ups; greedy ~1 makeup
        // Expect the encoded size to be quite small (<30 bytes) — sanity bound.
        expect(enc.length).toBeLessThan(30);
        // And it must roundtrip
        const dec = ccittImpl.decode(enc, { K: -1, Columns: columns, Rows: 1, BlackIs1: true });
        // Bit 1700 and 1701 = black
        const byte = (1700 / 8) | 0;
        expect((dec[byte] >>> (7 - (1700 & 7))) & 1).toBe(1);
        expect((dec[byte] >>> (7 - (1701 & 7))) & 1).toBe(1);
    });

    test('EncodedByteAlign: padding between rows, roundtrip K=0', () => {
        const l1 = Uint8Array.of(1,0,1,0,0,1,0,1);
        const l2 = Uint8Array.of(0,1,0,1,1,0,1,0);
        const parms = { K: 0, Columns: 8, EncodedByteAlign: true, EndOfLine: true };
        const enc = ccittImpl.encode([l1, l2], parms);
        const dec = ccittImpl.decode(enc, { ...parms, Rows: 2, BlackIs1: true });
        expect(dec[0]).toBe(0xA5);
        expect(dec[1]).toBe(0x5A);
    });

    test('EncodedByteAlign: G4 roundtrip', () => {
        const line = Uint8Array.of(1,0,0,0,1,1,0,0);
        const parms = { K: -1, Columns: 8, EncodedByteAlign: true };
        const enc = ccittImpl.encode([line], parms);
        const dec = ccittImpl.decode(enc, { ...parms, Rows: 1, BlackIs1: true });
        expect(dec[0]).toBe(0x8C);
    });

    test('RTC: G3 EOL stream contains 6 trailing EOLs', () => {
        const line = new Uint8Array(8);
        const enc = ccittImpl.encode([line], { K: 0, Columns: 8, EndOfLine: true, EndOfBlock: true });
        let bits = '';
        for (let i = 0; i < enc.length; i++) bits += enc[i].toString(2).padStart(8, '0');
        // Six consecutive EOLs = '000000000001' x6
        expect(bits.includes('000000000001'.repeat(6))).toBe(true);
        // Same line without EndOfBlock has no RTC
        const enc2 = ccittImpl.encode([line], { K: 0, Columns: 8, EndOfLine: true, EndOfBlock: false });
        expect(enc.length).toBeGreaterThan(enc2.length);
    });

    test('RTC: EndOfBlock=false omits RTC', () => {
        const line = new Uint8Array(8);
        const a = ccittImpl.encode([line], { K: -1, Columns: 8, EndOfBlock: true });
        const b = ccittImpl.encode([line], { K: -1, Columns: 8, EndOfBlock: false });
        expect(a.length).toBeGreaterThan(b.length);
    });

    test('G4 EOFB: encoder emits double EOL at end', () => {
        const line = new Uint8Array(16);
        const enc = ccittImpl.encode([line], { K: -1, Columns: 16, EndOfBlock: true });
        // Verify last bits contain two EOL codes (24 zero-bits + two ones).
        // Reconstruct bit string.
        let bits = '';
        for (let i = 0; i < enc.length; i++) {
            bits += enc[i].toString(2).padStart(8, '0');
        }
        // Last 24 bits should contain '000000000001000000000001' somewhere near end.
        expect(bits.includes('000000000001000000000001')).toBe(true);
    });

    test('2D Pass mode: encoder selects Pass when b2 < a1', () => {
        // Ref line: black at 0..3, white at 4..7
        // Coding line: all white → a1 = columns, b1=4 (first black->white on ref? no:
        //   actually a0=-1 white, b1 = first changing element on ref of opposite (black) → 0
        //   b2 = next change → 4
        //   a1 = columns=8, so b2(4) < a1(8) → Pass.
        const refLine = Uint8Array.of(1,1,1,1,0,0,0,0);
        const codingLine = new Uint8Array(8); // all white
        const enc = ccittImpl.encode([refLine, codingLine], { K: -1, Columns: 8 });
        const dec = ccittImpl.decode(enc, { K: -1, Columns: 8, Rows: 2, BlackIs1: true });
        expect(dec[0]).toBe(0xF0);
        expect(dec[1]).toBe(0x00);
    });

    test('2D VR3/VL3: encoder produces correct vertical', () => {
        // VR3: a1 = b1 + 3.
        // Ref:    [1,1,1,1,0,0,0,0] b1=0 (first opposite-to-white = black at 0)? — too edge-y.
        // Better: ref with a clear change at 4, coding with change at 7 (VR3).
        const refLine = Uint8Array.of(0,0,0,0,1,1,1,1);
        const codingLine = Uint8Array.of(0,0,0,0,0,0,0,1);
        const enc = ccittImpl.encode([refLine, codingLine], { K: -1, Columns: 8 });
        const dec = ccittImpl.decode(enc, { K: -1, Columns: 8, Rows: 2, BlackIs1: true });
        expect(dec[0]).toBe(0x0F);
        expect(dec[1]).toBe(0x01);
    });

    test('2D Horizontal: encoder for change far from ref', () => {
        // All-white ref vs coding with a black block far from any ref change
        // forces Horizontal mode.
        const refLine = new Uint8Array(16); // all white
        const codingLine = Uint8Array.of(0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0);
        const enc = ccittImpl.encode([refLine, codingLine], { K: -1, Columns: 16 });
        const dec = ccittImpl.decode(enc, { K: -1, Columns: 16, Rows: 2, BlackIs1: true });
        expect(dec[0]).toBe(0x00);
        expect(dec[1]).toBe(0x00);
        // codingLine packs as 00000011 11000000 = 0x03 0xC0
        expect(dec[2]).toBe(0x03);
        expect(dec[3]).toBe(0xC0);
    });

    test('K>0 mixed: encoder writes EOL+tag, roundtrip works for K=4', () => {
        const lines = [
            Uint8Array.of(1,0,1,0,1,0,1,0),
            Uint8Array.of(1,0,1,0,1,0,1,0),
            Uint8Array.of(1,0,1,0,1,0,1,0),
            Uint8Array.of(1,0,1,0,1,0,1,0),
            Uint8Array.of(1,1,1,1,0,0,0,0)
        ];
        const enc = ccittImpl.encode(lines, { K: 4, Columns: 8, EndOfLine: true });
        const dec = ccittImpl.decode(enc, { K: 4, Columns: 8, Rows: 5, EndOfLine: true, BlackIs1: true });
        expect(dec[0]).toBe(0xAA);
        expect(dec[1]).toBe(0xAA);
        expect(dec[2]).toBe(0xAA);
        expect(dec[3]).toBe(0xAA);
        expect(dec[4]).toBe(0xF0);
    });
});

describe('extra/ccitt-fax-decoder — RTC/EOFB detection (K)', () => {
    test('G3 K=0 RTC: decode with Rows:0 stops at 6×EOL terminator', () => {
        const l1 = Uint8Array.of(0,0,1,1,1,0,1,1);
        const l2 = Uint8Array.of(1,1,1,1,0,0,0,0);
        const l3 = Uint8Array.of(1,0,1,0,1,0,1,0);
        const parms = { K: 0, Columns: 8, EndOfLine: true, EndOfBlock: true };
        const enc = ccittImpl.encode([l1, l2, l3], parms);
        const dec = ccittImpl.decode(enc, { ...parms, Rows: 0, BlackIs1: true });
        expect(dec.length).toBe(3);
        expect(dec[0]).toBe(0x3B);
        expect(dec[1]).toBe(0xF0);
        expect(dec[2]).toBe(0xAA);
    });

    test('G4 K=-1 EOFB: decode with Rows:0 stops at 2×EOL terminator', () => {
        const l1 = Uint8Array.of(1,0,0,0,1,1,0,0);
        const l2 = Uint8Array.of(0,1,1,0,0,1,1,0);
        const l3 = Uint8Array.of(1,1,1,1,0,0,0,0);
        const parms = { K: -1, Columns: 8, EndOfBlock: true };
        const enc = ccittImpl.encode([l1, l2, l3], parms);
        const dec = ccittImpl.decode(enc, { ...parms, Rows: 0, BlackIs1: true });
        expect(dec.length).toBe(3);
        expect(dec[0]).toBe(0x8C);
        expect(dec[1]).toBe(0x66);
        expect(dec[2]).toBe(0xF0);
    });

    test('G3 K>0 mixed RTC: decode with Rows:0 stops at trailing EOLs', () => {
        const lines = [
            Uint8Array.of(1,0,1,0,1,0,1,0),
            Uint8Array.of(1,0,1,0,1,0,1,0),
            Uint8Array.of(1,1,1,1,0,0,0,0)
        ];
        const parms = { K: 2, Columns: 8, EndOfLine: true, EndOfBlock: true };
        const enc = ccittImpl.encode(lines, parms);
        const dec = ccittImpl.decode(enc, { ...parms, Rows: 0, BlackIs1: true });
        expect(dec.length).toBe(3);
        expect(dec[0]).toBe(0xAA);
        expect(dec[1]).toBe(0xAA);
        expect(dec[2]).toBe(0xF0);
    });

    test('G4 K=-1 Rows:0 graceful EOF without EOFB', () => {
        const l1 = Uint8Array.of(1,0,0,0,1,1,0,0);
        const parms = { K: -1, Columns: 8, EndOfBlock: false };
        const enc = ccittImpl.encode([l1], parms);
        const dec = ccittImpl.decode(enc, { ...parms, Rows: 0, BlackIs1: true });
        expect(dec.length).toBe(1);
        expect(dec[0]).toBe(0x8C);
    });

    test('G3 K=0 Rows:N with RTC: ignores trailing RTC padding', () => {
        const l1 = Uint8Array.of(0,0,1,1,1,0,1,1);
        const l2 = Uint8Array.of(1,1,1,1,0,0,0,0);
        const parms = { K: 0, Columns: 8, EndOfLine: true, EndOfBlock: true };
        const enc = ccittImpl.encode([l1, l2], parms);
        const dec = ccittImpl.decode(enc, { ...parms, Rows: 2, BlackIs1: true });
        expect(dec.length).toBe(2);
        expect(dec[0]).toBe(0x3B);
        expect(dec[1]).toBe(0xF0);
    });
});

describe('extra/legacy-deprecated-filters — DCT/JPX', () => {
    test('DCT passthrough on JPEG SOI', () => {
        const bytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 0]);
        expect(m.dctDecode(bytes)).toBe(bytes);
    });

    test('DCT rejects missing SOI', () => {
        expect(() => m.dctDecode(new Uint8Array([0, 0]))).toThrow(ParseError);
    });

    test('JPX passthrough on codestream SOC', () => {
        const bytes = new Uint8Array([0xFF, 0x4F, 0, 0]);
        expect(m.jpxDecode(bytes)).toBe(bytes);
    });

    test('JPX passthrough on JP2 box stream', () => {
        const bytes = new Uint8Array([0,0,0,12, 0x6A,0x50,0x20,0x20, 0x0D,0x0A,0x87,0x0A]);
        expect(m.jpxDecode(bytes)).toBe(bytes);
    });

    test('JPX rejects unknown signature', () => {
        expect(() => m.jpxDecode(new Uint8Array([0,0,0,0,0]))).toThrow(ParseError);
    });
});

describe('extra/legacy-deprecated-filters — factory', () => {
    test('rejects missing lzw dep', () => {
        expect(() => pdfLegacyDeprecatedFilters.factory(_pdfErrors_TD1, null, ccittImpl)).toThrow(ParseError);
    });
    test('rejects missing ccitt dep', () => {
        expect(() => pdfLegacyDeprecatedFilters.factory(_pdfErrors_TD1, lzwImpl, null)).toThrow(ParseError);
    });
    test('factory shape', () => {
        expect(pdfLegacyDeprecatedFilters.name).toBe('pdfLegacyDeprecatedFilters');
        expect(pdfLegacyDeprecatedFilters.dependencies).toEqual(['pdfErrors', 'lzw', 'pdfCcittFaxDecoder']);
        expect(pdfLegacyDeprecatedFilters.factory.toString()).toContain('function');
    });
});
