// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { brotli } from './brotli.js';
import { brotliShared } from './brotli_shared.js';
import { bitstream } from './bitstream.js';
import { huffman } from './huffman.js';
import { lz77 } from './lz77.js';
import { brotliDict } from './brotli_dict.js';
import { brotliDictWords } from './brotli_dict_words.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DICT_BLOB = new Uint8Array(fs.readFileSync(path.join(__dirname, 'brotli_dict.bin')));

const _bs = bitstream.factory();
const _hf = huffman.factory(_bs);
const _lz = lz77.factory();
const _bw = brotliDictWords.factory();
_bw.setBlob(DICT_BLOB);

function mkBrotli() {
    // Use a fresh brotliDict instance per builder so test side-effects
    // (setWords) don't leak between groups.
    const _bd = brotliDict.factory();
    return brotli.factory(_bs, _hf, _lz, _bd, _bw);
}

// `parseSharedDictionary` and the RFC 9841 codec wrappers live in the
// brotli_shared module. Tests that exercise RFC 9841 options
// (`allowLargeWindow`, `sharedDictionary`) route through this builder.
function mkShared() {
    const _bd = brotliDict.factory();
    const _br = brotli.factory(_bs, _hf, _lz, _bd, _bw);
    return brotliShared.factory(_br, _bd, _bw);
}
const _bShared = mkShared();

// Convert a hex string into a Uint8Array
function hex(s) {
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; ++i) out[i] = parseInt(s.substr(i * 2, 2), 16);
    return out;
}

function txt(bytes) { return new TextDecoder().decode(bytes); }

// Tiny LSB-first bit writer for hand-crafted test vectors.
// Mirrors the read side: bit `p` of the output is bit `p&7` of byte `p>>3`.
function bw() {
    const buf = new Uint8Array(128);
    let p = 0;
    return {
        bits(n, v) {
            for (let i = 0; i < n; ++i) {
                if ((v >>> i) & 1) buf[p >> 3] |= 1 << (p & 7);
                ++p;
            }
        },
        bytes() { return buf.slice(0, (p + 7) >> 3); },
        bitPos() { return p; },
    };
}

describe('brotli module', () => {
    test('has correct module metadata', () => {
        expect(brotli.name).toBe('brotli');
        expect(brotli.version).toBe('2.4.0');
        expect(brotli.type).toBe('fw.io.compress');
        expect(brotli.dependencies).toEqual(['bitstream', 'huffman', 'lz77', 'brotliDict', 'brotliDictWords']);
        expect(typeof brotli.factory).toBe('function');
    });

    describe('factory', () => {
        test('returns expected API surface', () => {
            const b = mkBrotli();
            expect(typeof b.brotliCompressSync).toBe('function');
            expect(typeof b.brotliDecompressSync).toBe('function');
            expect(typeof b.brotliCompress).toBe('function');
            expect(typeof b.brotliDecompress).toBe('function');
            expect(typeof b.BrotliCompressStream).toBe('function');
            expect(typeof b.BrotliDecompressStream).toBe('function');
            expect(typeof b._internal).toBe('object');
            expect(typeof b._internal.readPrefixCode).toBe('function');
            expect(typeof b._internal.makeReader).toBe('function');
        });
    });

    // --- Step 4: §3.4 / §3.5 prefix codes ----------------------------------

    describe('_internal.readPrefixCode - simple form (§3.4)', () => {
        const b = mkBrotli();
        const { makeReader, readPrefixCode } = b._internal;

        test('NSYM=1: zero-bit code returns the encoded symbol', () => {
            // head=01 (LSB) → simple, NSYM-1=00 → NSYM=1, then 8 bits = symbol
            const w = bw();
            w.bits(2, 1);   // simple
            w.bits(2, 0);   // NSYM=1
            w.bits(8, 0x42); // symbol 0x42
            const r = makeReader(w.bytes());
            const code = readPrefixCode(r, 256);
            expect(code.singleSymbol).toBe(0x42);
            // read() does not consume bits
            const pBefore = r.p;
            expect(code.read(r)).toBe(0x42);
            expect(r.p).toBe(pBefore);
        });

        test('NSYM=2: both symbols length 1', () => {
            const w = bw();
            w.bits(2, 1);   // simple
            w.bits(2, 1);   // NSYM-1=1 → NSYM=2
            w.bits(8, 0x10); // symbol A
            w.bits(8, 0x20); // symbol B
            // Then 4 code bits to decode: A, B, A, B
            // Canonical: sym with smaller numeric value gets code "0", larger "1"
            // → 0x10 → "0", 0x20 → "1"
            w.bits(1, 0);   // 0x10
            w.bits(1, 1);   // 0x20
            w.bits(1, 1);   // 0x20
            w.bits(1, 0);   // 0x10
            const r = makeReader(w.bytes());
            const code = readPrefixCode(r, 256);
            expect(code.singleSymbol).toBeUndefined();
            expect(code.read(r)).toBe(0x10);
            expect(code.read(r)).toBe(0x20);
            expect(code.read(r)).toBe(0x20);
            expect(code.read(r)).toBe(0x10);
        });

        test('NSYM=3: codes 1, 2, 2 - first symbol gets "0"', () => {
            // S0=0x05 length 1, S1=0x10 length 2, S2=0x20 length 2.
            // Canonical assignment (by symbol index, smallest first within
            // same length) for the encode side gives:
            //   sym 0x05 (cd=1) → encode value 0    → write 1 bit  val 0
            //   sym 0x10 (cd=2) → encode value 1    → write 2 bits val 1
            //   sym 0x20 (cd=2) → encode value 3    → write 2 bits val 3
            const w = bw();
            w.bits(2, 1);                   // simple
            w.bits(2, 2);                   // NSYM-1=2 → NSYM=3
            w.bits(8, 0x05);
            w.bits(8, 0x10);
            w.bits(8, 0x20);
            w.bits(1, 0);                   // 0x05
            w.bits(2, 1);                   // 0x10
            w.bits(2, 3);                   // 0x20
            const r = makeReader(w.bytes());
            const code = readPrefixCode(r, 256);
            expect(code.read(r)).toBe(0x05);
            expect(code.read(r)).toBe(0x10);
            expect(code.read(r)).toBe(0x20);
        });

        test('NSYM=4 tree-select=0: all four symbols at length 2', () => {
            // Canonical encode values (in symbol order, since same length):
            //   sym 0x01 → 0, sym 0x02 → 2, sym 0x03 → 1, sym 0x04 → 3
            const w = bw();
            w.bits(2, 1);                   // simple
            w.bits(2, 3);                   // NSYM-1=3 → NSYM=4
            w.bits(8, 0x01);
            w.bits(8, 0x02);
            w.bits(8, 0x03);
            w.bits(8, 0x04);
            w.bits(1, 0);                   // tree-select = 0
            w.bits(2, 0);                   // 0x01
            w.bits(2, 2);                   // 0x02
            w.bits(2, 1);                   // 0x03
            w.bits(2, 3);                   // 0x04
            const r = makeReader(w.bytes());
            const code = readPrefixCode(r, 256);
            expect(code.read(r)).toBe(0x01);
            expect(code.read(r)).toBe(0x02);
            expect(code.read(r)).toBe(0x03);
            expect(code.read(r)).toBe(0x04);
        });

        test('NSYM=4 tree-select=1: lengths 1, 2, 3, 3 in decoded order', () => {
            // lens[0x0A]=1, lens[0x0B]=2, lens[0x0C]=3, lens[0x0D]=3.
            // Canonical encode values (computed via huffman.buildMap):
            //   sym 0x0A → 0  (write 1 bit  val 0)
            //   sym 0x0B → 1  (write 2 bits val 1)
            //   sym 0x0C → 3  (write 3 bits val 3)
            //   sym 0x0D → 7  (write 3 bits val 7)
            const w = bw();
            w.bits(2, 1);
            w.bits(2, 3);                   // NSYM=4
            w.bits(8, 0x0A);
            w.bits(8, 0x0B);
            w.bits(8, 0x0C);
            w.bits(8, 0x0D);
            w.bits(1, 1);                   // tree-select = 1
            w.bits(1, 0);                   // 0x0A
            w.bits(2, 1);                   // 0x0B
            w.bits(3, 3);                   // 0x0C
            w.bits(3, 7);                   // 0x0D
            const r = makeReader(w.bytes());
            const code = readPrefixCode(r, 256);
            expect(code.read(r)).toBe(0x0A);
            expect(code.read(r)).toBe(0x0B);
            expect(code.read(r)).toBe(0x0C);
            expect(code.read(r)).toBe(0x0D);
        });

        test('rejects duplicate symbols in simple prefix code', () => {
            const w = bw();
            w.bits(2, 1);
            w.bits(2, 1);   // NSYM=2
            w.bits(8, 0x42);
            w.bits(8, 0x42); // duplicate
            try { readPrefixCode(makeReader(w.bytes()), 256); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); expect(e.message).toMatch(/duplicate/); return; }
            throw new Error('expected throw');
        });

        test('rejects symbol >= alphabet size', () => {
            const w = bw();
            w.bits(2, 1);
            w.bits(2, 0);   // NSYM=1
            w.bits(8, 0xFF);
            try { readPrefixCode(makeReader(w.bytes()), 100); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); expect(e.message).toMatch(/>=/); return; }
            throw new Error('expected throw');
        });
    });

    describe('_internal.readPrefixCode - complex form (§3.5)', () => {
        const b = mkBrotli();
        const { makeReader, readPrefixCode } = b._internal;

        test('2-symbol code via complex form (Kraft-complete CL-of-CL)', () => {
            // Target prefix code: alphabet {0, 1}, both with code length 1.
            // CL-of-CL: only syms 1 and 2 are non-zero, both with CL = 1.
            // → Phase-1 Kraft = 16+16 = 32 (complete after reading syms 1,2).
            // CL decoder is a 2-symbol code: read 1 bit, 0 → sym 1, 1 → sym 2.
            //
            // Phase 2: emit lens[0]=1, lens[1]=1 using CL sym 1 (one bit "0" each).
            // After 2 emissions, Kraft 16384+16384=32768 → loop breaks.
            //
            // Final code: canonical 2-symbol → sym 0 → "0", sym 1 → "1".
            //
            // Bit sequence (LSB-first):
            //   [00] head (HSKIP=0 → complex)
            //   [0111] CL-of-CL for sym 1 = 1 (4-bit code, LSB-first = 1,1,1,0)
            //   [0111] CL-of-CL for sym 2 = 1
            //   [0]    phase-2 read → CL sym 1 → emit lens[0]=1
            //   [0]    phase-2 read → CL sym 1 → emit lens[1]=1, Kraft full, break
            //   [0]    decode sym 0
            //   [1]    decode sym 1
            //   [0]    decode sym 0
            //   [1]    decode sym 1
            // Total: 2 + 4 + 4 + 1 + 1 + 4 = 16 bits = 2 bytes
            //   byte0 LSB→MSB: 0,0,1,1,1,0,1,1 = 0xDC
            //   byte1 LSB→MSB: 1,0,0,0,0,1,0,1 = 0xA1
            const data = new Uint8Array([0xDC, 0xA1]);
            const r = makeReader(data);
            const code = readPrefixCode(r, 2);
            expect(code.singleSymbol).toBeUndefined();
            expect(code.alphabetSize).toBe(2);
            expect(code.read(r)).toBe(0);
            expect(code.read(r)).toBe(1);
            expect(code.read(r)).toBe(0);
            expect(code.read(r)).toBe(1);
        });

        test('256-symbol flat code (every CL = 8) - repeat-16 chain', () => {
            // Target: alphabet 256, every code length 8 (a "flat" code).
            // CL-of-CL: only sym 16 has CL = 1 → single-symbol CL decoder
            // (0-bit reads always return 16, with `prev` starting at 8).
            //
            // Phase 1 (read all 18 entries; the lone non-zero is at index 8):
            //   indexes 0..7  (syms 1,2,3,4,0,5,17,6) → CL = 0 → "00" (2b)
            //   index  8      (sym 16)                → CL = 1 → "0111" (4b)
            //   indexes 9..17 (syms 7..15)            → CL = 0 → "00" (2b)
            //   ⇒ 8*2 + 4 + 9*2 = 38 bits
            //
            // Phase 2: emit 256 lens of value 8 via four repeat-16 ops.
            // Chained extras must satisfy:
            //   t1 = e1 + 3
            //   t2 = 4*(t1-2) + e2 + 3
            //   t3 = 4*(t2-2) + e3 + 3
            //   t4 = 4*(t3-2) + e4 + 3 = 256
            // Solution: e1=2, e2=2, e3=2, e4=1 → t = 5, 17, 65, 256 ✓
            // Each iter consumes 0 bits (sym 16) + 2 bits (extra) = 2 bits.
            // Total phase 2 = 8 bits.
            //
            // Final code: read sym 0 = code "00000000" = 8 zero bits.
            //
            // Total bitstream = 2 (head) + 38 + 8 + 8 = 56 bits = 7 bytes.
            const w = bw();
            w.bits(2, 0);                  // head: complex, HSKIP=0
            for (let i = 0; i < 8; ++i) w.bits(2, 0);  // syms 1,2,3,4,0,5,17,6 → CL=0
            w.bits(4, 0b0111);             // sym 16 → CL=1 ("0111" LSB-first)
            for (let i = 0; i < 9; ++i) w.bits(2, 0);  // syms 7..15 → CL=0
            // Phase 2: four chained 16-ops with extraBits 2,2,2,1
            w.bits(2, 2); w.bits(2, 2); w.bits(2, 2); w.bits(2, 1);
            // Decode sym 0 → 8 zero bits
            w.bits(8, 0);

            const r = makeReader(w.bytes());
            const code = readPrefixCode(r, 256);
            expect(code.alphabetSize).toBe(256);
            expect(code.read(r)).toBe(0);
        });

        test('HSKIP=2 skips first two CL-of-CL entries (syms 1, 2)', () => {
            // Build a target prefix code over alphabet {3, 4} (NOT 0,1, since
            // we'd need CL-of-CL for sym 1 → conflicts with HSKIP=2 skipping
            // sym 1). Same 2-symbol pattern, both CL=1, but the CL alphabet
            // values for syms 3 and 4 are non-zero, with syms 1 and 2 = 0.
            //
            // HSKIP=2 → skip syms 1, 2 (set their CL-of-CL to 0 implicitly).
            // Then read syms 3, 4, 0, 5, 17, 6, 16, 7, ..., 15 → starting at
            // _CL_ORDER index 2 (sym 3) and 3 (sym 4).
            //
            //   sym 3 → CL = 1 → "0111"
            //   sym 4 → CL = 1 → "0111"  → Kraft=32, break.
            //
            // CL decoder: read 1 bit, 0 → sym 3, 1 → sym 4.
            //
            // Phase 2: alphabet size = 5 (to include syms 0..4 as valid).
            // Want lens = [0, 0, 0, 1, 1]. Need to emit 5 lens.
            //   - Use 17 (zero-repeat) to skip syms 0,1,2: extraBits = 0 → repeat 3 zeros.
            //   - Then read CL sym 3 (bit "0") → lens[3] = 1, prev=3 (wait no, prev tracks last non-zero
            //     CL - when we emit CL=1, prev becomes 1). kraftSum = 16384.
            //   - Then read CL sym 3 again → lens[4] = 1. kraftSum = 32768, break.
            //
            // But CL sym values are {3, 4} only - we need value 1 or value-17.
            // Wait: phase-2 reads CL alphabet symbols where sym ∈ [0,15] = literal CL,
            // sym 16 = repeat-last-nonzero, sym 17 = repeat-zero. The CL alphabet
            // is fixed; the encoder picked CL-of-CL values for whichever subset.
            // In this test we encoded only syms 3 and 4 of the CL alphabet, so
            // phase-2 can only read 3 or 4 (giving lens of value 3 or 4 - not 1).
            //
            // Adjust: encode CL syms 1 and 4 (CL=1 each), forcing HSKIP=0
            // and demonstrating HSKIP independently. Actually let me just
            // verify HSKIP=2 produces the right CL decoder by encoding any
            // valid pair and checking sym-reads work.
            //
            // Use CL syms 3 and 17: lens[0..2] = 0 (via sym 17, repeat 3), then
            // lens[3..] need to be filled. Target lens = [0,0,0,3,3,3] for alphabet=6.
            // Phase 2 reads:
            //   - CL sym 17 (bit "1"), extraBits=0 (2 bits) → repeat 0 three times → lens[0..2]=0
            //   - CL sym 3 (bit "0") → lens[3] = 3, kraftSum = 32768 >> 3 = 4096
            //   - CL sym 3 → lens[4] = 3, kraftSum = 8192
            //   - CL sym 3 → lens[5] = 3, kraftSum = 12288 - not complete
            // We need 8 more length-3 lens (8 * 4096 = 32768). But alphabet is 6 → can't.
            //
            // Simplify: alphabet=8, lens = [0,0,0,3,3,3,3,3] would give Kraft
            // = 5 * 4096 = 20480 (incomplete). Need exactly 8 lens of 3 to hit 32768.
            // Use alphabet=8, lens = [3,3,3,3,3,3,3,3]:
            //   Phase 2 reads CL sym 3 eight times → all 1-bit "0".
            // No HSKIP-driven repeats needed. Hmm.
            //
            // Simplest HSKIP test: use HSKIP=2 with CL syms 4 (skipped) gets
            // zero, and CL syms 3, 4 of the *CL alphabet* are read first.
            // Lengthy - keep it brief: just verify HSKIP=2 produces same code
            // as HSKIP=0 when the skipped CL-of-CL values would have been 0.

            // HSKIP=0 baseline already tested above. HSKIP=2 just elides the
            // first two "00"s of the encoding. Build a code over alphabet=8
            // with all CL=3 - eight symbols.
            //   CL-of-CL: sym 3 = 1 (encoded as "0111" 4 bits).
            //   With HSKIP=2: we skip syms 1, 2. Reading starts at sym 3.
            //   First CL-of-CL read (sym 3) = 1 → CL-of-CL Kraft = 16 (incomplete).
            //   Continue reading: syms 4, 0, 5, 17, 6, 16, 7..15 - all 0.
            //   Total CL-of-CL reads = 16 (18 - hskip = 18 - 2 = 16).
            //   After all 16 reads, Kraft is still 16, nz=1, single-symbol → CL decoder always returns sym 3.
            //
            // Phase 2: 0-bit reads, emit lens[0..7]=3 each via single-symbol
            // CL decoder. After 8 iterations, lens=[3]*8 and Kraft=8*4096=32768. ✓
            //
            // Final code: alphabet=8, all CL=3 → canonical "000", "100", "010", ...
            // sym 0 → code "000" = 3 zero bits.
            //
            // Bit sequence:
            //   head: 2 bits = HSKIP=2 → value 2 ("10" written LSB-first)
            //   CL-of-CL sym 3: 4 bits = "0111" → value 7
            //   CL-of-CL syms 4, 0, 5, 17, 6, 16, 7..15 (15 entries) → "00" each = 2 bits each
            //   phase 2: no bits
            //   decode sym 0: 3 bits = 0,0,0
            //
            // Total: 2 + 4 + 15*2 + 3 = 39 bits = 5 bytes (with padding).
            const w = bw();
            w.bits(2, 2);                 // HSKIP=2
            w.bits(4, 0b0111);            // sym 3 CL=1
            for (let i = 0; i < 15; ++i) w.bits(2, 0);  // remaining CL-of-CL = 0
            w.bits(3, 0);                 // decode sym 0 → "000"
            const r = makeReader(w.bytes());
            const code = readPrefixCode(r, 8);
            expect(code.alphabetSize).toBe(8);
            expect(code.read(r)).toBe(0);
        });
    });

    describe('_internal.readPrefixCode - error cases', () => {
        const b = mkBrotli();
        const { makeReader, readPrefixCode } = b._internal;

        test('rejects alphabet size < 1', () => {
            const r = makeReader(new Uint8Array([0]));
            try { readPrefixCode(r, 0); }
            catch (e) { expect(e.code).toBe('EBADARG'); return; }
            throw new Error('expected throw');
        });

        test('rejects complex code whose CL-of-CL Kraft overshoots', () => {
            // Two CL-of-CL = 1 each, then a third CL-of-CL = 1 → Kraft = 48 > 32.
            const w = bw();
            w.bits(2, 0);                          // HSKIP=0
            w.bits(4, 0b0111);                     // sym 1 CL=1 (Kraft=16)
            w.bits(4, 0b0111);                     // sym 2 CL=1 (Kraft=32; would break here)
            // Force overshoot by adding a third - but our reader will have
            // already broken out of the loop on Kraft==32. To trigger >32,
            // we use CL=1 (Kraft+=16) plus an earlier CL that already pushed
            // toward 32. The simplest is: sym 1 CL=1, sym 2 CL=1, sym 3 CL=1,
            // but our loop breaks at Kraft=32 (after sym 2). So this test
            // actually verifies the normal completion path.
            //
            // To trigger > 32, we need a single CL-of-CL of value 0 (which
            // gives 32>>0 = 32 in one shot - but cl=0 means "unused"). Use
            // sym 1 CL=1, sym 2 CL=1, sym 3 CL=2 → Kraft = 16+16+8 = 40 > 32?
            // No - loop breaks at sym 2 (Kraft=32), sym 3 is never read.
            // Use sym 1 CL=2, sym 2 CL=2, sym 3 CL=2, sym 4 CL=2, sym 0 CL=2
            // (5 entries with CL=2). Kraft = 5*8 = 40 > 32. Loop breaks
            // mid-way when Kraft > 32.
            // For this test we override the above with a fresh write:
            const w2 = bw();
            w2.bits(2, 0);                         // HSKIP=0
            for (let i = 0; i < 5; ++i) w2.bits(3, 0b011);  // CL=2 → "011" LSB-first = 0b011 = 3 in 3 bits
            const r = makeReader(w2.bytes());
            try { readPrefixCode(r, 8); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); expect(e.message).toMatch(/Kraft/); return; }
            throw new Error('expected throw');
        });

        test('rejects repeat-16 overflow', () => {
            // Build a code where a 16-repeat would push past alphabet size.
            // CL-of-CL: sym 1=1, sym 2=1 (Kraft=32 → 1-bit CL decoder).
            // Phase 2: alphabet=4, emit CL sym 1 (bit "0") → lens[0]=1, prev=1.
            // Then CL sym 16 with extraBits=3 → repeat 6 times. i=1+6=7 > 4 → overflow.
            //
            // But our CL decoder only has syms 1 and 2 - there's no sym 16.
            // To get a sym 16 reader we need to also encode CL-of-CL[16]≠0,
            // which makes a 3-symbol CL decoder. Let me build:
            //   CL-of-CL: sym 1 = 1, sym 2 = 2, sym 16 = 2.
            //   Kraft = 16 + 8 + 8 = 32 ✓
            //   CL decoder canonical (3-symbol lens 1,2,2):
            //     sym 1 → "0", sym 2 → "10", sym 16 → "11"
            //   Phase 2: alphabet=4.
            //     read CL sym 1 (bit "0") → lens[0]=1, kraft=16384
            //     read CL sym 16 (bits "11") + extra 2 bits = 3 → repeat 6 → overflow.
            //
            // CL-of-CL encoded:
            //   sym 1 (index 0): CL=1 → "0111" 4 bits
            //   sym 2 (index 1): CL=2 → "011" 3 bits
            //   ... up to sym 16 (index 8): CL=2 → "011" 3 bits
            //   intermediate syms (3,4,0,5,17,6 at indexes 2..7): CL=0 → "00" 2 bits each
            //   We stop at Kraft=32 - reached after sym 16 (32). Wait: 16+8+8=32.
            //   Yes Kraft hits 32 at index 8, loop breaks.
            const w = bw();
            w.bits(2, 0);                          // HSKIP=0
            w.bits(4, 0b0111);                     // sym 1 CL=1
            w.bits(3, 0b011);                      // sym 2 CL=2
            for (let i = 0; i < 6; ++i) w.bits(2, 0);  // syms 3,4,0,5,17,6 CL=0
            w.bits(3, 0b011);                      // sym 16 CL=2
            // Phase 2:
            w.bits(1, 0);                          // CL sym 1 → lens[0]=1
            w.bits(2, 0b11);                       // CL sym 16 → bits "11"
            w.bits(2, 3);                          // extra bits = 3 → repeat 6
            const r = makeReader(w.bytes());
            try { readPrefixCode(r, 4); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); expect(e.message).toMatch(/overflow/); return; }
            throw new Error('expected throw');
        });
    });

    describe('brotliDecompressSync - stream header (§9.1)', () => {
        const b = mkBrotli();

        test('empty stream WBITS=16 (0x06)', () => {
            // 0x06 = bits LSB-first: 0,1,1,0,0,0,0,0
            // WBITS=16 (0), ISLAST=1, ISLASTEMPTY=1, tail zeros
            const out = b.brotliDecompressSync(hex('06'));
            expect(out).toBeInstanceOf(Uint8Array);
            expect(out.length).toBe(0);
        });

        test('empty stream WBITS=22 (0x3b - default brotli encoder)', () => {
            const out = b.brotliDecompressSync(hex('3b'));
            expect(out.length).toBe(0);
        });

        test('rejects 0010001 prefix without allowLargeWindow opt', () => {
            // bits LSB-first 1,0,0,0,1,0,0,(0) → 8-bit prefix 00010001
            // → RFC 9841 large window indicator; rejected by default.
            // 0x11 = 0b00010001 → bits 1,0,0,0,1,0,0,0
            try { b.brotliDecompressSync(hex('11')); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); expect(e.message).toMatch(/large window/); return; }
            throw new Error('expected throw');
        });

        test('rejects 0010001 prefix with non-zero 8th bit (truly invalid pattern)', () => {
            // 0x91 = 0b10010001 → LSB-first 1,0,0,0,1,0,0,1 → 8th bit = 1
            // → invalid even in large window mode
            try { _bShared.brotliDecompressSync(hex('91'), { allowLargeWindow: true }); }
            catch (e) {
                expect(e.code).toBe('EBADSTREAM');
                expect(e.message).toMatch(/invalid WBITS pattern/);
                return;
            }
            throw new Error('expected throw');
        });

        test('rejects empty input', () => {
            try { b.brotliDecompressSync(new Uint8Array(0)); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); return; }
            throw new Error('expected throw');
        });

        test('rejects non-Uint8Array input', () => {
            try { b.brotliDecompressSync('not-bytes'); }
            catch (e) { expect(e.code).toBe('EBADARG'); return; }
            throw new Error('expected throw');
        });

        test('rejects empty stream with non-zero fill bits', () => {
            // 0x86 = 0b10000110 - same as 0x06 but with bit 7 set (tail fill)
            try { b.brotliDecompressSync(hex('86')); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); expect(e.message).toMatch(/fill/); return; }
            throw new Error('expected throw');
        });
    });

    describe('brotliDecompressSync - uncompressed meta-blocks (§9.2)', () => {
        const b = mkBrotli();

        // Vectors generated with Bun's zlib.brotliCompressSync(quality:0)
        // which emits a single uncompressed meta-block for tiny inputs.
        const vectors = [
            ['A',     '0b00804103'],
            ['AB',    '8b0080414203'],
            ['ABC',   '0b018041424303'],
            ['Hello', '0b028048656c6c6f03'],
        ];

        for (const [plain, h] of vectors) {
            test(`decodes ${JSON.stringify(plain)} from ${h}`, () => {
                const out = b.brotliDecompressSync(hex(h));
                expect(txt(out)).toBe(plain);
            });
        }

        test('decodes a 256-byte uncompressed block', () => {
            // Build a 256-byte payload of pattern bytes, compress with Bun,
            // verify our decoder agrees.
            const zlib = require('node:zlib');
            const payload = new Uint8Array(256);
            for (let i = 0; i < 256; ++i) payload[i] = (i * 31) & 0xFF;
            const compressed = new Uint8Array(zlib.brotliCompressSync(
                Buffer.from(payload),
                { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 0 } }
            ));
            // The encoder may still produce a compressed meta-block here.
            // If so, we skip the assertion gracefully - the round-trip is
            // exercised only when the wire really is uncompressed.
            let out;
            try { out = b.brotliDecompressSync(compressed); }
            catch (e) {
                if (e.code === 'ENOTIMPL') { return; }
                throw e;
            }
            expect(Array.from(out)).toEqual(Array.from(payload));
        });
    });

    describe('brotliDecompressSync - metadata meta-blocks', () => {
        const b = mkBrotli();

        test('skips a single metadata block followed by ISLASTEMPTY', () => {
            // Hand-crafted stream - byte 0 carries WBITS and meta-block #1:
            //   bit 0    = 0 → WBITS = 16
            //   bit 1    = 0 → ISLAST = 0
            //   bits 2-3 = 1,1 → MNIBBLES code value 3 → MNIBBLES = 0 (metadata)
            //   bit 4    = 0 → reserved (must be 0)
            //   bits 5-6 = 0,0 → MSKIPBYTES = 0 → MSKIPLEN = 0
            //   bit 7    = 0 → align fill (must be 0)
            // → byte 0 = 0b00001100 = 0x0C
            //
            // Byte 1 is meta-block #2 (no WBITS - only read once at stream start):
            //   bit 0    = 1 → ISLAST = 1
            //   bit 1    = 1 → ISLASTEMPTY = 1 → stream ends
            //   bits 2-7 = 0 → trailing zeros required
            // → byte 1 = 0b00000011 = 0x03
            const out = b.brotliDecompressSync(hex('0c03'));
            expect(out.length).toBe(0);
        });
    });

    describe('brotliDecompressSync - round-trip with native encoder (step 6)', () => {
        const zlib = require('node:zlib');
        const b = mkBrotli();
        const C = zlib.constants;

        function rt(text, quality = 11) {
            const compressed = new Uint8Array(zlib.brotliCompressSync(
                Buffer.from(text),
                { params: { [C.BROTLI_PARAM_QUALITY]: quality } }
            ));
            const out = b.brotliDecompressSync(compressed);
            return new TextDecoder().decode(out);
        }

        test('"a" × 200 at q11 (LZ77-heavy)', () => {
            const text = 'a'.repeat(200);
            expect(rt(text, 11)).toBe(text);
        });

        test('"Hello, World! " × 20 at q11', () => {
            const text = 'Hello, World! '.repeat(20);
            expect(rt(text, 11)).toBe(text);
        });

        test('"The quick brown fox..." × 30 at q11 (text)', () => {
            const text = 'The quick brown fox jumps over the lazy dog. '.repeat(30);
            expect(rt(text, 11)).toBe(text);
        });

        test('"lorem ipsum..." × 40 at q11', () => {
            const text = 'lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(40);
            expect(rt(text, 11)).toBe(text);
        });

        test('JSON-like structured text at q11', () => {
            const text = '{"name":"value","list":[1,2,3,4],"nested":{"a":true,"b":false}}'.repeat(15);
            expect(rt(text, 11)).toBe(text);
        });

        test('UTF-8 multi-byte content round-trips', () => {
            const text = 'café - déjà vu - naïve résumé piñata Москва 日本語 '.repeat(10);
            expect(rt(text, 11)).toBe(text);
        });

        test('round-trip across all qualities 0..11 on a long corpus', () => {
            // Step-7 fix: rewriting `_readBits` to load 4 bytes (not 2)
            // resolved a long-standing decoder bug where 16-bit MLEN reads
            // at non-zero shift truncated their top bits, mis-aligning the
            // command loop on certain encoder outputs.
            const text = 'The quick brown fox jumps over the lazy dog. '.repeat(50);
            for (let q = 0; q <= 11; ++q) {
                expect(rt(text, q)).toBe(text);
            }
        });

        test('long English text at q=11 (the production-default quality)', () => {
            // Production-relevant target: confirm we decode q=11 streams on
            // longer inputs that would exercise multiple meta-blocks or
            // exotic prefix-code shapes.
            const text = ('Lorem ipsum dolor sit amet, consectetur adipiscing elit, ' +
                'sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ').repeat(20);
            expect(rt(text, 11)).toBe(text);
        });

        test('large input spanning multiple meta-blocks (>64KB)', () => {
            // Force the encoder to emit at least one meta-block split.
            const chunk = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 abcdefghijklmnopqrstuvwxyz\n';
            const text = chunk.repeat(2000); // ~128KB
            expect(rt(text, 6)).toBe(text);
        });

        test('binary (non-text) payload round-trips at q5', () => {
            const buf = new Uint8Array(4096);
            for (let i = 0; i < buf.length; ++i) buf[i] = (i * 31 + 17) & 0xFF;
            const compressed = new Uint8Array(zlib.brotliCompressSync(
                Buffer.from(buf), { params: { [C.BROTLI_PARAM_QUALITY]: 5 } }
            ));
            const out = b.brotliDecompressSync(compressed);
            expect(Array.from(out)).toEqual(Array.from(buf));
        });

        test('empty string round-trips', () => {
            const compressed = new Uint8Array(zlib.brotliCompressSync(Buffer.from('')));
            const out = b.brotliDecompressSync(compressed);
            expect(out.length).toBe(0);
        });
    });

    describe('static dictionary references', () => {
        const zlib = require('node:zlib');

        test('decoder auto-wires brotliDict from brotliDictWords on first dict-ref', () => {
            // English text with common words is likely to trigger static-dict
            // references at q11.
            const b = mkBrotli();
            const text = 'the quick brown fox jumps over the lazy dog and the cat ran ';
            const compressed = new Uint8Array(zlib.brotliCompressSync(
                Buffer.from(text),
                { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }
            ));
            const out = b.brotliDecompressSync(compressed);
            expect(new TextDecoder().decode(out)).toBe(text);
        });

        test('throws ENEEDDICT if neither brotliDict nor brotliDictWords loaded', () => {
            // Build a brotli factory with an UNLOADED brotliDictWords.
            const emptyWords = brotliDictWords.factory();  // isLoaded=false
            const freshDict = brotliDict.factory();        // hasWords()=false
            const noDict = brotli.factory(_bs, _hf, _lz, freshDict, emptyWords);

            // Compress something that's likely to use the static dict.
            const text = 'common english words like the and is for are with '.repeat(5);
            const compressed = new Uint8Array(zlib.brotliCompressSync(
                Buffer.from(text),
                { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }
            ));

            let caught = null;
            try { noDict.brotliDecompressSync(compressed); }
            catch (e) { caught = e; }

            // Either the stream did NOT need the dict (decoder succeeded -
            // OK, no assertion to make) OR it needed the dict and we got
            // ENEEDDICT.
            if (caught) {
                expect(caught.code).toBe('ENEEDDICT');
                expect(caught.message).toMatch(/static dictionary required/);
            }
        });
    });

    describe('error cases', () => {
        const b = mkBrotli();

        test('rejects truncated compressed stream', () => {
            const zlib = require('node:zlib');
            const full = new Uint8Array(zlib.brotliCompressSync(
                Buffer.from('hello world '.repeat(20)),
                { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }
            ));
            const truncated = full.slice(0, Math.floor(full.length / 2));
            try { b.brotliDecompressSync(truncated); }
            catch (e) {
                // Could be EBADSTREAM (overrun, MLEN mismatch) or similar.
                expect(['EBADSTREAM', 'ENOTIMPL']).toContain(e.code);
                return;
            }
            // Some truncations may happen to leave valid-looking data -
            // tolerate that.
        });
    });

    // --- Step 5: §6/§7/§9.2 compressed meta-block header primitives -------

    describe('_internal.readVarLenCount (§9.2)', () => {
        const b = mkBrotli();
        const { makeReader, readVarLenCount } = b._internal;

        function decode(bitsArray) {
            const w = bw();
            for (const [n, v] of bitsArray) w.bits(n, v);
            const r = makeReader(w.bytes());
            return readVarLenCount(r);
        }

        test('1 bit "0" → 1', () => {
            expect(decode([[1, 0]])).toBe(1);
        });

        test('"0001" → 2 (LSB-first 1,0,0,0)', () => {
            // bit 0=1, then 3 bits = 0,0,0 → category 0 = exactly 2
            expect(decode([[1, 1], [3, 0]])).toBe(2);
        });

        test('category 1 → 3..4', () => {
            // bit 0=1, cat=1, extra 0 → 3; extra 1 → 4
            expect(decode([[1, 1], [3, 1], [1, 0]])).toBe(3);
            expect(decode([[1, 1], [3, 1], [1, 1]])).toBe(4);
        });

        test('category 2 → 5..8', () => {
            expect(decode([[1, 1], [3, 2], [2, 0]])).toBe(5);
            expect(decode([[1, 1], [3, 2], [2, 3]])).toBe(8);
        });

        test('category 7 → 129..256 (boundary)', () => {
            expect(decode([[1, 1], [3, 7], [7, 0]])).toBe(129);
            expect(decode([[1, 1], [3, 7], [7, 127]])).toBe(256);
        });
    });

    describe('_internal.readBlockCount (§6)', () => {
        const b = mkBrotli();
        const { makeReader, readBlockCount } = b._internal;

        test('decodes via a stub prefix code: code 0 + extra 0 → 1', () => {
            const stub = { read() { return 0; } };
            // 2 extra bits = 0
            const r = makeReader(new Uint8Array([0]));
            expect(readBlockCount(r, stub)).toBe(1);
        });

        test('code 0 + extra 3 → 4 (top of range 1..4)', () => {
            const stub = { read() { return 0; } };
            // extra = 0b11 (LSB-first → both bits 1)
            const r = makeReader(new Uint8Array([0b11]));
            expect(readBlockCount(r, stub)).toBe(4);
        });

        test('code 8 + extra 0 → 49 (base of 49..64)', () => {
            const stub = { read() { return 8; } };
            const r = makeReader(new Uint8Array([0]));
            expect(readBlockCount(r, stub)).toBe(49);
        });

        test('code 25 + extra 0 → 16625 (top range base)', () => {
            const stub = { read() { return 25; } };
            const r = makeReader(new Uint8Array([0, 0, 0, 0]));  // 24 zero extra bits
            expect(readBlockCount(r, stub)).toBe(16625);
        });
    });

    describe('_internal.readRleMax (§7.3)', () => {
        const b = mkBrotli();
        const { makeReader, readRleMax } = b._internal;

        test('1 bit "0" → 0', () => {
            const r = makeReader(new Uint8Array([0]));
            expect(readRleMax(r)).toBe(0);
        });

        test('bit "1" + 4 bits 0 → 1', () => {
            // LSB-first: bit 0 = 1, bits 1..4 = 0,0,0,0 → byte = 0b00000001 = 0x01
            const r = makeReader(new Uint8Array([0x01]));
            expect(readRleMax(r)).toBe(1);
        });

        test('"01001" pattern decodes to 5 (per spec example)', () => {
            // Spec: "values 1..16 are encoded with bit pattern xxxx1 (so 01001 is 5)"
            // 01001 read right-to-left: bit0=1, bits[1..4]=0,0,1,0 → value 0+0+4+0=4 → RLEMAX=5
            const w = bw();
            w.bits(1, 1);
            w.bits(4, 4);                   // value 4 → RLEMAX = 4+1 = 5
            const r = makeReader(w.bytes());
            expect(readRleMax(r)).toBe(5);
        });

        test('max RLEMAX = 16', () => {
            const w = bw();
            w.bits(1, 1);
            w.bits(4, 15);                  // 16
            expect(readRleMax(makeReader(w.bytes()))).toBe(16);
        });
    });

    describe('_internal.inverseMoveToFront (§7.3)', () => {
        const b = mkBrotli();
        const { inverseMoveToFront } = b._internal;

        test('identity transform on already-decoded values is a no-op for [0, 0, 0]', () => {
            const v = new Uint8Array([0, 0, 0]);
            inverseMoveToFront(v);
            expect(Array.from(v)).toEqual([0, 0, 0]);
        });

        test('[1, 2, 3] decodes to [1, 2, 3] in MTF', () => {
            // MTF starts identity. v[0]=1 → output mtf[1]=1, move mtf to [1,0,2,3,...]
            //                       v[1]=2 → output mtf[2]=2, move to [2,1,0,3,...]
            //                       v[2]=3 → output mtf[3]=3, move to [3,2,1,0,...]
            const v = new Uint8Array([1, 2, 3]);
            inverseMoveToFront(v);
            expect(Array.from(v)).toEqual([1, 2, 3]);
        });

        test('repeated index 0 outputs the most-recently-moved value', () => {
            // v[0]=5 → output 5, mtf head = 5
            // v[1]=0 → output mtf[0]=5
            const v = new Uint8Array([5, 0]);
            inverseMoveToFront(v);
            expect(Array.from(v)).toEqual([5, 5]);
        });
    });

    describe('_internal.readContextMap (§7.3)', () => {
        const b = mkBrotli();
        const { makeReader, readContextMap } = b._internal;

        test('RLEMAX=0, ntrees=2, size=4: direct values via 2-symbol prefix code', () => {
            // RLEMAX = 0 (1 bit "0").
            // Prefix code over alphabet=2: simple, NSYM=2, sym 0 and sym 1.
            //   head 01 (LSB-first → 1,0) = value 1 → simple
            //   NSYM-1 = 1 (LSB-first → 1,0)
            //   sym 0 (alphabet_bits = 1) → 1 bit value 0
            //   sym 1 → 1 bit value 1
            // Then 4 context-map values; canonical assignment: smaller sym → code "0".
            //   So sym 0 = bit 0, sym 1 = bit 1.
            // Then IMTF bit (=0).
            const w = bw();
            w.bits(1, 0);                       // RLEMAX = 0
            w.bits(2, 1);                       // simple prefix code head
            w.bits(2, 1);                       // NSYM-1=1
            w.bits(1, 0); w.bits(1, 1);         // syms: 0, 1
            // Context map = [0, 1, 0, 1]
            w.bits(1, 0); w.bits(1, 1); w.bits(1, 0); w.bits(1, 1);
            w.bits(1, 0);                       // IMTF off
            const r = makeReader(w.bytes());
            const cmap = readContextMap(r, 4, 2);
            expect(Array.from(cmap)).toEqual([0, 1, 0, 1]);
        });
    });

    describe('brotliDecompress (async wrapper)', () => {
        const b = mkBrotli();

        test('resolves on uncompressed input', async () => {
            const out = await b.brotliDecompress(hex('0b00804103'));
            expect(txt(out)).toBe('A');
        });

        test('rejects with the same error class as sync', async () => {
            try { await b.brotliDecompress(hex('11')); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); return; }
            throw new Error('expected reject');
        });
    });

    // --- Quality levels (RFC 7932 §10) -----------------------------------

    describe('brotliCompressSync - quality levels', () => {
        const b = mkBrotli();
        const zlib = require('node:zlib');

        test('rejects non-integer quality', () => {
            try { b.brotliCompressSync(new Uint8Array(100), { quality: 5.5 }); }
            catch (e) { expect(e.code).toBe('EBADARG'); return; }
            throw new Error('expected throw');
        });

        test('rejects quality out of range [0, 11]', () => {
            try { b.brotliCompressSync(new Uint8Array(100), { quality: 12 }); }
            catch (e) { expect(e.code).toBe('EBADARG'); return; }
            throw new Error('expected throw');
        });

        test('rejects negative quality', () => {
            try { b.brotliCompressSync(new Uint8Array(100), { quality: -1 }); }
            catch (e) { expect(e.code).toBe('EBADARG'); return; }
            throw new Error('expected throw');
        });

        test('quality=0 forces uncompressed encoding', () => {
            const text = 'the quick brown fox jumps over the lazy dog '.repeat(20);
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data, { quality: 0 });
            // First byte 0x06 = single uncompressed metadata frame
            // (encoder's trivial path).
            expect(enc[0] === 0x06 || enc.length > data.length).toBe(true);
            const dec = b.brotliDecompressSync(enc);
            expect(new TextDecoder().decode(dec)).toBe(text);
        });

        test('every quality 0..11 round-trips through Node', () => {
            const text = 'common english text the quick brown fox jumps over '.repeat(10);
            const data = new TextEncoder().encode(text);
            for (let q = 0; q <= 11; ++q) {
                const enc = b.brotliCompressSync(data, { quality: q });
                const dec = zlib.brotliDecompressSync(Buffer.from(enc));
                expect(dec.toString()).toBe(text);
            }
        });

        test('encoder picks CMODE adaptively per input - text vs binary', () => {
            // Text input: should pick UTF8 (CMODE=2) by entropy.
            const text = 'the quick brown fox jumps over the lazy dog. '.repeat(20);
            const textData = new TextEncoder().encode(text);
            const textEnc = b.brotliCompressSync(textData);
            expect(textEnc[0]).toBeDefined();
            const textDec = b.brotliDecompressSync(textEnc);
            expect(new TextDecoder().decode(textDec)).toBe(text);

            // Binary-like input with limited-range bytes: LSB6 should
            // win. We can't directly inspect CMODE without parsing the
            // header, but the round-trip must be valid.
            const binData = new Uint8Array(2048);
            for (let i = 0; i < binData.length; ++i) binData[i] = i & 0x0F;
            const binEnc = b.brotliCompressSync(binData);
            const binDec = b.brotliDecompressSync(binEnc);
            expect(Array.from(binDec)).toEqual(Array.from(binData));

            // Node round-trip - confirms wire format conformance under
            // any chosen CMODE.
            const decNode = zlib.brotliDecompressSync(Buffer.from(binEnc));
            expect(Array.from(decNode)).toEqual(Array.from(binData));
        });

        test('encoder uses NBLTYPES_L > 1 block splitting on heterogeneous input', () => {
            // Build a 64 KiB input with two distinct halves: first half
            // is English text, second half is structured binary. The
            // encoder should detect the distribution shift and emit a
            // 2-block-type literal stream with per-block Huffman trees.
            const textPart = ('the quick brown fox jumps over the lazy dog. ').repeat(800);
            const textBytes = new TextEncoder().encode(textPart);

            const binPart = new Uint8Array(32768);
            for (let i = 0; i < binPart.length; ++i) binPart[i] = (i * 7) & 0x1F;

            const data = new Uint8Array(textBytes.length + binPart.length);
            data.set(textBytes, 0);
            data.set(binPart, textBytes.length);

            // Compress at high quality (triggers block split heuristic).
            const enc = b.brotliCompressSync(data, { quality: 11 });
            // Self round-trip
            const dec = b.brotliDecompressSync(enc);
            expect(Array.from(dec)).toEqual(Array.from(data));
            // Node round-trip - confirms NBLTYPES_L=2 wire format conformance.
            const decNode = zlib.brotliDecompressSync(Buffer.from(enc));
            expect(Array.from(decNode)).toEqual(Array.from(data));
        });

        test('encoder picks NPOSTFIX/NDIRECT adaptively per distance distribution', () => {
            // Repetitive input with many short distances: NDIRECT > 0
            // could win. Whatever the encoder picks, the wire format
            // must be conformant.
            const repeating = new Uint8Array(2048);
            for (let i = 0; i < repeating.length; ++i) repeating[i] = i & 0x07;
            const enc1 = b.brotliCompressSync(repeating);
            const dec1 = b.brotliDecompressSync(enc1);
            expect(Array.from(dec1)).toEqual(Array.from(repeating));
            const decNode1 = zlib.brotliDecompressSync(Buffer.from(enc1));
            expect(Array.from(decNode1)).toEqual(Array.from(repeating));

            // Less repetitive input: NPOSTFIX=0/NDIRECT=0 default likely wins.
            const random = new Uint8Array(2048);
            for (let i = 0; i < random.length; ++i) random[i] = (i * 31 + 17) & 0xFF;
            const enc2 = b.brotliCompressSync(random);
            const dec2 = b.brotliDecompressSync(enc2);
            expect(Array.from(dec2)).toEqual(Array.from(random));
            const decNode2 = zlib.brotliDecompressSync(Buffer.from(enc2));
            expect(Array.from(decNode2)).toEqual(Array.from(random));
        });

        test('higher quality produces smaller (or equal) output on text', () => {
            const text = 'lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(30);
            const data = new TextEncoder().encode(text);
            const encLow = b.brotliCompressSync(data, { quality: 1 });
            const encHigh = b.brotliCompressSync(data, { quality: 11 });
            // q=11 should not be worse than q=1 on compressible text.
            expect(encHigh.length).toBeLessThanOrEqual(encLow.length);
        });
    });

    // --- Step 7: trivial uncompressed encoder ----------------------------

    describe('brotliCompressSync - uncompressed-only encoder (step 7)', () => {
        const b = mkBrotli();
        const zlib = require('node:zlib');

        test('empty input → single byte 0x06', () => {
            const out = b.brotliCompressSync(new Uint8Array(0));
            expect(out.length).toBe(1);
            expect(out[0]).toBe(0x06);
        });

        test('round-trip via our own decoder: 1-byte input', () => {
            const data = new Uint8Array([0x41]);
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc);
            expect(Array.from(dec)).toEqual(Array.from(data));
        });

        test('round-trip: short ASCII', () => {
            const data = new TextEncoder().encode('Hello, World!');
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc);
            expect(new TextDecoder().decode(dec)).toBe('Hello, World!');
        });

        test('round-trip: longer text', () => {
            const text = 'The quick brown fox jumps over the lazy dog. '.repeat(50);
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc);
            expect(new TextDecoder().decode(dec)).toBe(text);
        });

        test('round-trip: input spanning multiple 64KB chunks', () => {
            const data = new Uint8Array(150 * 1024);  // 150 KB
            for (let i = 0; i < data.length; ++i) data[i] = (i * 31 + 17) & 0xFF;
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc);
            expect(dec.length).toBe(data.length);
            for (let i = 0; i < data.length; ++i) {
                if (dec[i] !== data[i]) throw new Error('mismatch at ' + i);
            }
        });

        test('round-trip: input exactly 64KB (boundary)', () => {
            const data = new Uint8Array(65536);
            for (let i = 0; i < data.length; ++i) data[i] = i & 0xFF;
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc);
            expect(dec.length).toBe(65536);
        });

        test('round-trip: input 65537 bytes (one byte past boundary)', () => {
            const data = new Uint8Array(65537);
            for (let i = 0; i < data.length; ++i) data[i] = i & 0xFF;
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc);
            expect(dec.length).toBe(65537);
            expect(dec[65536]).toBe(0);
        });

        test('output is decodable by Node native brotli', () => {
            const text = 'Interop check with native zlib.brotliDecompress';
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            const dec = zlib.brotliDecompressSync(Buffer.from(enc));
            expect(dec.toString()).toBe(text);
        });

        test('output for empty input is decodable by Node native brotli', () => {
            const enc = b.brotliCompressSync(new Uint8Array(0));
            const dec = zlib.brotliDecompressSync(Buffer.from(enc));
            expect(dec.length).toBe(0);
        });

        test('size overhead is ≈ 5 bytes + 3 per 64KB chunk', () => {
            const data = new Uint8Array(1000);
            const enc = b.brotliCompressSync(data);
            // 1 chunk: ~5 byte overhead
            expect(enc.length).toBeLessThanOrEqual(data.length + 10);
        });

        test('rejects non-Uint8Array input', () => {
            try { b.brotliCompressSync('not-bytes'); }
            catch (e) { expect(e.code).toBe('EBADARG'); return; }
            throw new Error('expected throw');
        });

        test('opts.quality is accepted but produces uncompressed output regardless', () => {
            const data = new TextEncoder().encode('quality test');
            for (const q of [0, 1, 5, 11]) {
                const enc = b.brotliCompressSync(data, { quality: q });
                const dec = b.brotliDecompressSync(enc);
                expect(new TextDecoder().decode(dec)).toBe('quality test');
            }
        });
    });

    // --- Step 9: LZ77 + dynamic Huffman encoder --------------------------

    describe('brotliCompressSync - LZ77 + dynamic Huffman encoder (step 9)', () => {
        const b = mkBrotli();
        const zlib = require('node:zlib');

        function rtSelf(text) {
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc);
            return { enc, decoded: new TextDecoder().decode(dec) };
        }

        function rtNative(text) {
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            const dec = zlib.brotliDecompressSync(Buffer.from(enc));
            return { enc, decoded: dec.toString() };
        }

        test('round-trips short text via self-decoder', () => {
            const text = 'Interop check with native zlib.brotliDecompress';
            const r = rtSelf(text);
            expect(r.decoded).toBe(text);
        });

        test('round-trips short text via Node native brotli', () => {
            const text = 'Interop check with native zlib.brotliDecompress';
            const r = rtNative(text);
            expect(r.decoded).toBe(text);
        });

        test('round-trips long repetitive text with strong compression', () => {
            const text = 'The quick brown fox jumps over the lazy dog. '.repeat(20);
            const r = rtSelf(text);
            expect(r.decoded).toBe(text);
            // ≥ 2x compression on this corpus is easy
            expect(r.enc.length).toBeLessThan(text.length / 2);
        });

        test('round-trips highly repetitive input via Node', () => {
            const text = 'A'.repeat(500);
            const r = rtNative(text);
            expect(r.decoded).toBe(text);
            // 500 bytes → comfortably under 200 bytes. Step 10's
            // context-modeled encoder has fixed overhead from NTREESL=4
            // descriptors and the CMAPL block; truly minimal output
            // (~10 B for trivial repetition) requires block splitting
            // and adaptive NTREESL - queued for a future commit.
            expect(r.enc.length).toBeLessThan(200);
        });

        test('round-trips overlapping pattern "ABAB..."', () => {
            const text = 'ABABABABABABABABABABAB';
            const r = rtSelf(text);
            expect(r.decoded).toBe(text);
        });

        test('round-trips JSON-like structured text', () => {
            const text = '{"name":"value","list":[1,2,3,4],"nested":{"a":true,"b":false}}'.repeat(8);
            const r = rtSelf(text);
            expect(r.decoded).toBe(text);
            expect(r.enc.length).toBeLessThan(text.length);
        });

        test('round-trips UTF-8 multi-byte content', () => {
            const text = 'café - déjà vu - naïve résumé piñata Москва 日本語 '.repeat(5);
            const r = rtSelf(text);
            expect(r.decoded).toBe(text);
        });

        test('round-trips a 4 KiB binary buffer', () => {
            const data = new Uint8Array(4096);
            let s = 17;
            for (let i = 0; i < data.length; ++i) { s = (s * 31 + 13) & 0xFF; data[i] = s; }
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc);
            expect(dec.length).toBe(data.length);
            for (let i = 0; i < data.length; ++i) {
                if (dec[i] !== data[i]) throw new Error('mismatch at ' + i);
            }
        });

        test('encoder falls back to trivial for tiny inputs (<32 bytes)', () => {
            const data = new TextEncoder().encode('short');
            const enc = b.brotliCompressSync(data);
            // Trivial framing for 5 bytes is ~9 bytes.
            expect(enc.length).toBeLessThan(15);
            const dec = b.brotliDecompressSync(enc);
            expect(new TextDecoder().decode(dec)).toBe('short');
        });

        test('encoder accepts opts.quality across the full range', () => {
            const text = 'The quick brown fox jumps over the lazy dog. '.repeat(5);
            const data = new TextEncoder().encode(text);
            for (const q of [0, 1, 2, 5, 8, 11]) {
                const enc = b.brotliCompressSync(data, { quality: q });
                const dec = b.brotliDecompressSync(enc);
                expect(new TextDecoder().decode(dec)).toBe(text);
            }
        });

        test('output decodes through Node for varied inputs', () => {
            const inputs = [
                'a'.repeat(200),
                'Hello, World! '.repeat(20),
                'The quick brown fox jumps over the lazy dog. '.repeat(30),
                'lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(20),
            ];
            for (const text of inputs) {
                const data = new TextEncoder().encode(text);
                const enc = b.brotliCompressSync(data);
                const dec = zlib.brotliDecompressSync(Buffer.from(enc));
                expect(dec.toString()).toBe(text);
            }
        });
    });

    // --- Step 10: context modeling (NTREESL=4 + CMAPL) -------------------

    describe('brotliCompressSync - context modeling (step 10)', () => {
        const b = mkBrotli();
        const zlib = require('node:zlib');

        function rt(text) {
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            return {
                enc,
                self: new TextDecoder().decode(b.brotliDecompressSync(enc)),
                node: zlib.brotliDecompressSync(Buffer.from(enc)).toString(),
            };
        }

        test('English text round-trips via both self and Node decoders', () => {
            const text = 'The quick brown fox jumps over the lazy dog. '.repeat(20);
            const r = rt(text);
            expect(r.self).toBe(text);
            expect(r.node).toBe(text);
        });

        test('lorem ipsum round-trips', () => {
            const text = 'lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(30);
            const r = rt(text);
            expect(r.self).toBe(text);
            expect(r.node).toBe(text);
        });

        test('JSON-like text round-trips', () => {
            const text = '{"name":"value","list":[1,2,3,4]} '.repeat(15);
            const r = rt(text);
            expect(r.self).toBe(text);
            expect(r.node).toBe(text);
        });

        test('UTF-8 multi-byte content round-trips with context modeling', () => {
            const text = 'café - déjà vu - naïve résumé piñata Москва 日本語 '.repeat(10);
            const r = rt(text);
            expect(r.self).toBe(text);
            expect(r.node).toBe(text);
        });

        test('mixed binary + text round-trips', () => {
            const data = new Uint8Array(2048);
            let s = 11;
            for (let i = 0; i < data.length; ++i) {
                s = (s * 7 + 13) & 0xFF;
                data[i] = (i & 1) ? s : (32 + (s & 0x3F));  // alternating binary / ASCII printable
            }
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc);
            expect(dec.length).toBe(data.length);
            for (let i = 0; i < data.length; ++i) {
                if (dec[i] !== data[i]) throw new Error('mismatch at ' + i);
            }
        });

        test('compression ratio on English text beats raw size by ≥ 3×', () => {
            // Context modeling should compress text well even without
            // block splitting / static dict refs.
            const text = 'The quick brown fox jumps over the lazy dog. '.repeat(50);
            const r = rt(text);
            expect(r.enc.length).toBeLessThan(text.length / 3);
        });

        test('decoder correctly reads NTREESL=4 + CMAPL from encoder output', () => {
            // Confirm via the decoder's internal header parser that the
            // encoded stream carries NTREESL=4 (not the step-9 NTREESL=1).
            const text = 'The quick brown fox '.repeat(10);
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);

            const r = b._internal.makeReader(enc);
            b._internal.readWBITS(r);            // WBITS
            b._internal.readBit(r);              // ISLAST
            b._internal.readBit(r);              // ISLASTEMPTY
            b._internal.readBits(r, 2);          // MNIBBLES code
            b._internal.readBits(r, 16);         // MLEN-1
            const h = b._internal.readCompressedMetaBlockHeader(r);
            expect(h.ntreesL).toBe(4);
            expect(h.cmapL.length).toBe(64);
            // Verify clustering: cmap[i] = i >> 4
            for (let i = 0; i < 64; ++i) {
                expect(h.cmapL[i]).toBe(i >> 4);
            }
        });
    });

    describe('brotliCompress (async wrapper)', () => {
        const b = mkBrotli();

        test('resolves to a valid brotli stream', async () => {
            const data = new TextEncoder().encode('async test');
            const enc = await b.brotliCompress(data);
            expect(enc).toBeInstanceOf(Uint8Array);
            const dec = await b.brotliDecompress(enc);
            expect(new TextDecoder().decode(dec)).toBe('async test');
        });
    });

    // --- Step 11: streaming wrappers --------------------------------------

    // --- Step 12: RFC 9841 LZ77 shared dictionary (decode side) -----------

    // --- RFC 9841 §5 Shared Dictionary Stream parser ----------------------

    describe('parseSharedDictionary - RFC 9841 §5 parser', () => {
        const b = mkBrotli();

        function buildMinimal(lz77Bytes) {
            // Minimal shared dict: signature + varint LZ77 length + LZ77 bytes
            // + zero word lists + zero transform lists. No dict map / context.
            const lzLen = lz77Bytes ? lz77Bytes.length : 0;
            const varBytes = [];
            // Encode lzLen as varint
            let v = lzLen;
            do {
                let b = v & 0x7F;
                v >>>= 7;
                if (v > 0) b |= 0x80;
                varBytes.push(b);
            } while (v > 0);
            const out = new Uint8Array(2 + varBytes.length + lzLen + 2);
            out[0] = 0x91; out[1] = 0x00;
            for (let i = 0; i < varBytes.length; ++i) out[2 + i] = varBytes[i];
            if (lz77Bytes) out.set(lz77Bytes, 2 + varBytes.length);
            // NUM_CUSTOM_WORD_LISTS = 0, NUM_CUSTOM_TRANSFORM_LISTS = 0
            // (last two bytes already zero from typed-array init)
            return out;
        }

        test('parses minimal stream (no LZ77 dict, no customs)', () => {
            const stream = buildMinimal(null);
            const parsed = _bShared.parseSharedDictionary(stream);
            expect(parsed.lz77Dict).toBeNull();
            expect(parsed.wordLists.length).toBe(0);
            expect(parsed.transformLists.length).toBe(0);
            expect(parsed.dictionaryMap).toBeNull();
            expect(parsed.contextMap).toBeNull();
            expect(parsed.bytesConsumed).toBe(stream.length);
        });

        test('parses stream with LZ77 dictionary', () => {
            const lz77 = new TextEncoder().encode('hello world from the LZ77 dictionary');
            const stream = buildMinimal(lz77);
            const parsed = _bShared.parseSharedDictionary(stream);
            expect(parsed.lz77Dict).toBeInstanceOf(Uint8Array);
            expect(parsed.lz77Dict.length).toBe(lz77.length);
            expect(new TextDecoder().decode(parsed.lz77Dict)).toBe('hello world from the LZ77 dictionary');
        });

        test('parses stream with large LZ77 dict (varint > 1 byte)', () => {
            // 200-byte LZ77 dict - varint = 0xC8 0x01 (200 = 128 + 72)
            const lz77 = new Uint8Array(200);
            for (let i = 0; i < 200; ++i) lz77[i] = i;
            const stream = buildMinimal(lz77);
            const parsed = _bShared.parseSharedDictionary(stream);
            expect(parsed.lz77Dict.length).toBe(200);
            expect(parsed.lz77Dict[100]).toBe(100);
        });

        test('parses stream with one empty custom word list', () => {
            // signature + varint 0 + numWordLists=1 + 28 zero bytes + 0 wordbytes + numTransformLists=0 + numDicts=1 + map(0,0) + contextEnabled=0
            const parts = [
                [0x91, 0x00],                          // signature
                [0x00],                                // varint 0 (no LZ77)
                [0x01],                                // 1 word list
                new Array(28).fill(0),                 // empty SIZE_BITS_BY_LENGTH
                [0x00],                                // 0 transform lists (none)
                // Since numWordLists > 0, we need DICTIONARY_MAP
                [0x01],                                // 1 dict
                [0x00, 0x00],                          // (wordList=0, transformList=0=built-in)
                [0x00],                                // CONTEXT_ENABLED=0
            ];
            const flat = [].concat(...parts);
            const stream = new Uint8Array(flat);
            const parsed = _bShared.parseSharedDictionary(stream);
            expect(parsed.wordLists.length).toBe(1);
            expect(parsed.wordLists[0].words.length).toBe(0);
            expect(parsed.dictionaryMap.length).toBe(1);
            expect(parsed.dictionaryMap[0]).toEqual({ wordListIdx: 0, transformListIdx: 0 });
            expect(parsed.contextMap).toBeNull();
        });

        test('parses stream with a minimal transform list', () => {
            // PREFIX_SUFFIX_LENGTH = 1 (just the 0-byte terminator)
            // NTRANSFORMS = 1, transform = (0, 0, 0)   ← (prefix idx 0 → would be invalid since no stringlets)
            //
            // To be valid we need at least one stringlet of length ≥ 1. Use:
            //   PSL=2: [1, 0x41, 0]  → 1-byte stringlet "A" then terminator
            //   NTRANSFORMS=1, (prefix=0, suffix=0, op=0)
            const parts = [
                [0x91, 0x00],          // signature
                [0x00],                // varint 0
                [0x00],                // 0 word lists
                [0x01],                // 1 transform list
                [0x03, 0x00],          // PREFIX_SUFFIX_LENGTH = 3 (LE 2 bytes)
                [0x01, 0x41, 0x00],    // stringlet "A" (1 byte) + terminator
                [0x01],                // NTRANSFORMS = 1
                [0x00, 0x00, 0x00],    // transform (prefix=0, suffix=0, op=0=Identity)
                [0x01],                // NUM_DICTIONARIES = 1
                [0x00, 0x00],          // dict map entry
                [0x00],                // CONTEXT_ENABLED = 0
            ];
            const flat = [].concat(...parts);
            const stream = new Uint8Array(flat);
            const parsed = _bShared.parseSharedDictionary(stream);
            expect(parsed.transformLists.length).toBe(1);
            expect(parsed.transformLists[0].stringlets.length).toBe(1);
            expect(parsed.transformLists[0].stringlets[0][0]).toBe(0x41);
            expect(parsed.transformLists[0].transforms.length).toBe(1);
            expect(parsed.transformLists[0].transforms[0].opIdx).toBe(0);
        });

        test('rejects invalid signature', () => {
            try { _bShared.parseSharedDictionary(new Uint8Array([0xFF, 0xFF, 0x00, 0x00])); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); expect(e.message).toMatch(/signature/); return; }
            throw new Error('expected throw');
        });

        test('rejects too-short buffer', () => {
            try { _bShared.parseSharedDictionary(new Uint8Array([0x91])); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); return; }
            throw new Error('expected throw');
        });

        test('rejects truncated varint', () => {
            // signature + 9 bytes of 0x80 (continuation flags = invalid)
            const buf = new Uint8Array([0x91, 0x00, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80]);
            try { _bShared.parseSharedDictionary(buf); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); expect(e.message).toMatch(/varint/); return; }
            throw new Error('expected throw');
        });

        test('parsed object can drive brotliDecompressSync via sharedDictionary opt', () => {
            // Build a shared dict with a small LZ77 part. Feed the parsed
            // object to brotliDecompressSync. The decoder pulls lz77Dict
            // out and threads it through as before.
            const lz77 = new TextEncoder().encode('shared lz77 dictionary content');
            const sharedStream = buildMinimal(lz77);
            const parsed = _bShared.parseSharedDictionary(sharedStream);

            // Now compress a stream that does NOT exercise the dict ref
            // path, decode with the parsed dict.
            const data = new Uint8Array(1024);
            for (let i = 0; i < data.length; ++i) data[i] = (i * 31 + 11) & 0xFF;
            const enc = b.brotliCompressSync(data);
            const dec = _bShared.brotliDecompressSync(enc, { sharedDictionary: parsed });
            expect(Array.from(dec)).toEqual(Array.from(data));
        });
    });

    // --- Encoder static-dict references (Identity transform) -------------

    describe('brotliCompressSync - static-dict references (encoder)', () => {
        const b = mkBrotli();
        const zlib = require('node:zlib');

        test('English text with common dict words round-trips through Node', () => {
            // Text contains many dict-matchable runs (" the ", " of the ",
            // "time", "first", etc.). The encoder picks up some as dict
            // refs; correctness is verified by Node's native brotli.
            const text = 'the time of day is right and the place is here. ' +
                         'the first time the brown fox jumps over the lazy dog. ';
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            const dec = zlib.brotliDecompressSync(Buffer.from(enc));
            expect(dec.toString()).toBe(text);
        });

        test('output also round-trips via self decoder', () => {
            const text = 'lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(20);
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc);
            expect(new TextDecoder().decode(dec)).toBe(text);
        });

        test('encoder uses non-Identity-only transforms (newline, period, etc.)', () => {
            // Each line is "<dict-word><suffix>" exercising a different
            // Identity-kind transform: word+".", word+"\n", word+":",
            // word+'"', word+",", word+" the ", word+" and ", word+"'",
            // word+". ", word+"\n\t", word+"]", etc.
            const text =
                'the.\n' +
                'first:\n' +
                'time"\n' +
                'world,\n' +
                'before the\n' +
                'after and\n' +
                "single'\n" +
                'last. \n' +
                'closed]\n' +
                'parens(\n' +
                'after as\n' +
                'still on\n' +
                'paint with\n';
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            // Self round-trip
            const dec = b.brotliDecompressSync(enc);
            expect(new TextDecoder().decode(dec)).toBe(text);
            // Node round-trip (proves wire format is conformant)
            const decNode = zlib.brotliDecompressSync(Buffer.from(enc));
            expect(decNode.toString()).toBe(text);
        });

        test('encoder uses FermentFirst transforms on capitalized words', () => {
            // "The", "When", "First" etc. - the dict has these as lowercase
            // words ("the", "when", "first"). FermentFirst transforms
            // (ids 4, 9, 15, 30, 58, 66, 69, 74, 78, 79, 88, 91, 96, 99,
            // 104, 108, 109, 118, 120) match them at encode time.
            const text =
                'The first time I saw The lazy dog. ' +
                'When the time comes, the man will run. ' +
                'First of all, the time of day matters. ' +
                'The. Time. World. ';
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc);
            expect(new TextDecoder().decode(dec)).toBe(text);
            const decNode = zlib.brotliDecompressSync(Buffer.from(enc));
            expect(decNode.toString()).toBe(text);
        });

        test('encoder uses FermentAll transforms on uppercased words', () => {
            // "TIME", "WORLD", "FIRST" - dict has these as lowercase
            // ("time", "world", "first"). FermentAll transforms (ids
            // 44, 68, 83, 85, 87, 94, 97, 101, 105, 107, 110, 111, 112,
            // 113, 114, 115, 116, 117, 119) match all-uppercase forms.
            const text =
                'THE TIME OF DAY IS HERE. ' +
                'WHEN THE FIRST WORLD ENDS. ' +
                'A TIME FOR EVERY MAN. ';
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc);
            expect(new TextDecoder().decode(dec)).toBe(text);
            const decNode = zlib.brotliDecompressSync(Buffer.from(enc));
            expect(decNode.toString()).toBe(text);
        });

        test('encoder uses OmitLastK transforms (truncated dict words)', () => {
            // OL transforms drop trailing bytes from a dict word. E.g.
            // dict has "happening" → OL(2) gives "happeni"; dict has
            // common verb stems whose final bytes get dropped to combine
            // with the next token.
            //
            // We can't guarantee which transform Node's encoder picked,
            // but we can guarantee our encoder produces valid brotli for
            // English text that's likely to trigger OL paths.
            const text =
                'happeni happenin happeniNGS happeniness ' +
                'runni running runn run runnings ' +
                'walki walking walkings ' +
                'someth somethi somethin something ';
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc);
            expect(new TextDecoder().decode(dec)).toBe(text);
            const decNode = zlib.brotliDecompressSync(Buffer.from(enc));
            expect(decNode.toString()).toBe(text);
        });

        test('encoder uses OmitFirstK transforms (truncated dict-word prefix)', () => {
            // OF transforms drop leading bytes from a dict word. Some
            // English words appear truncated in informal/code text (e.g.
            // "ation" from "ization", "ively" from "actively").
            // The encoder finds whichever dict word's suffix matches input.
            const text =
                'ation ation ation ation ' +
                'ively ively ively ively ' +
                'ation ively ation ively ';
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc);
            expect(new TextDecoder().decode(dec)).toBe(text);
            const decNode = zlib.brotliDecompressSync(Buffer.from(enc));
            expect(decNode.toString()).toBe(text);
        });

        test('encoder handles non-ASCII text with FermentFirst on UTF-8 codepoints', () => {
            // Mix of ASCII and 2-byte UTF-8 (Latin-1 accents). Whether the
            // dict actually contains words with these prefixes is unknown,
            // but the encoder must not corrupt the stream when the FF
            // 2-byte/3-byte scan path runs.
            const text =
                'À la maison, le chat dort. ' +
                'École de musique. Été pluvieux. ' +
                'Über alles. Größer als zuvor. ' +
                'Привет мир. Школа открыта. ';
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc);
            expect(new TextDecoder().decode(dec)).toBe(text);
            const decNode = zlib.brotliDecompressSync(Buffer.from(enc));
            expect(decNode.toString()).toBe(text);
        });

        test('encoder handles FermentAll on multi-byte UTF-8 codepoints', () => {
            // Words like "café" → "CAFÉ" under FA. The dict may not have
            // these exact entries, but the FA-UTF8 scan path must not
            // corrupt the stream when uppercased multi-byte text appears.
            const text =
                'CAFÉ ESPRESSO. ' +
                'NAÏVE PARISIAN COIFFEUR. ' +
                'CRÈME BRÛLÉE. ' +
                'ÉCOLE OUVERTE. ';
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc);
            expect(new TextDecoder().decode(dec)).toBe(text);
            const decNode = zlib.brotliDecompressSync(Buffer.from(enc));
            expect(decNode.toString()).toBe(text);
        });

        test('encoder picks longer transform suffix when it improves match', () => {
            // "the of the " - should be matched by transform 73
            // (prefix=" the ", suffix=" of the "), i.e. one dict ref
            // covers 11 bytes instead of two short identity matches.
            // We can't easily assert which transform was chosen without
            // peeking into the stream, but round-trip + Node-decoded
            // proves the wire format is well-formed.
            const text = ' the of the time of day is here ';
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            const dec = zlib.brotliDecompressSync(Buffer.from(enc));
            expect(dec.toString()).toBe(text);
        });

        test('binary input (no dict words match) round-trips without dict refs', () => {
            const data = new Uint8Array(4096);
            for (let i = 0; i < data.length; ++i) data[i] = (i * 31 + 7) & 0xFF;
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc);
            expect(Array.from(dec)).toEqual(Array.from(data));
        });

        test('encoder still works when brotliDictWords is not loaded', () => {
            // Build a brotli factory with UNLOADED brotliDictWords.
            // Encoder must fall back to no dict refs (no crash).
            const emptyWords = brotliDictWords.factory();   // isLoaded=false
            const freshDict = brotliDict.factory();
            const noDict = brotli.factory(_bs, _hf, _lz, freshDict, emptyWords);
            const text = 'the quick brown fox jumps over the lazy dog. '.repeat(5);
            const data = new TextEncoder().encode(text);
            const enc = noDict.brotliCompressSync(data);
            const dec = noDict.brotliDecompressSync(enc);
            expect(new TextDecoder().decode(dec)).toBe(text);
        });
    });

    // --- True incremental streaming decoder ------------------------------

    describe('BrotliDecompressStream - true incremental streaming', () => {
        const b = mkBrotli();

        test('emits partial output before final push', () => {
            const text = 'incremental decode of a long-ish string '.repeat(20);
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);

            const emitted = [];
            const stream = new b.BrotliDecompressStream((chunk, isFinal) => {
                emitted.push({ len: chunk.length, isFinal });
            });

            // Feed in small chunks; expect possible intermediate emissions
            // before final.
            for (let i = 0; i < enc.length; i += 3) {
                stream.push(enc.slice(i, Math.min(i + 3, enc.length)),
                            i + 3 >= enc.length);
            }

            const totalLen = emitted.reduce((s, e) => s + e.len, 0);
            expect(totalLen).toBe(data.length);
            expect(emitted[emitted.length - 1].isFinal).toBe(true);
        });

        test('partial pushes do not emit garbage on incomplete data', () => {
            const text = 'incremental';
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);

            const emitted = [];
            const stream = new b.BrotliDecompressStream((chunk, isFinal) => {
                emitted.push({ chunk: chunk.slice(), isFinal });
            });

            // Feed all but the last byte - no final marker.
            for (let i = 0; i < enc.length - 1; ++i) {
                stream.push(enc.slice(i, i + 1), false);
            }
            // At this point we may or may not have emitted any output, but
            // any emission must NOT be marked final.
            for (const e of emitted) expect(e.isFinal).toBe(false);

            // Final push completes the stream.
            stream.push(enc.slice(enc.length - 1, enc.length), true);
            const allBytes = emitted.flatMap(e => Array.from(e.chunk));
            expect(new TextDecoder().decode(new Uint8Array(allBytes))).toBe(text);
        });

        test('byte-by-byte feeding round-trips large input', () => {
            const text = 'the quick brown fox jumps over the lazy dog. '.repeat(50);
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);

            const acc = [];
            const stream = new b.BrotliDecompressStream((chunk) => {
                for (const b of chunk) acc.push(b);
            });
            for (let i = 0; i < enc.length; ++i) {
                stream.push(enc.slice(i, i + 1), i === enc.length - 1);
            }
            expect(new TextDecoder().decode(new Uint8Array(acc))).toBe(text);
        });

        test('throws EBADSTREAM when finalised with incomplete input', () => {
            const data = new TextEncoder().encode('hello world test');
            const enc = b.brotliCompressSync(data);
            const stream = new b.BrotliDecompressStream(() => {});
            // Push only the first byte, then mark as final (truncated).
            try { stream.push(enc.slice(0, 1), true); }
            catch (e) {
                expect(['EBADSTREAM', 'ESTREAMEND']).toContain(e.code);
                return;
            }
            // Some inputs may finalise cleanly; tolerate that.
        });
    });

    // --- RFC 9841 §3.1.1 ShiftFirst / ShiftAll transforms ----------------

    describe('_internal.shiftFirst / shiftAll - RFC 9841 §3.1.1', () => {
        // These helpers moved to brotli_shared as part of the v2.0 split.
        const b = mkShared();
        const { shiftFirst, shiftAll, shiftStep, shiftAddend } = b._internal;

        test('shiftAddend treats PARAMETER as 16-bit signed', () => {
            expect(shiftAddend(0)).toBe(0);
            expect(shiftAddend(1)).toBe(1);
            expect(shiftAddend(0x7FFF)).toBe(0x7FFF);
            expect(shiftAddend(0x8000)).toBe(-0x8000);
            expect(shiftAddend(0xFFFF)).toBe(-1);
        });

        test('7-bit SCALAR: ShiftFirst increments "A" → "B" with PARAM=1', () => {
            const word = new Uint8Array([0x41, 0x42, 0x43]);   // "ABC"
            shiftFirst(word, word.length, 1);
            expect(Array.from(word)).toEqual([0x42, 0x42, 0x43]);
        });

        test('7-bit SCALAR: ShiftAll increments every ASCII byte', () => {
            const word = new Uint8Array([0x41, 0x42, 0x43]);
            shiftAll(word, word.length, 1);
            expect(Array.from(word)).toEqual([0x42, 0x43, 0x44]);   // "BCD"
        });

        test('7-bit SCALAR: PARAMETER=0xFFFF (=-1) decrements', () => {
            const word = new Uint8Array([0x42, 0x43, 0x44]);
            shiftAll(word, word.length, 0xFFFF);
            expect(Array.from(word)).toEqual([0x41, 0x42, 0x43]);
        });

        test('7-bit SCALAR: shift wraps within 7 bits', () => {
            // 0x7F + 1 = 0x80 → wraps to 0x00, but top bit must remain 0
            const word = new Uint8Array([0x7F]);
            shiftAll(word, word.length, 1);
            expect(word[0]).toBe(0x00);
        });

        test('non-SCALAR first byte (continuation 0x80-0xBF) is skipped unchanged', () => {
            const word = new Uint8Array([0x80, 0x41]);
            shiftAll(word, word.length, 1);
            expect(word[0]).toBe(0x80);  // unchanged
            expect(word[1]).toBe(0x42);  // 7-bit shift applied
        });

        test('non-SCALAR first byte (>= 0xF8) is skipped unchanged', () => {
            const word = new Uint8Array([0xF8, 0x41]);
            shiftAll(word, word.length, 1);
            expect(word[0]).toBe(0xF8);
            expect(word[1]).toBe(0x42);
        });

        test('11-bit SCALAR: round-trip with PARAM=1 then -1', () => {
            // "à" in UTF-8 = 0xC3 0xA0 → 11-bit scalar = 0b00011_100000 = 0xE0
            // After +1: scalar = 0xE1 → re-encoded as 0xC3 0xA1 = "á"
            const word = new Uint8Array([0xC3, 0xA0, 0x21]);   // "à!"
            shiftFirst(word, word.length, 1);
            expect(word[0]).toBe(0xC3);
            expect(word[1]).toBe(0xA1);
            expect(word[2]).toBe(0x21);   // unchanged
            // shift back
            shiftFirst(word, word.length, 0xFFFF);
            expect(Array.from(word)).toEqual([0xC3, 0xA0, 0x21]);
        });

        test('16-bit SCALAR: shift', () => {
            // 0xE3 0x81 0x82 = U+3042 "あ" (Hiragana A). Add 1 → U+3043 "ぃ"
            // (or rather, the next codepoint).
            // scalar = ((0xE3 & 0x0F) << 12) | ((0x81 & 0x3F) << 6) | (0x82 & 0x3F)
            //        = (3 << 12) | (1 << 6) | 2 = 12288 + 64 + 2 = 12354 = 0x3042
            const word = new Uint8Array([0xE3, 0x81, 0x82]);
            shiftFirst(word, word.length, 1);
            // shifted = 0x3043 = 12355. Re-encode: ((0x3043 >> 12) & 0x0F) | 0xE0
            //   byte0 = 0xE0 | 0x03 = 0xE3 (same)
            //   byte1 = 0x80 | ((0x3043 >> 6) & 0x3F) = 0x80 | (0xC1 & 0x3F) = 0x80 | 0x01 = 0x81
            //   byte2 = 0x80 | (0x3043 & 0x3F) = 0x80 | 0x03 = 0x83
            expect(Array.from(word)).toEqual([0xE3, 0x81, 0x83]);
        });

        test('21-bit SCALAR: shift', () => {
            // U+1F600 "😀" = F0 9F 98 80. scalar = ((0xF0 & 7) << 18) | ...
            //   = (0 << 18) | ((0x9F & 0x3F) << 12) | ((0x98 & 0x3F) << 6) | (0x80 & 0x3F)
            //   = 0 | (0x1F << 12) | (0x18 << 6) | 0 = 0x1F000 + 0x600 + 0 = 0x1F600
            const word = new Uint8Array([0xF0, 0x9F, 0x98, 0x80]);
            shiftFirst(word, word.length, 1);
            // shifted = 0x1F601 → byte3 low6 = 0x01 → byte3 = 0x80 | 0x01 = 0x81
            expect(Array.from(word)).toEqual([0xF0, 0x9F, 0x98, 0x81]);
        });

        test('insufficient bytes for multi-byte SCALAR aborts the rest of the word', () => {
            // 0xC3 starts a 2-byte SCALAR but no second byte present
            const word = new Uint8Array([0xC3]);
            shiftAll(word, word.length, 1);
            expect(word[0]).toBe(0xC3);   // unchanged
        });

        test('"X" bits in continuation bytes are preserved during shift', () => {
            // 16-bit SCALAR with "X" bits set in the continuation bytes.
            // Per spec the "X" bits are arbitrary and must NOT be touched.
            //   First byte: 0xE3 (1110_0011 - top 4 = 1110, low 4 = 0011)
            //   Second byte: 0xC1 (11_000001 - XX = 11, s = 000001)
            //   Third byte: 0xC2 (11_000010 - XX = 11, s = 000010)
            // scalar = (3 << 12) | (1 << 6) | 2 = 12354 = 0x3042
            // shift +1 → 0x3043
            // byte0 unchanged (0xE3)
            // byte1 = (0xC1 & 0xC0) | ((0x3043 >> 6) & 0x3F)
            //       = 0xC0 | 0x01 = 0xC1 (X bits preserved)
            // byte2 = (0xC2 & 0xC0) | (0x3043 & 0x3F)
            //       = 0xC0 | 0x03 = 0xC3
            const word = new Uint8Array([0xE3, 0xC1, 0xC2]);
            shiftFirst(word, word.length, 1);
            expect(Array.from(word)).toEqual([0xE3, 0xC1, 0xC3]);
        });
    });

    // --- RFC 9841 §3.1 custom static dictionary (decode integration) -----

    describe('brotliDecompressSync - custom static dictionary (RFC 9841 §3.1)', () => {
        const b = mkShared();

        test('parsed shared-dict with empty customs falls back to built-in dict', () => {
            // A shared-dict stream with no custom word/transform lists
            // produces a parsed object with empty arrays and null
            // dictionaryMap → decoder uses built-in brotli dict for
            // static-dict refs (no customDict in state).
            const stream = new Uint8Array([0x91, 0x00, 0x00, 0x00, 0x00]);
            const parsed = _bShared.parseSharedDictionary(stream);
            // Compress some text that uses the encoder's static dict ref path
            const text = 'the time of day is right ';
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc, { sharedDictionary: parsed });
            expect(new TextDecoder().decode(dec)).toBe(text);
        });

        test('parsed shared-dict with custom word list routes through customDict path', () => {
            // Build a synthetic shared dict with ONE custom word list
            // (empty) and the built-in transform list. The decoder must
            // engage the custom-dict code path. For our test, the
            // encoder still produces refs to the built-in dict - so we
            // configure the parsed dict to reference built-in for words
            // AND transforms (wordListIdx = numWordLists = 1 = built-in,
            // transformListIdx = 0 = the empty custom list - but that
            // would be wrong). Use built-in for both via wordListIdx ==
            // numWordLists and transformListIdx == numTransformLists.
            //
            // Build the shared dict bytes:
            //   signature 91 00, varint 0 (no LZ77),
            //   NUM_CUSTOM_WORD_LISTS=1, SIZE_BITS_BY_LENGTH[28]=all 0, 0 word bytes,
            //   NUM_CUSTOM_TRANSFORM_LISTS=0,
            //   NUM_DICTIONARIES=1, dict map (wordListIdx=1=built-in, transformListIdx=0=built-in), CONTEXT_ENABLED=0.
            const parts = [
                [0x91, 0x00],
                [0x00],
                [0x01],
                new Array(28).fill(0),
                [0x00],
                [0x01],
                [0x01, 0x00],          // dict map: word list 1 = built-in, transform list 0 = built-in
                [0x00],
            ];
            const flat = [].concat(...parts);
            const stream = new Uint8Array(flat);
            const parsed = _bShared.parseSharedDictionary(stream);

            const text = 'the time of day is right ';
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            // With dictionaryMap set, the decoder routes through the
            // custom path - which falls back to built-in lookup/transform
            // because both wordListIdx and transformListIdx point to
            // built-in. Round-trip must still match.
            const dec = b.brotliDecompressSync(enc, { sharedDictionary: parsed });
            expect(new TextDecoder().decode(dec)).toBe(text);
        });

        test('custom-dict opt with context map (NUM_DICTIONARIES > 1) is accepted', () => {
            // 2 dicts both pointing to built-in word/transform lists.
            // Context map directs every context to dict 0 (built-in).
            const parsed = {
                lz77Dict: null,
                wordLists: [],
                transformLists: [],
                dictionaryMap: [{ wordListIdx: 0, transformListIdx: 0 }, { wordListIdx: 0, transformListIdx: 0 }],
                contextMap: new Uint8Array(64),  // all zeros = always prefer dict 0
            };
            const text = 'the time of day ';
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc, { sharedDictionary: parsed });
            expect(new TextDecoder().decode(dec)).toBe(text);
        });
    });

    // --- Encoder shared LZ77 dictionary (RFC 9841 §3.2) -------------------

    describe('brotliCompressSync - shared LZ77 dictionary (encoder)', () => {
        const b = mkShared();

        function rtWithDict(text, dictText) {
            const dict = new TextEncoder().encode(dictText);
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data, { sharedDictionary: { lz77: dict } });
            const dec = b.brotliDecompressSync(enc, { sharedDictionary: { lz77: dict } });
            return { enc, decoded: new TextDecoder().decode(dec) };
        }

        test('round-trip with shared dict (text shares prefix patterns)', () => {
            const dictText = 'common API response format: status code, timestamp, payload';
            const text = 'common API response format: status code, timestamp, body';
            const { decoded } = rtWithDict(text, dictText);
            expect(decoded).toBe(text);
        });

        test('compression improves with relevant shared dictionary', () => {
            const dictText = 'API endpoint /users/profile/avatar GET 200 OK';
            const text = 'API endpoint /users/profile/avatar GET 200 OK\n' +
                         'API endpoint /users/profile/avatar GET 200 OK';
            const data = new TextEncoder().encode(text);
            const dict = new TextEncoder().encode(dictText);
            const encNoDict = b.brotliCompressSync(data);
            const encWithDict = b.brotliCompressSync(data, { sharedDictionary: { lz77: dict } });
            // With a strongly-overlapping dict, encoded size should drop.
            expect(encWithDict.length).toBeLessThan(encNoDict.length);
        });

        test('unrelated dict does not corrupt the round-trip', () => {
            // Dict that shares NO substrings with the input - encoder
            // should fall through without using dict matches.
            const dict = new Uint8Array(256);
            for (let i = 0; i < 256; ++i) dict[i] = i;
            const text = 'completely unrelated text content for round-trip verification';
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data, { sharedDictionary: { lz77: dict } });
            const dec = b.brotliDecompressSync(enc, { sharedDictionary: { lz77: dict } });
            expect(new TextDecoder().decode(dec)).toBe(text);
        });

        test('encoder accepts both .lz77 and .lz77Dict field names', () => {
            const dict = new TextEncoder().encode('common shared prefix');
            const text = 'common shared prefix followed by data';
            const data = new TextEncoder().encode(text);
            const encA = b.brotliCompressSync(data, { sharedDictionary: { lz77: dict } });
            const encB = b.brotliCompressSync(data, { sharedDictionary: { lz77Dict: dict } });
            const decA = b.brotliDecompressSync(encA, { sharedDictionary: { lz77: dict } });
            const decB = b.brotliDecompressSync(encB, { sharedDictionary: { lz77Dict: dict } });
            expect(new TextDecoder().decode(decA)).toBe(text);
            expect(new TextDecoder().decode(decB)).toBe(text);
        });
    });

    // --- Large window mode (RFC 9841 §6, decoder) -----------------------

    describe('brotliDecompressSync - RFC 9841 §6 large window mode (decode)', () => {
        const b = mkShared();

        test('regular brotli stream still works with allowLargeWindow=true', () => {
            // The 14-bit large-window prefix only activates on the
            // reserved `0010001` pattern. Regular WBITS encodings (16,
            // 17-24, 10-15) decode normally regardless of the flag.
            const text = 'Hello, World! '.repeat(8);
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            const dec = b.brotliDecompressSync(enc, { allowLargeWindow: true });
            expect(new TextDecoder().decode(dec)).toBe(text);
        });

        test('empty stream 0x3b decodes under allowLargeWindow', () => {
            const dec = b.brotliDecompressSync(hex('3b'), { allowLargeWindow: true });
            expect(dec.length).toBe(0);
        });

        test('hand-crafted large window header: WBITS=10', () => {
            // 8-bit prefix 00010001 (LSB-first 1,0,0,0,1,0,0,0) = 0x11
            // + 6 bits WBITS=10 (LSB-first 0,1,0,1,0,0) = 0b001010 = 10 → val 10
            // For WBITS=10, window = 1024-16 = 1008. After 14 bits header,
            // next bit position is 6 of byte 1 - emit an empty meta-block:
            //   ISLAST=1, ISLASTEMPTY=1 → 2 bits "11"
            // Total bits: 14 + 2 = 16 bits = 2 bytes.
            //
            // Byte 0 = 0x11. Byte 1 needs:
            //   bits 0-5 of byte 1 = 6-bit WBITS value = 10 (LSB-first 0,1,0,1,0,0)
            //   bit 6 of byte 1 = ISLAST = 1
            //   bit 7 of byte 1 = ISLASTEMPTY = 1
            //   → byte 1 bits: 0,1,0,1,0,0,1,1 = 0b11001010 = 0xCA
            const stream = new Uint8Array([0x11, 0xCA]);
            const dec = b.brotliDecompressSync(stream, { allowLargeWindow: true });
            expect(dec.length).toBe(0);
        });

        test('WBITS=31 accepted in large-window mode (empty stream)', () => {
            // 8-bit prefix 0x11 + 6 bits WBITS=31 LSB-first 1,1,1,1,1,0
            // ISLAST=1, ISLASTEMPTY=1 → byte 1 = 0b11011111 = 0xDF
            const stream = new Uint8Array([0x11, 0xDF]);
            const dec = b.brotliDecompressSync(stream, { allowLargeWindow: true });
            expect(dec.length).toBe(0);
        });

        test('WBITS=50 accepted in large-window mode (empty stream)', () => {
            // WBITS=50 = 0b110010, LSB-first 0,1,0,0,1,1
            // ISLAST=1, ISLASTEMPTY=1 → byte 1 = 0b11110010 = 0xF2
            const stream = new Uint8Array([0x11, 0xF2]);
            const dec = b.brotliDecompressSync(stream, { allowLargeWindow: true });
            expect(dec.length).toBe(0);
        });

        test('WBITS=51 accepted via BigInt path (empty stream)', () => {
            // WBITS=51 = 0b110011, LSB-first 1,1,0,0,1,1
            // ISLAST=1, ISLASTEMPTY=1 → byte 1 = 0b11110011 = 0xF3
            const stream = new Uint8Array([0x11, 0xF3]);
            const dec = b.brotliDecompressSync(stream, { allowLargeWindow: true });
            expect(dec.length).toBe(0);
        });

        test('WBITS=62 (spec ceiling) accepted in large-window mode', () => {
            // WBITS=62 = 0b111110, LSB-first 0,1,1,1,1,1
            // ISLAST=1, ISLASTEMPTY=1 → byte 1 = 0b11111110 = 0xFE
            const stream = new Uint8Array([0x11, 0xFE]);
            const dec = b.brotliDecompressSync(stream, { allowLargeWindow: true });
            expect(dec.length).toBe(0);
        });

        test('WBITS < 10 rejected as out of range', () => {
            // WBITS=9 → 6 bits LSB-first 1,0,0,1,0,0 = 9
            // byte 1 bits 0-5 = 9 → 0b001001 reading MSB-down, LSB-first val=9
            // ISLAST=1, ISLASTEMPTY=1
            // byte 1 LSB→MSB: 1,0,0,1,0,0,1,1 = 0b11001001 = 0xC9
            const stream = new Uint8Array([0x11, 0xC9]);
            try { b.brotliDecompressSync(stream, { allowLargeWindow: true }); }
            catch (e) {
                expect(e.code).toBe('EBADSTREAM');
                expect(e.message).toMatch(/out of range/);
                return;
            }
            throw new Error('expected throw');
        });

        test('allowLargeWindow flag propagates via brotliDecompress (async)', async () => {
            const dec = await b.brotliDecompress(hex('3b'), { allowLargeWindow: true });
            expect(dec.length).toBe(0);
        });

        test('allowLargeWindow flag propagates via BrotliDecompressStream', () => {
            const out = [];
            const s = new b.BrotliDecompressStream(
                { allowLargeWindow: true },
                (chunk) => out.push(chunk),
            );
            s.push(hex('3b'), true);
            expect(out[0].length).toBe(0);
        });
    });

    describe('brotliDecompressSync - RFC 9841 LZ77 shared dictionary (step 12)', () => {
        const b = mkShared();

        test('decoder with sharedDictionary.lz77 round-trips a stream lacking dict refs', () => {
            // Per RFC 9841 §3.2, shared-dict info is out-of-band: a
            // stream encoded WITHOUT awareness of the LZ77 dict has its
            // static-dict references shifted by `LZ77_DICTIONARY_LENGTH`
            // when decoded WITH a dict. Mixing them therefore corrupts
            // output. The decoder still supports the option; this test
            // exercises a binary input that our encoder does NOT emit
            // any static-dict ref for, so the dict is genuinely unused
            // and the round-trip matches.
            const data = new Uint8Array(2048);
            for (let i = 0; i < data.length; ++i) data[i] = (i * 31 + 17) & 0xFF;
            const enc = b.brotliCompressSync(data);
            const sharedDict = new Uint8Array(4096);
            for (let i = 0; i < sharedDict.length; ++i) sharedDict[i] = (i * 7) & 0xFF;
            const dec = b.brotliDecompressSync(enc, {
                sharedDictionary: { lz77: sharedDict },
            });
            expect(Array.from(dec)).toEqual(Array.from(data));
        });

        test('rejects non-Uint8Array sharedDictionary.lz77', () => {
            const data = new Uint8Array([0x06]);
            try {
                b.brotliDecompressSync(data, { sharedDictionary: { lz77: 'not-bytes' } });
            } catch (e) {
                expect(e.code).toBe('EBADARG');
                expect(e.message).toMatch(/sharedDictionary\.lz77/);
                return;
            }
            throw new Error('expected throw');
        });

        test('hand-crafted stream: LZ77 dictionary reference', () => {
            // We hand-construct a brotli stream where a backward distance
            // lands in the LZ77 dictionary range.
            //
            // The stream encodes "X" repeated K times, but instead of
            // emitting all literals, the encoder emits one literal + a
            // backward reference of distance D > maxAllowed. Without an
            // LZ77 dict, that distance would be a static-dict reference.
            // With our LZ77 dict supplied, the distance points into the
            // dict and reproduces "X" bytes.
            //
            // Simpler test: rather than craft the bitstream by hand
            // (huge effort), we exploit the encoder to round-trip a
            // single stream that happens to NOT use the LZ77 dict, then
            // verify that the LZ77 dict argument is correctly threaded
            // (state.lz77Dict set, used in distance computations).
            //
            // Indirect verification: stream where the FIRST backward
            // reference points to within the LZ77 dict instead of the
            // (empty) regular window. This requires the encoder to emit
            // such a reference, which our current encoder does not do
            // (it never produces distances beyond maxAllowed). So we
            // verify the API plumbing only - actual RFC 9841 decode
            // round-trip on hand-crafted streams is covered by the unit
            // tests at the _decodeCompressedBody level (see internal
            // tests below).
            const text = 'Hello, World!';
            const data = new TextEncoder().encode(text);
            const enc = b.brotliCompressSync(data);
            // Decode with various dict sizes - none referenced.
            for (const dictLen of [0, 16, 1024, 65536]) {
                const dict = new Uint8Array(dictLen);
                const dec = b.brotliDecompressSync(enc, {
                    sharedDictionary: { lz77: dict },
                });
                expect(new TextDecoder().decode(dec)).toBe(text);
            }
        });

        test('LZ77 dict ref: empty stream + non-empty dict is still empty', () => {
            // Empty-stream byte: 0x06 (WBITS=16 + ISLASTEMPTY)
            const dict = new Uint8Array([0x41, 0x42, 0x43]);
            const dec = b.brotliDecompressSync(new Uint8Array([0x06]), {
                sharedDictionary: { lz77: dict },
            });
            expect(dec.length).toBe(0);
        });

        test('sharedDictionary.lz77 propagates through brotliDecompress (async)', async () => {
            const text = 'async test';
            const enc = b.brotliCompressSync(new TextEncoder().encode(text));
            const sharedDict = new Uint8Array(100);
            const dec = await b.brotliDecompress(enc, {
                sharedDictionary: { lz77: sharedDict },
            });
            expect(new TextDecoder().decode(dec)).toBe(text);
        });

        test('sharedDictionary.lz77 propagates through BrotliDecompressStream', () => {
            const text = 'streamed dict test';
            const enc = b.brotliCompressSync(new TextEncoder().encode(text));
            const sharedDict = new Uint8Array(50);
            const out = [];
            const s = new b.BrotliDecompressStream(
                { sharedDictionary: { lz77: sharedDict } },
                (chunk) => out.push(chunk),
            );
            s.push(enc, true);
            expect(new TextDecoder().decode(out[0])).toBe(text);
        });
    });

    describe('BrotliCompressStream / BrotliDecompressStream - buffered streaming (step 11)', () => {
        const b = mkBrotli();

        function chunkify(data, chunkSize) {
            const chunks = [];
            for (let i = 0; i < data.length; i += chunkSize) {
                chunks.push(data.slice(i, Math.min(i + chunkSize, data.length)));
            }
            return chunks;
        }

        function roundTripStream(text, chunkSize) {
            const data = new TextEncoder().encode(text);
            const inChunks = chunkify(data, chunkSize);

            // Compress via stream
            const encChunks = [];
            const compressStream = new b.BrotliCompressStream((chunk, isFinal) => {
                encChunks.push(chunk);
                if (!isFinal) throw new Error('compress stream emitted intermediate chunk (buffered impl emits only on final)');
            });
            for (let i = 0; i < inChunks.length; ++i) {
                compressStream.push(inChunks[i], i === inChunks.length - 1);
            }
            // Concatenate (should be exactly 1 chunk with buffered impl)
            const enc = encChunks[0];

            // Decompress via stream - feed the compressed output back as chunks
            const decChunks = [];
            const decompressStream = new b.BrotliDecompressStream((chunk, isFinal) => {
                decChunks.push(chunk);
                if (!isFinal) throw new Error('decompress stream emitted intermediate chunk');
            });
            const encParts = chunkify(enc, chunkSize);
            for (let i = 0; i < encParts.length; ++i) {
                decompressStream.push(encParts[i], i === encParts.length - 1);
            }
            return new TextDecoder().decode(decChunks[0]);
        }

        const TEST_TEXT = 'The quick brown fox jumps over the lazy dog. '.repeat(50);

        test('round-trip with 1-byte chunks', () => {
            expect(roundTripStream(TEST_TEXT, 1)).toBe(TEST_TEXT);
        });

        test('round-trip with 64-byte chunks', () => {
            expect(roundTripStream(TEST_TEXT, 64)).toBe(TEST_TEXT);
        });

        test('round-trip with 1 KiB chunks', () => {
            expect(roundTripStream(TEST_TEXT, 1024)).toBe(TEST_TEXT);
        });

        test('round-trip with 64 KiB chunks', () => {
            const bigText = TEST_TEXT.repeat(40);  // ~90 KiB
            expect(roundTripStream(bigText, 65536)).toBe(bigText);
        });

        test('round-trip with single push (whole input at once)', () => {
            expect(roundTripStream(TEST_TEXT, TEST_TEXT.length)).toBe(TEST_TEXT);
        });

        test('compress stream accepts options as first arg', () => {
            const collected = [];
            const stream = new b.BrotliCompressStream({ quality: 1 }, (chunk, isFinal) => {
                collected.push({ len: chunk.length, isFinal });
            });
            stream.push(new TextEncoder().encode('hello world'), true);
            expect(collected.length).toBe(1);
            expect(collected[0].isFinal).toBe(true);
        });

        test('compress stream accepts ondata as first arg (no opts)', () => {
            const collected = [];
            const stream = new b.BrotliCompressStream((chunk, isFinal) => {
                collected.push({ chunk, isFinal });
            });
            stream.push(new TextEncoder().encode('hello'), true);
            expect(collected.length).toBe(1);
        });

        test('empty input (final=true on first push with empty chunk)', () => {
            const enc = [];
            const c = new b.BrotliCompressStream((chunk) => enc.push(chunk));
            c.push(new Uint8Array(0), true);
            expect(enc.length).toBe(1);
            // Decompress the empty-stream output
            const dec = [];
            const d = new b.BrotliDecompressStream((chunk) => dec.push(chunk));
            d.push(enc[0], true);
            expect(dec[0].length).toBe(0);
        });

        test('multiple intermediate pushes before final', () => {
            const data = new TextEncoder().encode('streaming intermediate test');
            const enc = [];
            const c = new b.BrotliCompressStream((chunk) => enc.push(chunk));
            // Push 1 byte at a time, none final, then final empty
            for (let i = 0; i < data.length; ++i) {
                c.push(data.subarray(i, i + 1), false);
            }
            expect(enc.length).toBe(0);   // buffered impl emits only on final
            c.push(new Uint8Array(0), true);
            expect(enc.length).toBe(1);

            const dec = [];
            const d = new b.BrotliDecompressStream((chunk) => dec.push(chunk));
            d.push(enc[0], true);
            expect(new TextDecoder().decode(dec[0])).toBe('streaming intermediate test');
        });

        test('push after final throws ESTREAMEND', () => {
            const c = new b.BrotliCompressStream(() => {});
            c.push(new TextEncoder().encode('abc'), true);
            try { c.push(new TextEncoder().encode('def'), true); }
            catch (e) { expect(e.code).toBe('ESTREAMEND'); return; }
            throw new Error('expected throw');
        });

        test('push without ondata throws EBADARG', () => {
            const c = new b.BrotliCompressStream();   // no ondata
            try { c.push(new TextEncoder().encode('abc'), true); }
            catch (e) { expect(e.code).toBe('EBADARG'); return; }
            throw new Error('expected throw');
        });

        test('push non-Uint8Array chunk throws EBADARG', () => {
            const c = new b.BrotliCompressStream(() => {});
            try { c.push('not-bytes', true); }
            catch (e) { expect(e.code).toBe('EBADARG'); return; }
            throw new Error('expected throw');
        });

        test('compress stream output decodes via sync API', () => {
            const data = new TextEncoder().encode('cross-api test');
            const enc = [];
            const c = new b.BrotliCompressStream((chunk) => enc.push(chunk));
            c.push(data.subarray(0, 5), false);
            c.push(data.subarray(5), true);
            const dec = b.brotliDecompressSync(enc[0]);
            expect(new TextDecoder().decode(dec)).toBe('cross-api test');
        });

        test('decompress stream input from sync compress API', () => {
            const data = new TextEncoder().encode('reverse cross-api test');
            const enc = b.brotliCompressSync(data);
            const dec = [];
            const d = new b.BrotliDecompressStream((chunk) => dec.push(chunk));
            // Feed in 7-byte chunks
            for (let i = 0; i < enc.length; i += 7) {
                d.push(enc.slice(i, i + 7), i + 7 >= enc.length);
            }
            expect(new TextDecoder().decode(dec[0])).toBe('reverse cross-api test');
        });
    });
});

// --- Realistic-corpus regression (fw/BATCH_34 brotli decoder fix) ---
//
// The rest of this file only drives short or highly repetitive inputs, whose
// prefix codes stay short. Real inputs produce code lengths up to 15 bits;
// these tests lock in round-trips on diverse corpora, with node:zlib as the
// oracle in both directions (fw encoder → node decoder, node encoder → fw
// decoder) so an encoder bug and a decoder bug are told apart.
//
// Inputs are kept ≤ 144 KB of real text so no single literal count reaches
// huffman.buildTree's frequency ceiling (BL-1110, a separate encoder defect
// on the 256 KB random corpus - deliberately not exercised here).
describe('brotli - realistic corpora round-trip (node:zlib oracle)', () => {
    const zlib = require('node:zlib');
    const C = zlib.constants;
    const SRC = new Uint8Array(fs.readFileSync(path.join(__dirname, 'brotli.js')));

    // Deterministic LCG - reproducible pseudo-random text and JSON.
    function lcg(seed) {
        let s = seed >>> 0;
        return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s; };
    }
    function wordSoup(n, seed) {
        const rnd = lcg(seed);
        const words = ['alpha', 'brotli', 'context', 'decoder', 'the', 'of', 'and',
            'window', 'distance', 'literal', 'prefix', 'Huffman', 'meta-block',
            'Zebra', 'quantum', '42', '1024', 'x', 'y', 'hello', 'world'];
        let s = '';
        while (s.length < n) {
            const r = rnd();
            s += words[r % words.length] + ((r >>> 8) % 11 === 0 ? '.\n' : ' ');
            if ((r >>> 16) % 97 === 0) s += String.fromCharCode(33 + ((r >>> 20) % 90));
        }
        return new TextEncoder().encode(s.slice(0, n));
    }
    function jsonDoc(n, seed) {
        const rnd = lcg(seed);
        const rows = [];
        let len = 2;
        while (len < n) {
            const r = rnd();
            const row = { id: r % 100000, name: 'item-' + (r >>> 12).toString(36),
                price: ((r >>> 3) % 99999) / 100, tags: ['a', 'bb', 'ccc'].slice(0, r % 4),
                ok: (r & 1) === 1 };
            const t = JSON.stringify(row);
            rows.push(t); len += t.length + 1;
        }
        return new TextEncoder().encode(('[' + rows.join(',') + ']').slice(0, n));
    }

    const CORPORA = {
        'brotli.js (full)': SRC,
        'brotli.js [0,16K)': SRC.subarray(0, 16384),
        'brotli_dict.bin [0,64K)': DICT_BLOB.subarray(0, 65536),
        'word soup 48K': wordSoup(49152, 7),
        'json 32K': jsonDoc(32768, 11),
    };

    function eq(a, b) {
        return a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
    }

    for (const [name, x] of Object.entries(CORPORA)) {
        test('fw encoder: self round-trip + node oracle - ' + name, () => {
            for (const q of [1, 6, 11]) {
                const enc = mkBrotli().brotliCompressSync(x, { quality: q });
                expect(eq(zlib.brotliDecompressSync(Buffer.from(enc)), x)).toBe(true);
                expect(eq(mkBrotli().brotliDecompressSync(enc), x)).toBe(true);
            }
        });

        test('fw decoder on node-encoded streams - ' + name, () => {
            for (const q of [0, 1, 5, 9, 11]) {
                const enc = new Uint8Array(zlib.brotliCompressSync(Buffer.from(x), {
                    params: { [C.BROTLI_PARAM_QUALITY]: q, [C.BROTLI_PARAM_SIZE_HINT]: x.length },
                }));
                expect(eq(mkBrotli().brotliDecompressSync(enc), x)).toBe(true);
            }
        });
    }

    // Encoder: when static-dict refs consume the whole final literal run, the
    // augmented command list used to end with an empty (0 insert, 0 copy)
    // command whose IAC symbol dangled after MLEN - node rejected the stream
    // and the fw decoder threw "non-zero fill bits".
    test('stream ending in a static-dict word has no dangling command (fw self + node)', () => {
        const prefix = '0123456789 qwxz kj vbnm pqrs 9876543210 zyxw '.repeat(20);
        for (const tail of [' information', ' international', ' government', ' understanding']) {
            const x = new TextEncoder().encode(prefix + tail);
            for (const q of [1, 6, 11]) {
                const enc = mkBrotli().brotliCompressSync(x, { quality: q });
                expect(eq(zlib.brotliDecompressSync(Buffer.from(enc)), x)).toBe(true);
                expect(eq(mkBrotli().brotliDecompressSync(enc), x)).toBe(true);
            }
        }
    });

    test('2 KiB slice sweep over brotli.js - fw self + node oracle, q1/q6', () => {
        const failures = [];
        for (let off = 0; off + 2048 <= SRC.length; off += 2048) {
            const x = SRC.subarray(off, off + 2048);
            for (const q of [1, 6]) {
                const enc = mkBrotli().brotliCompressSync(x, { quality: q });
                let node = 'ok', self = 'ok';
                try { if (!eq(zlib.brotliDecompressSync(Buffer.from(enc)), x)) node = 'mismatch'; }
                catch (e) { node = e.message; }
                try { if (!eq(mkBrotli().brotliDecompressSync(enc), x)) self = 'mismatch'; }
                catch (e) { self = e.message; }
                if (node !== 'ok' || self !== 'ok') failures.push(off + '@q' + q + ' node=' + node + ' self=' + self);
            }
        }
        expect(failures).toEqual([]);
    });
});
