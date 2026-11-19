// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// b64 fast paths: the native Uint8Array methods where the realm has them,
// the JS paths otherwise (String.fromCharCode without TextDecoder); all
// equal Buffer on bytes, and every malformed input decodes (or throws) as
// the original decoder did. The pinned values below were read from the
// decoder before the fast paths existed.

import { describe, test, expect } from 'bun:test';
import { b64 } from './b64.js';

/** A factory built with the native base64 methods hidden: the JS paths. */
function jsOnly(noDecoder = false) {
    const P = Uint8Array.prototype, saved = [['toBase64', P], ['fromBase64', Uint8Array], ...(noDecoder ? [['TextDecoder', globalThis]] : [])]
        .filter(([m, o]) => typeof o[m] === 'function').map(([m, o]) => [m, o, o[m]]);
    for (const [m, o] of saved) delete o[m];
    try { return b64.factory(); } finally { for (const [m, o, f] of saved) o[m] = f; }
}

let x = 0x9E3779B9;
const bytes = (n) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; b[i] = x & 255; } return b; };

const PATHS = { default: b64.factory(), js: jsOnly(), 'js, no TextDecoder': jsOnly(true) };

for (const [name, c] of Object.entries(PATHS)) {
    describe(`b64 (${name} path)`, () => {
        test('fromBytes / toBytes equal Buffer on every length 0-300, 70000 and 1 MiB', () => {
            const lens = [...Array(301).keys(), 70000, 1 << 20];
            for (const n of lens) {
                const b = bytes(n);
                const s = Buffer.from(b).toString('base64');
                expect(c.fromBytes(b)).toBe(s);
                expect(Buffer.from(c.toBytes(s)).equals(Buffer.from(b))).toBe(true);
            }
        });

        test('an array of numbers encodes as before (out-of-range values, holes, NaN)', () => {
            expect(c.fromBytes([256, 300, -1, 1.7, NaN])).toBe('ASv/AAA=');
            expect(c.fromBytes([1, , 3])).toBe('AQAD');   // eslint-disable-line no-sparse-arrays
            expect(c.fromBytes([300])).toBe('A==');
            expect(c.fromBytes([72, 101, 108, 108, 111])).toBe('SGVsbG8=');
        });

        test('malformed input decodes, or throws, as the original decoder did', () => {
            const pinned = {
                'AB=C': [0], 'A===': [0], 'AB C': [0, 16, 2], '-_-_': [0, 0, 0], '====': [0], '=': [0, 0],
                'SGVsbB==': [72, 101, 108, 108], 'QUÁD': [65, 64, 3], 'QUJDĀĀĀĀ': [65, 66, 67, 0, 0, 0],
            };
            for (const [s, want] of Object.entries(pinned)) expect(Array.from(c.toBytes(s))).toEqual(want);
            expect(() => c.toBytes('SGVsbG8')).toThrow(TypeError);       // missing padding
            expect(() => c.toBytes('QUJD\n')).toThrow(TypeError);
            // @ts-ignore - an array of characters is read like the string
            expect(Array.from(c.toBytes(['Q', 'U', 'J', 'D']))).toEqual([65, 66, 67]);
        });
    });
}
