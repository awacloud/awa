// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfByteRange } from './byteRange.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const {
    computeByteRange, extractSignedBytes, findContentsField, auditByteRange
} = pdfByteRange.factory(_errors);
function makeDoc() {
    // 100-byte buffer. /Contents <AABBCCDD> sits inside an indirect
    // signature object. We embed the literal sequence so findContentsField
    // can locate it.
    const text = '1 0 obj <</Type /Sig /Contents <AABBCC> /Reason (x)>> endobj';
    const bytes = new Uint8Array(100);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    return { bytes, text };
}

describe('computeByteRange', () => {
    test('returns canonical [0, off, end, tail]', () => {
        const doc = new Uint8Array(100);
        const br = computeByteRange(doc, 32, 16);
        expect(br).toEqual([0, 32, 48, 52]);
    });

    test('rejects bad inputs', () => {
        expect(() => computeByteRange('x', 0, 0)).toThrow(ParseError);
        expect(() => computeByteRange(new Uint8Array(10), -1, 0))
            .toThrow(ParseError);
        expect(() => computeByteRange(new Uint8Array(10), 5, 99))
            .toThrow(ParseError);
    });
});

describe('extractSignedBytes', () => {
    test('concatenates two slices', () => {
        const doc = new Uint8Array(20);
        for (let i = 0; i < 20; i++) doc[i] = i;
        const out = extractSignedBytes(doc, [0, 5, 10, 5]);
        expect(Array.from(out)).toEqual([0, 1, 2, 3, 4, 10, 11, 12, 13, 14]);
    });

    test('rejects inconsistent byteRange', () => {
        expect(() => extractSignedBytes(new Uint8Array(10), [0, 5, 3, 5]))
            .toThrow(ParseError);
    });

    test('rejects bad shape', () => {
        expect(() => extractSignedBytes(new Uint8Array(10), [0, 1, 2]))
            .toThrow(ParseError);
    });
});

describe('findContentsField', () => {
    test('locates /Contents hex literal payload', () => {
        const { bytes, text } = makeDoc();
        const r = findContentsField(bytes, 0);
        const startInText = text.indexOf('<', text.indexOf('/Contents'));
        const expectedOffset = startInText + 1;
        const expectedLen = text.indexOf('>', startInText) - startInText - 1;
        expect(r.offset).toBe(expectedOffset);
        expect(r.length).toBe(expectedLen);
    });

    test('throws when /Contents key absent', () => {
        const bytes = new Uint8Array(50);
        const text = '1 0 obj <</Reason (x)>> endobj';
        for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
        expect(() => findContentsField(bytes, 0)).toThrow(ParseError);
    });

    test('throws when /Contents is not a hex literal', () => {
        const text = '1 0 obj <</Contents (oops)>> endobj';
        const bytes = new Uint8Array(60);
        for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
        expect(() => findContentsField(bytes, 0)).toThrow(ParseError);
    });

    test('rejects out-of-range offset', () => {
        expect(() => findContentsField(new Uint8Array(10), 99))
            .toThrow(ParseError);
    });
});

describe('auditByteRange', () => {
    test('returns ok for a canonical [0, off, end, tail] range', () => {
        const doc = new Uint8Array(100);
        const br = [0, 32, 48, 52];     // gap = [32, 48), 16 bytes
        const r = auditByteRange(doc, br);
        expect(r.ok).toBe(true);
        expect(r.issues).toEqual([]);
    });

    test('flags self-overlap', () => {
        const doc = new Uint8Array(100);
        const r = auditByteRange(doc, [0, 40, 30, 50]);
        const codes = r.issues.map((i) => i.code);
        expect(codes).toContain('pdf/sig/byterange/self-overlap');
        expect(r.ok).toBe(false);
    });

    test('flags out-of-bounds', () => {
        const doc = new Uint8Array(50);
        const r = auditByteRange(doc, [0, 10, 20, 200]);
        const codes = r.issues.map((i) => i.code);
        expect(codes).toContain('pdf/sig/byterange/out-of-bounds');
    });

    test('flags non-zero start', () => {
        const doc = new Uint8Array(100);
        const r = auditByteRange(doc, [5, 20, 30, 60]);
        const codes = r.issues.map((i) => i.code);
        expect(codes).toContain('pdf/sig/byterange/non-zero-start');
    });

    test('flags gap mismatch when /Contents bounds do not align', () => {
        const doc = new Uint8Array(100);
        // ByteRange says first range ends at 30 and second starts at 60
        // — so gap is [30, 60). Pretend /Contents hex literal sits at
        // bytes [40, 50): expected gap is [39, 51), so 30 ≠ 39 and 60 ≠ 51.
        const r = auditByteRange(doc, [0, 30, 60, 40], {
            contents: { offset: 40, length: 10 }
        });
        const codes = r.issues.map((i) => i.code);
        expect(codes).toContain('pdf/sig/byterange/gap-start-mismatch');
        expect(codes).toContain('pdf/sig/byterange/gap-end-mismatch');
    });

    test('flags cross-overlap with another ByteRange', () => {
        const doc = new Uint8Array(200);
        const r = auditByteRange(doc, [0, 50, 100, 100], {
            others: [[0, 30, 80, 120]]    // second range [80,200) overlaps [100,200)
        });
        const codes = r.issues.map((i) => i.code);
        expect(codes).toContain('pdf/sig/byterange/cross-overlap');
    });

    test('flags incomplete coverage when requested', () => {
        const doc = new Uint8Array(100);
        const r = auditByteRange(doc, [0, 30, 60, 30], {
            requireFullCoverage: true
        });
        const codes = r.issues.map((i) => i.code);
        expect(codes).toContain('pdf/sig/byterange/incomplete-coverage');
    });

    test('rejects bad shape', () => {
        expect(() => auditByteRange(new Uint8Array(10), [0, 1]))
            .toThrow(ParseError);
    });

    test('two consecutive incremental signatures pass cross-overlap check',
        () => {
            // Document with two incremental signatures :
            //   sig1 covers [0, 50) + [70, 200)
            //   sig2 (added later) covers [0, 150) + [170, 200)
            // — these are *legitimately* overlapping per spec : sig2's
            // first range covers sig1's /Contents region (because sig2 was
            // applied after sig1 was sealed). The audit must surface this
            // overlap so the consumer can decide.
            const doc = new Uint8Array(200);
            const br1 = [0, 50, 70, 130];
            const br2 = [0, 150, 170, 30];
            const r = auditByteRange(doc, br2, { others: [br1] });
            const codes = r.issues.map((i) => i.code);
            expect(codes).toContain('pdf/sig/byterange/cross-overlap');
        });

    test('two non-overlapping signatures pass without cross-overlap', () => {
        // Two signatures whose covered ranges are entirely disjoint —
        // physically impossible per PDF spec (both must cover the file
        // up to their respective /Contents) but useful as a sanity
        // check that the overlap detector does not over-flag.
        const doc = new Uint8Array(400);
        const br1 = [0, 50, 70, 30];          // first signature covers [0,50)+[70,100)
        const br2 = [200, 50, 270, 30];       // disjoint
        const r = auditByteRange(doc, br2, { others: [br1] });
        const codes = r.issues.map((i) => i.code);
        expect(codes).not.toContain('pdf/sig/byterange/cross-overlap');
    });
});

// ── /ByteRange gap forms (BL-1605, office/BATCH_44/03) ────────────────
//
// ISO 32000-2 §12.8.3.3.1: `/Contents` "shall fit precisely in the space
// between the ranges specified by ByteRange" — the gap is the whole `<…>`
// token (form b, what PDFBox and pyHanko emit and check). Signatures
// emitted before BL-1605 left only the hex digits out (form a). The audit
// accepts exactly those two gaps, says which one it found in `gapForm`,
// and refuses every other gap with the gap-start/gap-end codes.
function makeSigDoc() {
    const text = '1 0 obj <</Type /Sig /ByteRange [0 0 0 0] '
        + '/Contents <AABBCC> /Reason (x)>> endobj\n';
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    const digits = findContentsField(bytes, 0);   // hex digits only
    return { bytes, total: bytes.length, off: digits.offset, len: digits.length, digits };
}

/** `[0, gapStart, gapEnd, total - gapEnd]` — the gap is `[gapStart, gapEnd)`. */
function rangeWithGap(total, gapStart, gapEnd) {
    return [0, gapStart, gapEnd, total - gapEnd];
}

describe('auditByteRange — the two accepted gap forms (BL-1605)', () => {
    test('form (a): a gap of exactly the hex digits is accepted, gapForm "digits"', () => {
        const { bytes, total, off, len, digits } = makeSigDoc();
        const r = auditByteRange(bytes, rangeWithGap(total, off, off + len), {
            contents: digits, requireFullCoverage: true
        });
        expect(r.issues).toEqual([]);
        expect(r.ok).toBe(true);
        expect(r.gapForm).toBe('digits');
    });

    test('form (b): a gap of exactly the whole <…> token is accepted, gapForm "token"', () => {
        const { bytes, total, off, len, digits } = makeSigDoc();
        expect(bytes[off - 1]).toBe(0x3C);          // '<'
        expect(bytes[off + len]).toBe(0x3E);        // '>'
        const r = auditByteRange(bytes, rangeWithGap(total, off - 1, off + len + 1), {
            contents: digits, requireFullCoverage: true
        });
        expect(r.issues).toEqual([]);
        expect(r.ok).toBe(true);
        expect(r.gapForm).toBe('token');
    });

    test('gapForm is null when no /Contents span is given', () => {
        const r = auditByteRange(new Uint8Array(100), [0, 32, 48, 52]);
        expect(r.ok).toBe(true);
        expect(r.gapForm).toBe(null);
    });

    test('every gap one byte short or long at either end is refused', () => {
        const { bytes, total, off, len, digits } = makeSigDoc();
        const accepted = new Set([`${off - 1}:${off + len + 1}`, `${off}:${off + len}`]);
        let refused = 0;
        for (const s of [off - 2, off - 1, off, off + 1]) {
            for (const e of [off + len - 1, off + len, off + len + 1, off + len + 2]) {
                if (accepted.has(`${s}:${e}`)) continue;
                const r = auditByteRange(bytes, rangeWithGap(total, s, e), { contents: digits });
                const codes = r.issues.map((i) => i.code);
                expect(r.ok).toBe(false);
                expect(r.gapForm).toBe(null);
                // The existing codes, measured against the token (form b)
                // bounds, exactly as before BL-1605.
                expect(codes.includes('pdf/sig/byterange/gap-start-mismatch'))
                    .toBe(s !== off - 1);
                expect(codes.includes('pdf/sig/byterange/gap-end-mismatch'))
                    .toBe(e !== off + len + 1);
                refused++;
            }
        }
        expect(refused).toBe(14);
    });

    test('a gap covering only "<" is refused (gap-end-mismatch)', () => {
        const { bytes, total, off, digits } = makeSigDoc();
        const r = auditByteRange(bytes, rangeWithGap(total, off - 1, off), { contents: digits });
        expect(r.ok).toBe(false);
        expect(r.gapForm).toBe(null);
        expect(r.issues.map((i) => i.code)).toEqual(['pdf/sig/byterange/gap-end-mismatch']);
    });

    test('a gap covering only ">" is refused (gap-start-mismatch)', () => {
        const { bytes, total, off, len, digits } = makeSigDoc();
        const r = auditByteRange(bytes, rangeWithGap(total, off + len, off + len + 1),
            { contents: digits });
        expect(r.ok).toBe(false);
        expect(r.gapForm).toBe(null);
        expect(r.issues.map((i) => i.code)).toEqual(['pdf/sig/byterange/gap-start-mismatch']);
    });

    test('an accepted gap form does not mask another issue', () => {
        const { bytes, total, off, len, digits } = makeSigDoc();
        const br = rangeWithGap(total, off - 1, off + len + 1);
        br[3] -= 1;                                  // stop one byte short of EOF
        const r = auditByteRange(bytes, br, { contents: digits, requireFullCoverage: true });
        expect(r.gapForm).toBe('token');
        expect(r.ok).toBe(false);
        expect(r.issues.map((i) => i.code)).toEqual(['pdf/sig/byterange/incomplete-coverage']);
    });
});

describe('computeByteRange — token span from the caller (BL-1605)', () => {
    test('opts.token makes the gap the whole <…> token (form b)', () => {
        const { bytes, total, off, len } = makeSigDoc();
        const br = computeByteRange(bytes, off, len, { token: { offset: off - 1, length: len + 2 } });
        expect(br).toEqual([0, off - 1, off + len + 1, total - (off + len + 1)]);
        expect(auditByteRange(bytes, br, { contents: findContentsField(bytes, 0) }).gapForm)
            .toBe('token');
    });

    test('without opts the gap stays the span given (backward compatible)', () => {
        const { bytes, total, off, len } = makeSigDoc();
        expect(computeByteRange(bytes, off, len)).toEqual([0, off, off + len, total - (off + len)]);
    });

    test('refuses a token span that does not enclose the digits by exactly "<" and ">"', () => {
        const { bytes, off, len } = makeSigDoc();
        const bad = [
            { offset: off - 2, length: len + 3 },    // one byte too early
            { offset: off - 1, length: len + 1 },    // stops before '>'
            { offset: off, length: len + 2 },        // starts on a digit
            { offset: off - 1, length: len + 3 }     // one byte past '>'
        ];
        for (const token of bad) {
            let caught = null;
            try { computeByteRange(bytes, off, len, { token }); } catch (e) { caught = e; }
            expect(caught).toBeInstanceOf(ParseError);
            expect(caught.code).toBe('pdf/sig/byterange/bad-token');
        }
        // Right bounds, wrong delimiter bytes.
        const copy = bytes.slice();
        copy[off - 1] = 0x28;                        // '(' instead of '<'
        let caught = null;
        try {
            computeByteRange(copy, off, len, { token: { offset: off - 1, length: len + 2 } });
        } catch (e) { caught = e; }
        expect(caught && caught.code).toBe('pdf/sig/byterange/bad-token');
    });
});

describe('pdfByteRange factory', () => {
    test('factory.toString() contains "function"', () => {
        expect(pdfByteRange.factory.toString()).toContain('function');
    });

    test('factory returns expected API', () => {
        const api = pdfByteRange.factory(_pdfErrors_TD1);
        expect(typeof api.computeByteRange).toBe('function');
        expect(typeof api.extractSignedBytes).toBe('function');
        expect(typeof api.findContentsField).toBe('function');
        expect(typeof api.auditByteRange).toBe('function');
    });

    test('declares no fw deps', () => {
        expect(pdfByteRange.dependencies).toEqual(['pdfErrors']);
    });
});
