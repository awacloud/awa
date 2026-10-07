// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableSvg } from './svg.js';
import { testRuntime } from './_test-runtime.js';
const { parseSvg } = testRuntime.resolve('tableSvg');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

describe('tableSvg', () => {
    test('module metadata', () => { expect(tableSvg.name).toBe('tableSvg'); });

    test('parses one SVG document', () => {
        const xml = new Uint8Array([60, 115, 118, 103, 47, 62]);   // "<svg/>"
        const w = new BinaryWriter();
        w.writeUint16(0).writeUint32(10).writeUint32(0);   // header + list offset = 10
        // SVG document list at offset 10
        w.writeUint16(1);
        w.writeUint16(0).writeUint16(0);                    // start/end glyph 0
        // svgDocOffset is relative to list start ; we'll put doc immediately after the record
        const docOffPos = w.pos; w.writeUint32(0);
        w.writeUint32(xml.length);
        const docStart = w.pos;
        w.writeBytes(xml);
        const bytes = w.finalize();
        // Patch svgDocOffset
        const off = docStart - 10;   // relative to list start (which is at 10)
        bytes[docOffPos]     = (off >>> 24) & 0xFF;
        bytes[docOffPos + 1] = (off >>> 16) & 0xFF;
        bytes[docOffPos + 2] = (off >>>  8) & 0xFF;
        bytes[docOffPos + 3] =  off         & 0xFF;
        const s = parseSvg(bytes);
        expect(s.documents.length).toBe(1);
        const u = s.documents[0].getBytes();
        expect(Array.from(u)).toEqual(Array.from(xml));
        expect(s.documents[0].isGzipped()).toBe(false);
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeUint16(9).writeUint32(0).writeUint32(0);
        expect(() => parseSvg(w.finalize())).toThrow(ParseError);
    });
});
