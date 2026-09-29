// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Wires the reproducible combiner-KAT regeneration
 * (`tools/hybrid-kat-regen.js`) into the test suite so CI exercises the
 * "continuous crypto-proof" every run: the frozen `hybridKem` (X-Wing) and
 * `hybridSign` (composite) implementations must recompute every committed
 * fixture BYTE-FOR-BYTE from fixed seeds, with no network.
 *
 * Also asserts the failure path: a corrupted fixture copy makes the regen
 * report `ok === false` and name the offending case id (the exit-1 contract of
 * the CLI, exercised here through the pure `verify()` seam).
 */

import { describe, test, expect } from 'bun:test';

import { verify } from '../../../tools/hybrid-kat-regen.js';
import { XWING_KAT } from './__fixtures__/xwing-ietf-kat.js';
import { COMPOSITE_KAT } from './__fixtures__/composite-kat-regen.js';

describe('hybrid combiner-KAT regeneration', () => {
    test('regenerates every committed fixture byte-for-byte (green)', () => {
        const res = verify();
        expect(res.ok).toBe(true);
        expect(res.mismatches).toEqual([]);
        // 3 X-Wing KAT cases (tv0..tv2) + 2 composite reproducibility cases.
        expect(res.cases.length).toBe(XWING_KAT.length + COMPOSITE_KAT.length);
        expect(res.cases.every((c) => c.pass)).toBe(true);
    });

    test('covers both hybrid families', () => {
        const ids = verify().cases.map((c) => c.id);
        expect(ids).toContain('xwing:tv0');
        expect(ids).toContain('composite:mldsa65_ed25519');
        expect(ids).toContain('composite:mldsa65_ecdsaP256');
    });

    test('corrupted X-Wing fixture ⇒ ok=false naming the case', () => {
        const corrupted = XWING_KAT.map((c) => ({ ...c }));
        // Flip the last nibble of tv1's expected shared secret.
        const ss = corrupted[1].ss;
        corrupted[1].ss = ss.slice(0, -1) + (ss.slice(-1) === '0' ? '1' : '0');

        const res = verify({ xwingKat: corrupted });
        expect(res.ok).toBe(false);
        expect(res.mismatches.some((m) => m.startsWith('xwing:tv1'))).toBe(true);
        // The uncorrupted composite cases still pass — only the tampered one fails.
        expect(res.cases.find((c) => c.id === 'xwing:tv0').pass).toBe(true);
        expect(res.cases.find((c) => c.id === 'composite:mldsa65_ed25519').pass).toBe(true);
    });

    test('corrupted composite fixture ⇒ ok=false naming the case', () => {
        const corrupted = COMPOSITE_KAT.map((c) => ({ ...c }));
        // Flip the first nibble of the ed25519 case's expected signature.
        const sig = corrupted[0].sig;
        corrupted[0].sig = (sig[0] === '0' ? '1' : '0') + sig.slice(1);

        const res = verify({ compositeKat: corrupted });
        expect(res.ok).toBe(false);
        expect(res.mismatches.some((m) => m.startsWith('composite:mldsa65_ed25519'))).toBe(true);
        expect(res.mismatches.some((m) => m.includes('sig'))).toBe(true);
    });
});
