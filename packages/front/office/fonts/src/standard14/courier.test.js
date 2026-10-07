// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { standard14Courier } from './courier.js';
import { testRuntime } from './_test-runtime.js';
const { COURIER_WIDTHS, courier, courierBoldOblique } = testRuntime.resolve('standard14Courier');

describe('standard14Courier', () => {
    test('module metadata', () => { expect(standard14Courier.name).toBe('standard14Courier'); });
    test('monospaced 600', () => {
        expect(COURIER_WIDTHS.every(v => v === 600)).toBe(true);
    });
    test('FixedPitch flag', () => {
        expect(courier.flags & 0x01).toBe(0x01);
        expect(courierBoldOblique.flags & 0x40).toBe(0x40);
    });
});
