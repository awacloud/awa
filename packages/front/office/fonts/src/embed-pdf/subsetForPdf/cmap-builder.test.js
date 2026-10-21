// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { testRuntime as _embedRt } from '../_test-runtime.js';
import { testRuntime as _rootRt } from '../../_test-runtime.js';

const { buildCmapFormat4 } = _embedRt.resolve('embedCmapBuilder');
const { parseCmap } = _rootRt.resolve('tableCmap');

/** `n` code points that each make their own segment (gaps in both the code points and the gids). */
const disjoint = (n) => new Map(Array.from({ length: n }, (_, i) => [0x41 + 2 * i, 1 + 2 * i]));

/** The format-4 subtable header of a built table (it starts at byte 12). */
function header(bytes) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const at = (o) => v.getUint16(12 + o);
    return { format: at(0), length: at(2), segCountX2: at(6), searchRange: at(8), entrySelector: at(10), rangeShift: at(12) };
}

describe('embedCmapBuilder — format 4 binary-search fields', () => {
    // segCount counts the 0xFFFF terminator segment.
    const CASES = [
        [0, 1, 2, 0, 0],
        [1, 2, 4, 1, 0],
        [2, 3, 4, 1, 2],
        [3, 4, 8, 2, 0],
        [4, 5, 8, 2, 2],
        [7, 8, 16, 3, 0],
        [8, 9, 16, 3, 2],
    ];
    for (const [n, segCount, searchRange, entrySelector, rangeShift] of CASES) {
        test(`segCount ${segCount}: searchRange ${searchRange}, entrySelector ${entrySelector}, rangeShift ${rangeShift}`, () => {
            const h = header(buildCmapFormat4(disjoint(n)));
            expect(h).toEqual({ format: 4, length: 16 + 8 * segCount, segCountX2: 2 * segCount, searchRange, entrySelector, rangeShift });
        });
    }

    test('the table still maps every code point (runs of consecutive code points and gids share a segment)', () => {
        const map = new Map([[0x41, 1], [0x42, 2], [0x43, 3], [0xE9, 7], [0x20AC, 4], [0xFB01, 9]]);
        const bytes = buildCmapFormat4(map);
        expect(header(bytes).segCountX2).toBe(2 * 5);
        expect(parseCmap(bytes).encodings[0].subtable.map).toEqual(map);
    });
});
