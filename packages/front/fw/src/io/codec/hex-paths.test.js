// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// hex.fromBytes fast paths: the native Uint8Array.prototype.toHex where the
// realm has it, the JS path otherwise (String.fromCharCode without
// TextDecoder); all equal Buffer on bytes, and an array of numbers encodes
// as before.

import { describe, test, expect } from 'bun:test';
import { hex } from './hex.js';

function jsOnly(noDecoder = false) {
    const saved = [['toHex', Uint8Array.prototype], ...(noDecoder ? [['TextDecoder', globalThis]] : [])]
        .filter(([m, o]) => typeof o[m] === 'function').map(([m, o]) => [m, o, o[m]]);
    for (const [m, o] of saved) delete o[m];
    try { return hex.factory(); } finally { for (const [m, o, f] of saved) o[m] = f; }
}

let x = 0x2545F491;
const bytes = (n) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; b[i] = x & 255; } return b; };

for (const [name, c] of Object.entries({ default: hex.factory(), js: jsOnly(), 'js, no TextDecoder': jsOnly(true) })) {
    describe(`hex (${name} path)`, () => {
        test('fromBytes equals Buffer on every length 0-300, 70000 and 1 MiB; toBytes round-trips', () => {
            for (const n of [...Array(301).keys(), 70000, 1 << 20]) {
                const b = bytes(n);
                const s = Buffer.from(b).toString('hex');
                expect(c.fromBytes(b)).toBe(s);
                expect(Buffer.from(c.toBytes(s)).equals(Buffer.from(b))).toBe(true);
            }
        });

        test('an array of numbers encodes as before (low 8 bits; NaN and holes read as 0)', () => {
            expect(c.fromBytes([256, 300, -1, 1.7, NaN])).toBe('002cff0100');
            expect(c.fromBytes([1, , 3])).toBe('010003');   // eslint-disable-line no-sparse-arrays
            expect(c.fromBytes([])).toBe('');
        });
    });
}
