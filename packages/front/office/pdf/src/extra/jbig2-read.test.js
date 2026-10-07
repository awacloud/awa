// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
import { pdfJbig2Read } from './jbig2-read.js';

const m = pdfJbig2Read.factory(_pdfErrors_TD1);

// Helper: assemble a minimal segment header.
//   segNum (4) | flags (1) | refCount byte (1) | retention bytes (1) |
//   page-assoc (1) | dataLength (4)  =  12 bytes
// Then `dataLength` data bytes (set to 0).
function makeSegment({ segNum, type, dataLength = 0 }) {
    const headerBytes = 12;
    const buf = new Uint8Array(headerBytes + dataLength);
    // segNum BE
    buf[0] = (segNum >>> 24) & 0xFF;
    buf[1] = (segNum >>> 16) & 0xFF;
    buf[2] = (segNum >>>  8) & 0xFF;
    buf[3] = (segNum >>>  0) & 0xFF;
    buf[4] = type & 0x3F; // flags = type, no retention bits
    buf[5] = 0;           // refCount field: top 3 bits = count (0)
    buf[6] = 0;           // retention byte
    buf[7] = 1;           // page association
    // dataLength BE
    buf[8]  = (dataLength >>> 24) & 0xFF;
    buf[9]  = (dataLength >>> 16) & 0xFF;
    buf[10] = (dataLength >>>  8) & 0xFF;
    buf[11] = (dataLength >>>  0) & 0xFF;
    return buf;
}

function concat(...arrs) {
    let n = 0;
    for (const a of arrs) n += a.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const a of arrs) { out.set(a, o); o += a.length; }
    return out;
}

describe('extra/jbig2-read', () => {
    test('parses single immediateGenericRegion segment', () => {
        const bytes = makeSegment({ segNum: 0, type: 38, dataLength: 0 });
        const segs = m.parseSegments(bytes);
        expect(segs.length).toBe(1);
        expect(segs[0].segmentNumber).toBe(0);
        expect(segs[0].typeName).toBe('immediateGenericRegion');
        expect(segs[0].dataLength).toBe(0);
    });

    test('walks multiple segments and stops at endOfFile', () => {
        const a = makeSegment({ segNum: 0, type: 38, dataLength: 3 });
        a[12] = 1; a[13] = 2; a[14] = 3;
        const b = makeSegment({ segNum: 1, type: 51, dataLength: 0 }); // EOF
        const c = makeSegment({ segNum: 2, type: 38, dataLength: 0 }); // after EOF — should be ignored
        const all = concat(a, b, c);
        const segs = m.parseSegments(all);
        expect(segs.length).toBe(2);
        expect(segs[1].typeName).toBe('endOfFile');
    });

    test('enumerateGenericRegions filters by type', () => {
        const a = makeSegment({ segNum: 0, type: 0,  dataLength: 0 }); // symbol dict
        const b = makeSegment({ segNum: 1, type: 38, dataLength: 0 });
        const c = makeSegment({ segNum: 2, type: 39, dataLength: 0 });
        const generics = m.enumerateGenericRegions(concat(a, b, c));
        expect(generics.length).toBe(2);
        expect(generics.map(s => s.segmentNumber)).toEqual([1, 2]);
    });

    test('unknown type surfaces "unknown" name', () => {
        const bytes = makeSegment({ segNum: 0, type: 5, dataLength: 0 });
        const segs = m.parseSegments(bytes);
        expect(segs[0].typeName).toBe('unknown');
    });

    test('rejects non-Uint8Array', () => {
        expect(() => m.parseSegments('xx')).toThrow(ParseError);
    });

    test('rejects truncated data', () => {
        const bytes = makeSegment({ segNum: 0, type: 38, dataLength: 5 });
        // Truncate so data doesn't fit.
        const bad = bytes.subarray(0, 12 + 2);
        expect(() => m.parseSegments(bad)).toThrow(ParseError);
    });

    test('decode is documented not-implemented', () => {
        let err;
        try { m.decode(new Uint8Array(0)); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(ParseError);
        expect(err.code).toBe('pdf/jbig2/not-implemented');
    });

    test('STATUS is partial', () => {
        expect(m.STATUS).toContain('partial');
    });

    test('factory shape', () => {
        expect(pdfJbig2Read.name).toBe('pdfJbig2Read');
        expect(pdfJbig2Read.dependencies).toEqual(['pdfErrors']);
        expect(pdfJbig2Read.factory.toString()).toContain('function');
    });
});
