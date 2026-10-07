// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview CCITTFaxDecode codec (ITU-T T.4 / T.6).
 *
 * Implements:
 *   - K < 0  : Group 4 (T.6), pure 2D coding.
 *   - K == 0 : Group 3 1D (T.4 baseline, white/black run Huffman).
 *   - K  > 0 : Group 3 mixed 1D/2D (T.4 with K-row block, tag bit).
 *
 * Output is a packed bitstream of `Columns` bits per row, MSB-first
 * (PDF convention). Polarity follows /BlackIs1 (default: white = 1).
 *
 * The encoder side is intentionally out of scope: the practical use
 * case is reading legacy faxed image streams found in older PDFs.
 *
 * @module pdf/extra/ccitt-fax-decoder
 */

import { pdfErrors } from '../errors.js';

export const pdfCcittFaxDecoder = {
    name: 'pdfCcittFaxDecoder',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],

    factory(errors) {
        const { ParseError } = errors;

        // ---------- Huffman tables (T.4 §4.1.4, T.6) ----------
        //
        // Format: Map keyed by bit-string string ('0', '01', ...).
        // The decoder reads MSB-first, accumulating bits as a string,
        // and looks up after each new bit. Codes are prefix-free so
        // the first match wins. Tables are small (~ a few hundred
        // entries) and built once per factory call.

        // White terminating codes, run = 0..63
        const WHITE_TERM = [
            '00110101','000111','0111','1000','1011','1100','1110','1111',
            '10011','10100','00111','01000','001000','000011','110100','110101',
            '101010','101011','0100111','0001100','0001000','0010111','0000011','0000100',
            '0101000','0101011','0010011','0100100','0011000','00000010','00000011','00011010',
            '00011011','00010010','00010011','00010100','00010101','00010110','00010111','00101000',
            '00101001','00101010','00101011','00101100','00101101','00000100','00000101','00001010',
            '00001011','01010010','01010011','01010100','01010101','00100100','00100101','01011000',
            '01011001','01011010','01011011','01001010','01001011','00110010','00110011','00110100'
        ];

        // White make-up codes, run = 64,128,...,1728  (multiples of 64)
        const WHITE_MAKEUP = {
            64:'11011', 128:'10010', 192:'010111', 256:'0110111',
            320:'00110110', 384:'00110111', 448:'01100100', 512:'01100101',
            576:'01101000', 640:'01100111', 704:'011001100', 768:'011001101',
            832:'011010010', 896:'011010011', 960:'011010100', 1024:'011010101',
            1088:'011010110', 1152:'011010111', 1216:'011011000', 1280:'011011001',
            1344:'011011010', 1408:'011011011', 1472:'010011000', 1536:'010011001',
            1600:'010011010', 1664:'011000', 1728:'010011011'
        };

        // Black terminating codes, run = 0..63
        const BLACK_TERM = [
            '0000110111','010','11','10','011','0011','0010','00011',
            '000101','000100','0000100','0000101','0000111','00000100','00000111','000011000',
            '0000010111','0000011000','0000001000','00001100111','00001101000','00001101100','00000110111','00000101000',
            '00000010111','00000011000','000011001010','000011001011','000011001100','000011001101','000001101000','000001101001',
            '000001101010','000001101011','000011010010','000011010011','000011010100','000011010101','000011010110','000011010111',
            '000001101100','000001101101','000011011010','000011011011','000001010100','000001010101','000001010110','000001010111',
            '000001100100','000001100101','000001010010','000001010011','000000100100','000000110111','000000111000','000000100111',
            '000000101000','000001011000','000001011001','000000101011','000000101100','000001011010','000001100110','000001100111'
        ];

        // Black make-up codes, run = 64..1728
        const BLACK_MAKEUP = {
            64:'0000001111', 128:'000011001000', 192:'000011001001', 256:'000001011011',
            320:'000000110011', 384:'000000110100', 448:'000000110101', 512:'0000001101100',
            576:'0000001101101', 640:'0000001001010', 704:'0000001001011', 768:'0000001001100',
            832:'0000001001101', 896:'0000001110010', 960:'0000001110011', 1024:'0000001110100',
            1088:'0000001110101', 1152:'0000001110110', 1216:'0000001110111', 1280:'0000001010010',
            1344:'0000001010011', 1408:'0000001010100', 1472:'0000001010101', 1536:'0000001011010',
            1600:'0000001011011', 1664:'0000001100100', 1728:'0000001100101'
        };

        // Common extended make-up codes (T.4 §4.1.4, run > 1728)
        // Encoded the same for both colours. Run values 1792, 1856, ...
        const COMMON_MAKEUP = {
            1792:'00000001000', 1856:'00000001100', 1920:'00000001101',
            1984:'000000010010', 2048:'000000010011', 2112:'000000010100',
            2176:'000000010101', 2240:'000000010110', 2304:'000000010111',
            2368:'000000011100', 2432:'000000011101', 2496:'000000011110',
            2560:'000000011111'
        };

        // 2D mode codes (T.6, T.4 §4.2)
        // Pass:        '0001'
        // Horizontal:  '001'
        // V0:          '1'
        // VR1: '011'   VL1: '010'
        // VR2: '000011' VL2: '000010'
        // VR3: '0000011' VL3: '0000010'
        // EXT2D:        '0000001'  (uncommon extension)
        const MODE_CODES = {
            '0001': 'P',     // pass
            '001':  'H',     // horizontal
            '1':    'V0',
            '011':  'VR1', '010':  'VL1',
            '000011':'VR2', '000010':'VL2',
            '0000011':'VR3','0000010':'VL3',
            '0000001':'EXT2D'
        };
        const MODE_MAX_LEN = 7;

        // EOL = 000000000001 (12 bits). When followed by a tag bit
        // we read it separately.
        const EOL_BITS = '000000000001';

        // Build reverse maps (string -> { kind, value })
        function buildTermMap(arr, kind) {
            const m = new Map();
            for (let i = 0; i < arr.length; i++) {
                m.set(arr[i], { kind, run: i, terminating: true });
            }
            return m;
        }
        function buildMakeupMap(obj, kind) {
            const m = new Map();
            for (const k of Object.keys(obj)) {
                m.set(obj[k], { kind, run: k | 0, terminating: false });
            }
            return m;
        }
        const WHITE_MAP = new Map([
            ...buildTermMap(WHITE_TERM, 'W'),
            ...buildMakeupMap(WHITE_MAKEUP, 'W'),
            ...buildMakeupMap(COMMON_MAKEUP, 'W')
        ]);
        const BLACK_MAP = new Map([
            ...buildTermMap(BLACK_TERM, 'B'),
            ...buildMakeupMap(BLACK_MAKEUP, 'B'),
            ...buildMakeupMap(COMMON_MAKEUP, 'B')
        ]);
        // Maximum prefix length for run codes (cap by spec)
        const MAX_RUN_BITS = 13;

        // ---------- Bit reader (MSB-first) ----------
        function makeBitReader(bytes) {
            let bytePos = 0;
            let bitPos = 0; // 0 = MSB of current byte
            return {
                readBit() {
                    if (bytePos >= bytes.length) return -1;
                    const b = bytes[bytePos];
                    const bit = (b >>> (7 - bitPos)) & 1;
                    bitPos++;
                    if (bitPos === 8) { bitPos = 0; bytePos++; }
                    return bit;
                },
                alignToByte() {
                    if (bitPos !== 0) { bitPos = 0; bytePos++; }
                },
                eof() { return bytePos >= bytes.length; },
                pos() { return { bytePos, bitPos }; },
                seek(p) { bytePos = p.bytePos; bitPos = p.bitPos; }
            };
        }

        // Read a run code (sequence of white/black, possibly with
        // make-up codes prepended). Returns total run length, or -1 on
        // EOF. Throws on undecodable.
        function readRun(reader, mapFor) {
            let total = 0;
            for (;;) {
                let code = '';
                let entry = null;
                for (let i = 0; i < MAX_RUN_BITS; i++) {
                    const b = reader.readBit();
                    if (b < 0) return -1;
                    code += b;
                    entry = mapFor.get(code);
                    if (entry) break;
                }
                if (!entry) {
                    throw new ParseError('pdf/ccitt/bad-runcode',
                        'unrecognised CCITT run-length code',
                        { context: { bits: code } });
                }
                total += entry.run;
                if (entry.terminating) return total;
                // make-up: continue reading additional codes
            }
        }

        // Read a 2D mode code
        function readMode(reader) {
            let code = '';
            for (let i = 0; i < MODE_MAX_LEN; i++) {
                const b = reader.readBit();
                if (b < 0) return null;
                code += b;
                const m = MODE_CODES[code];
                if (m) return m;
            }
            throw new ParseError('pdf/ccitt/bad-2d-mode',
                'unrecognised CCITT 2D mode code',
                { context: { bits: code } });
        }

        // Try to read EOL (12 bits 0...01). Returns true if consumed.
        function readEolMaybe(reader) {
            const save = reader.pos();
            let zeros = 0;
            // Read up to 24 zero bits then a 1
            for (let i = 0; i < 24; i++) {
                const b = reader.readBit();
                if (b < 0) { reader.seek(save); return false; }
                if (b === 0) { zeros++; continue; }
                if (b === 1 && zeros >= 11) return true;
                reader.seek(save);
                return false;
            }
            reader.seek(save);
            return false;
        }

        // Peek N consecutive EOL codes without consuming. Returns true
        // if N EOLs are present at the current position. Used to detect
        // RTC (G3, 6×EOL) and EOFB (G4, 2×EOL) terminators. Note that
        // readEolMaybe consumes the EOL when present, so we save/restore
        // around the probe.
        function peekEols(reader, n) {
            const save = reader.pos();
            let ok = true;
            for (let k = 0; k < n; k++) {
                if (!readEolMaybe(reader)) { ok = false; break; }
                // For G3-2D / mixed, an EOL may be followed by a tag
                // bit (1 for 1D / 0 for 2D). When probing for RTC we
                // tolerate this since encoder emits tag=1 between RTC
                // EOLs for K>0. We don't consume it here — peekEols is
                // called only with K<0 (EOFB, 2×EOL, no tag) or as a
                // raw pre-check before the per-row EOL reader runs.
            }
            reader.seek(save);
            return ok;
        }

        // Skip to next EOL (used for resync, optional)
        function skipToEol(reader) {
            // Naive: scan bit by bit for 11 zeros then a 1
            let zeros = 0;
            for (;;) {
                const b = reader.readBit();
                if (b < 0) return false;
                if (b === 0) { zeros++; continue; }
                if (b === 1 && zeros >= 11) return true;
                zeros = 0;
            }
        }

        // ---------- Line decoders ----------

        // Decode one 1D-coded line into a Uint8Array of length Columns
        // (each cell 0 = white, 1 = black). Starts with WHITE run.
        function decode1DLine(reader, columns) {
            const line = new Uint8Array(columns);
            let pos = 0;
            let colour = 0; // 0=white, 1=black
            while (pos < columns) {
                const run = readRun(reader, colour === 0 ? WHITE_MAP : BLACK_MAP);
                if (run < 0) return null;
                const end = Math.min(pos + run, columns);
                if (colour === 1) {
                    for (let i = pos; i < end; i++) line[i] = 1;
                }
                pos = end;
                colour ^= 1;
            }
            return line;
        }

        // Decode one 2D-coded line given the reference (previous) line.
        // T.6 / T.4-2D state-machine.
        function decode2DLine(reader, refLine, columns) {
            const line = new Uint8Array(columns);
            let a0 = -1; // position of last colour change (start at imaginary -1, white)
            let a0Colour = 0; // 0 = white
            while (a0 < columns) {
                // b1 = first changing element on ref line right of a0 of
                // opposite colour to a0
                const b1 = findB1(refLine, a0, a0Colour, columns);
                const b2 = findNextChange(refLine, b1, columns);

                const mode = readMode(reader);
                if (mode === null) return null;

                if (mode === 'P') {
                    // Pass: paint from a0 (or 0) up to b2 with a0Colour
                    const start = a0 < 0 ? 0 : a0;
                    paint(line, start, b2, a0Colour);
                    a0 = b2;
                    // colour unchanged
                } else if (mode === 'H') {
                    // Horizontal: two runs of a0Colour then opposite
                    const r1 = readRun(reader, a0Colour === 0 ? WHITE_MAP : BLACK_MAP);
                    const r2 = readRun(reader, a0Colour === 0 ? BLACK_MAP : WHITE_MAP);
                    if (r1 < 0 || r2 < 0) return null;
                    const start = a0 < 0 ? 0 : a0;
                    paint(line, start, Math.min(start + r1, columns), a0Colour);
                    paint(line, Math.min(start + r1, columns),
                          Math.min(start + r1 + r2, columns), a0Colour ^ 1);
                    a0 = start + r1 + r2;
                    // a0Colour unchanged (two flips)
                } else {
                    // Vertical V0, VR1..3, VL1..3
                    let offset;
                    if (mode === 'V0') offset = 0;
                    else if (mode === 'VR1') offset = 1;
                    else if (mode === 'VR2') offset = 2;
                    else if (mode === 'VR3') offset = 3;
                    else if (mode === 'VL1') offset = -1;
                    else if (mode === 'VL2') offset = -2;
                    else if (mode === 'VL3') offset = -3;
                    else {
                        throw new ParseError('pdf/ccitt/unsupported-2d-mode',
                            'unsupported 2D mode',
                            { context: { mode } });
                    }
                    const a1 = b1 + offset;
                    const start = a0 < 0 ? 0 : a0;
                    paint(line, start, Math.min(Math.max(a1, 0), columns), a0Colour);
                    a0 = a1;
                    a0Colour ^= 1;
                }
            }
            return line;
        }

        function paint(line, from, to, colour) {
            if (colour === 0) return;
            const a = Math.max(0, from);
            const b = Math.min(line.length, to);
            for (let i = a; i < b; i++) line[i] = 1;
        }

        function colourAt(refLine, pos) {
            if (pos < 0 || pos >= refLine.length) return 0;
            return refLine[pos];
        }

        // b1 = first changing element to the right of a0 on the
        // reference line whose colour is opposite to a0Colour.
        function findB1(refLine, a0, a0Colour, columns) {
            // Spec: a0 is imaginary at -1, treated as white (0).
            // Scan from a0+1.
            let start = a0 < 0 ? 0 : a0 + 1;
            // Skip same-colour-as-a0Colour first
            let prev = a0 < 0 ? 0 : colourAt(refLine, a0);
            // Walk to first changing element of opposite colour to a0
            for (let i = start; i < columns; i++) {
                const c = refLine[i];
                if (c !== prev) {
                    // changing element; if colour == opposite of a0Colour, this is b1
                    if (c !== a0Colour) return i;
                    prev = c;
                }
            }
            return columns;
        }

        function findNextChange(refLine, from, columns) {
            if (from >= columns) return columns;
            const start = Math.max(0, from);
            const cur = start < columns ? refLine[start] : 0;
            for (let i = start + 1; i < columns; i++) {
                if (refLine[i] !== cur) return i;
            }
            return columns;
        }

        // ---------- Public decode ----------

        function packBits(line, polarityInvert) {
            // line[i] = 1 (black) or 0 (white)
            // Output: MSB-first packed. By default PDF: 0=white, 1=black? No:
            // CCITTFaxDecode default /BlackIs1 = false → 1 = white (per PDF spec).
            // Our line uses 1=black. So output bit = polarityInvert ? sameAsLine : !line[i]
            // If BlackIs1 is true → output bit = line[i] (black=1).
            // If BlackIs1 is false → output bit = !line[i] (white=1).
            const n = line.length;
            const out = new Uint8Array((n + 7) >>> 3);
            for (let i = 0; i < n; i++) {
                const bit = polarityInvert ? line[i] : (line[i] ^ 1);
                if (bit) out[i >>> 3] |= 1 << (7 - (i & 7));
            }
            return out;
        }

        function decode(bytes, parms) {
            if (!(bytes instanceof Uint8Array)) {
                throw new ParseError('pdf/ccitt/bad-input',
                    'CCITT input must be Uint8Array');
            }
            const columns = parms.Columns | 0;
            if (columns <= 0 || columns > 65535) {
                throw new ParseError('pdf/ccitt/bad-columns',
                    'CCITT /Columns out of range',
                    { context: { columns } });
            }
            const rows = parms.Rows | 0; // 0 = unlimited
            const K = parms.K | 0;
            const reader = makeBitReader(bytes);
            const lines = [];
            // Reference line for 2D modes: all-white initial line
            let refLine = new Uint8Array(columns);

            // EOL handling helpers
            function expectEolMaybe() {
                if (parms.EndOfLine) {
                    // Must see EOL
                    if (!readEolMaybe(reader)) {
                        // try resync
                        if (!skipToEol(reader)) return false;
                    }
                    return true;
                }
                // Optional EOL: peek and consume if present
                readEolMaybe(reader);
                return true;
            }

            function alignMaybe() {
                if (parms.EncodedByteAlign) reader.alignToByte();
            }

            // For K>0 we cycle: each K-row block, the first row is 1D
            // (after EOL+tag=1) and the next K-1 are 2D (EOL+tag=0).
            // For K==0: all rows 1D, optional EOL between them.
            // For K<0 (G4/T.6): all rows 2D, no per-line EOL inside the
            // stream; only an optional RTC at the end.

            let rowIndex = 0;
            let kPhase = 0; // 0..K-1 within mixed block

            try {
                while (rows === 0 || rowIndex < rows) {
                    alignMaybe();
                    // RTC / EOFB detection: before reading the next row,
                    // peek for back-to-back EOL codes. 2 consecutive EOLs
                    // signal end-of-block (RTC head for G3, EOFB for G4).
                    if (K < 0) {
                        // G4 EOFB: 2 EOL codes. Probe with peekEols(2).
                        if (peekEols(reader, 2)) break;
                    } else if (K > 0 || parms.EndOfLine) {
                        // G3 1D/mixed RTC: pattern is EOL[+tag] x6.
                        // Detecting 2 stacked EOLs is sufficient and
                        // unambiguous: a normal row never produces a
                        // valid EOL bit pattern at its start. Only
                        // probe when EOLs are expected in the stream.
                        const sv = reader.pos();
                        if (readEolMaybe(reader)) {
                            // For K>0 a tag bit follows; skip it before
                            // probing the next EOL.
                            if (K > 0) {
                                const t = reader.readBit();
                                if (t < 0) { reader.seek(sv); break; }
                            }
                            const isRtc = readEolMaybe(reader);
                            reader.seek(sv);
                            if (isRtc) break;
                        } else {
                            reader.seek(sv);
                        }
                    }
                    let is2D;
                    if (K < 0) {
                        is2D = true;
                    } else if (K === 0) {
                        is2D = false;
                        if (parms.EndOfLine) {
                            if (!expectEolMaybe()) break;
                        } else {
                            readEolMaybe(reader);
                        }
                    } else {
                        // K > 0 mixed
                        if (kPhase === 0) {
                            // Expect EOL + tag bit (1 → 1D)
                            if (parms.EndOfLine) {
                                if (!expectEolMaybe()) break;
                                const tag = reader.readBit();
                                if (tag < 0) break;
                                is2D = (tag === 0);
                            } else {
                                readEolMaybe(reader);
                                const tag = reader.readBit();
                                if (tag < 0) break;
                                is2D = (tag === 0);
                            }
                        } else {
                            if (parms.EndOfLine) {
                                if (!expectEolMaybe()) break;
                                const tag = reader.readBit();
                                if (tag < 0) break;
                                is2D = (tag === 0);
                            } else {
                                readEolMaybe(reader);
                                const tag = reader.readBit();
                                if (tag < 0) break;
                                is2D = (tag === 0);
                            }
                        }
                    }

                    let line;
                    if (is2D) {
                        line = decode2DLine(reader, refLine, columns);
                    } else {
                        line = decode1DLine(reader, columns);
                    }
                    if (line === null) {
                        if (rows === 0) break;
                        if ((parms.DamagedRowsBeforeError | 0) > 0) {
                            // Tolerate: emit blank row
                            line = new Uint8Array(columns);
                        } else {
                            throw new ParseError('pdf/ccitt/truncated',
                                'CCITT stream truncated mid-line',
                                { context: { row: rowIndex } });
                        }
                    }
                    lines.push(line);
                    refLine = line;
                    rowIndex++;
                    if (K > 0) kPhase = (kPhase + 1) % K;
                    if (reader.eof()) break;
                }
            } catch (e) {
                if (e instanceof ParseError) throw e;
                throw new ParseError('pdf/ccitt/decode-failed',
                    'CCITT decoder error: ' + e.message,
                    { cause: e });
            }

            // Pack lines into a single Uint8Array. Each line is padded
            // to byte boundary independently (standard PDF image data).
            const polarityInvert = !!parms.BlackIs1;
            const rowBytes = (columns + 7) >>> 3;
            const out = new Uint8Array(rowBytes * lines.length);
            for (let r = 0; r < lines.length; r++) {
                const packed = packBits(lines[r], polarityInvert);
                out.set(packed, r * rowBytes);
            }
            return out;
        }

        // ---------- Encode helpers (bit writer) ----------
        // Production-grade T.4/T.6 encoder: greedy make-up choice,
        // EncodedByteAlign padding, RTC (G3) / EOFB (G4), full 2D
        // state machine.
        function makeBitWriter() {
            const bytes = [];
            let cur = 0, n = 0;
            function writeBit(b) {
                cur = (cur << 1) | (b & 1);
                n++;
                if (n === 8) { bytes.push(cur & 0xFF); cur = 0; n = 0; }
            }
            function writeBits(s) {
                for (let i = 0; i < s.length; i++) writeBit(s.charCodeAt(i) - 48);
            }
            function alignToByte() {
                while (n !== 0) writeBit(0);
            }
            function flush() {
                if (n > 0) {
                    cur <<= (8 - n);
                    bytes.push(cur & 0xFF);
                    cur = 0; n = 0;
                }
                return new Uint8Array(bytes);
            }
            function bitCount() { return bytes.length * 8 + n; }
            return { writeBit, writeBits, alignToByte, flush, bitCount };
        }

        // Pre-sorted make-up run lengths (descending) for greedy lookup.
        const WHITE_MAKEUP_KEYS = Object.keys(WHITE_MAKEUP)
            .map((k) => k | 0)
            .sort((a, b) => b - a);
        const BLACK_MAKEUP_KEYS = Object.keys(BLACK_MAKEUP)
            .map((k) => k | 0)
            .sort((a, b) => b - a);
        const COMMON_MAKEUP_KEYS = Object.keys(COMMON_MAKEUP)
            .map((k) => k | 0)
            .sort((a, b) => b - a);
        const COMMON_MAKEUP_MAX = COMMON_MAKEUP_KEYS[0]; // 2560

        // Lookup code for a run length / colour (returns string of bits).
        // Greedy: at each step emit the largest make-up code <= remaining
        // run. Cycles 2560 codes for very large runs.
        function codeForRun(run, colour) {
            const term = colour === 0 ? WHITE_TERM : BLACK_TERM;
            const make = colour === 0 ? WHITE_MAKEUP : BLACK_MAKEUP;
            const makeKeys = colour === 0 ? WHITE_MAKEUP_KEYS : BLACK_MAKEUP_KEYS;
            let bits = '';
            // Runs >= 2624: emit 2560 chunks first
            while (run >= COMMON_MAKEUP_MAX + 64) {
                bits += COMMON_MAKEUP[COMMON_MAKEUP_MAX];
                run -= COMMON_MAKEUP_MAX;
            }
            // Runs in [1792, 2624): pick largest extended make-up <= run
            if (run >= 1792) {
                for (let i = 0; i < COMMON_MAKEUP_KEYS.length; i++) {
                    const v = COMMON_MAKEUP_KEYS[i];
                    if (v <= run) {
                        bits += COMMON_MAKEUP[v];
                        run -= v;
                        break;
                    }
                }
            }
            // Runs in [64, 1728]: pick largest colour make-up <= run
            if (run >= 64) {
                for (let i = 0; i < makeKeys.length; i++) {
                    const v = makeKeys[i];
                    if (v <= run) {
                        bits += make[v];
                        run -= v;
                        break;
                    }
                }
            }
            // Terminating
            bits += term[run];
            return bits;
        }

        // Encode a single line in 1D coding (white run first)
        function encode1DLine(line, columns, writer) {
            let pos = 0;
            let colour = 0;
            while (pos < columns) {
                let run = 0;
                while (pos + run < columns && (line[pos + run] | 0) === colour) run++;
                writer.writeBits(codeForRun(run, colour));
                pos += run;
                colour ^= 1;
            }
        }

        // Encode a line in 2D mode using simple algorithm
        function encode2DLine(line, refLine, columns, writer) {
            let a0 = -1;
            let a0Colour = 0;
            while (a0 < columns) {
                // Find a1: next changing element on coding line right of a0
                const a1 = findChangeFrom(line, a0, a0Colour, columns);
                const b1 = findB1(refLine, a0, a0Colour, columns);
                const b2 = findNextChange(refLine, b1, columns);

                if (b2 < a1) {
                    // Pass mode
                    writer.writeBits('0001');
                    a0 = b2;
                    // colour unchanged
                } else {
                    const diff = a1 - b1;
                    if (diff >= -3 && diff <= 3) {
                        // Vertical
                        if (diff === 0) writer.writeBits('1');
                        else if (diff === 1) writer.writeBits('011');
                        else if (diff === 2) writer.writeBits('000011');
                        else if (diff === 3) writer.writeBits('0000011');
                        else if (diff === -1) writer.writeBits('010');
                        else if (diff === -2) writer.writeBits('000010');
                        else if (diff === -3) writer.writeBits('0000010');
                        a0 = a1;
                        a0Colour ^= 1;
                    } else {
                        // Horizontal
                        const a2 = findChangeFrom(line, a1, a0Colour ^ 1, columns);
                        const r1 = a1 - (a0 < 0 ? 0 : a0);
                        const r2 = a2 - a1;
                        writer.writeBits('001');
                        writer.writeBits(codeForRun(r1, a0Colour));
                        writer.writeBits(codeForRun(r2, a0Colour ^ 1));
                        a0 = a2;
                        // colour unchanged
                    }
                }
            }
        }

        function findChangeFrom(line, a0, a0Colour, columns) {
            const start = a0 < 0 ? 0 : a0 + 1;
            // We want the first position where colour changes to opposite of a0Colour
            let prev = a0 < 0 ? 0 : (line[a0] | 0);
            for (let i = start; i < columns; i++) {
                const c = line[i] | 0;
                if (c !== prev) {
                    if (c !== a0Colour) return i;
                    prev = c;
                }
            }
            return columns;
        }

        function encode(lines, parms) {
            const columns = (parms && parms.Columns) | 0 || 1728;
            const K = parms && parms.K != null ? parms.K | 0 : 0;
            const endOfLine = !!(parms && parms.EndOfLine);
            const byteAlign = !!(parms && parms.EncodedByteAlign);
            // EndOfBlock defaults to true per PDF spec.
            const endOfBlock = !parms || parms.EndOfBlock !== false;
            // G3 mixed (K>0) per T.4 always uses EOL between lines.
            const writeEol = endOfLine || K > 0;

            const writer = makeBitWriter();
            let refLine = new Uint8Array(columns);
            for (let r = 0; r < lines.length; r++) {
                const line = lines[r];
                if (byteAlign) writer.alignToByte();
                if (writeEol) {
                    writer.writeBits(EOL_BITS);
                    if (K > 0) {
                        // tag bit: 1 = 1D, 0 = 2D — first row of each K-block is 1D
                        const is1D = (r % K) === 0;
                        writer.writeBit(is1D ? 1 : 0);
                        if (is1D) encode1DLine(line, columns, writer);
                        else encode2DLine(line, refLine, columns, writer);
                    } else if (K === 0) {
                        encode1DLine(line, columns, writer);
                    } else {
                        encode2DLine(line, refLine, columns, writer);
                    }
                } else {
                    if (K < 0) encode2DLine(line, refLine, columns, writer);
                    else encode1DLine(line, columns, writer);
                }
                refLine = line;
            }
            // RTC / EOFB terminator
            if (endOfBlock) {
                if (K < 0) {
                    // G4 EOFB: two consecutive EOL codes (000000000001 000000000001)
                    if (byteAlign) writer.alignToByte();
                    writer.writeBits(EOL_BITS);
                    writer.writeBits(EOL_BITS);
                } else if (writeEol) {
                    // G3 RTC: 6 consecutive EOL codes (only when EOL was used)
                    if (byteAlign) writer.alignToByte();
                    for (let i = 0; i < 6; i++) {
                        writer.writeBits(EOL_BITS);
                        if (K > 0) writer.writeBit(1); // tag bit must follow EOL in G3-2D
                    }
                }
            }
            return writer.flush();
        }

        return {
            decode,
            encode,
            // exported for tests / introspection
            _internals: {
                WHITE_MAP, BLACK_MAP, MODE_CODES, EOL_BITS,
                codeForRun, encode1DLine, encode2DLine,
                decode1DLine, decode2DLine,
                makeBitReader, makeBitWriter,
                findB1, findNextChange, findChangeFrom
            }
        };
    }
};
