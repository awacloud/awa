// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { encodingWinAnsi } from './winAnsi.js';
import { testRuntime } from './_test-runtime.js';
const { WIN_ANSI, lookup } = testRuntime.resolve('encodingWinAnsi');

describe('encodingWinAnsi', () => {
    test('module metadata', () => { expect(encodingWinAnsi.name).toBe('encodingWinAnsi'); });
    test('256 entries', () => { expect(WIN_ANSI.length).toBe(256); });
    test('ASCII range', () => {
        expect(WIN_ANSI[0x20]).toBe('space');
        expect(WIN_ANSI[0x41]).toBe('A');
        expect(WIN_ANSI[0x7E]).toBe('asciitilde');
    });
    test('Win-1252 high range', () => {
        expect(WIN_ANSI[0x80]).toBe('Euro');
        expect(WIN_ANSI[0x99]).toBe('trademark');
        expect(WIN_ANSI[0x92]).toBe('quoteright');
    });
    // BL-1597 (office/BATCH_49): ISO 32000-2 Annex D WinAnsiEncoding has
    // quotesingle at 0x27 and grave at 0x60; quoteleft/quoteright live at 0x91/0x92.
    test('0x27 / 0x60 are quotesingle / grave (ISO 32000-2 Annex D)', () => {
        expect(WIN_ANSI[0x27]).toBe('quotesingle');
        expect(WIN_ANSI[0x60]).toBe('grave');
        expect(WIN_ANSI[0x91]).toBe('quoteleft');
        expect(WIN_ANSI[0x92]).toBe('quoteright');
        expect(lookup(0x27)).toBe('quotesingle');
        expect(lookup(0x60)).toBe('grave');
    });
    test('Latin-1 supplement', () => {
        expect(WIN_ANSI[0xA9]).toBe('copyright');
        expect(WIN_ANSI[0xC4]).toBe('Adieresis');
        expect(WIN_ANSI[0xFF]).toBe('ydieresis');
    });
    test('control codes are .notdef', () => {
        expect(WIN_ANSI[0x00]).toBe('.notdef');
        expect(WIN_ANSI[0x1F]).toBe('.notdef');
        expect(WIN_ANSI[0x7F]).toBe('.notdef');
    });
    test('factory lookup', () => {
        expect(lookup(0x41)).toBe('A');
        expect(lookup(0x80)).toBe('Euro');
    });
});
