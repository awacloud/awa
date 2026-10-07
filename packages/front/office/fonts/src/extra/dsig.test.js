// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { extraDsig } from './dsig.js';
import { testRuntime } from './_test-runtime.js';
const { parseDsig, DSIG_VERSION, DSIG_FORMAT_PKCS7 } = testRuntime.resolve('extraDsig');
const { BinaryWriter } = testRuntime.resolve('fontWriter');
const { BinaryReader } = testRuntime.resolve('fontReader');
const { ParseError } = testRuntime.resolve('fontErrors');

function buildDsig(blobs) {
    // blobs: Array<Uint8Array>  (raw PKCS#7 blob bytes)
    const headerSize = 8;
    const recordSize = 12;
    const numSigs = blobs.length;
    const recordsEnd = headerSize + recordSize * numSigs;

    const blockLens = blobs.map(b => 8 + b.length);
    const offsets = [];
    let cursor = recordsEnd;
    for (const bl of blockLens) {
        offsets.push(cursor);
        cursor += bl;
    }

    const w = new BinaryWriter(cursor);
    w.writeUint32(DSIG_VERSION);
    w.writeUint16(numSigs);
    w.writeUint16(0); // flags
    for (let i = 0; i < numSigs; i++) {
        w.writeUint32(DSIG_FORMAT_PKCS7);
        w.writeUint32(blockLens[i]);
        w.writeUint32(offsets[i]);
    }
    for (let i = 0; i < numSigs; i++) {
        w.writeUint16(0);                 // reserved1
        w.writeUint16(0);                 // reserved2
        w.writeUint32(blobs[i].length);   // signatureLength
        w.writeBytes(blobs[i]);
    }
    return w.finalize();
}

describe('extraDsig', () => {
    test('module metadata', () => {
        expect(extraDsig.name).toBe('extraDsig');
        expect(extraDsig.dependencies).toEqual(['fontErrors', 'fontReader']);
    });

    test('parses an empty DSIG (numSignatures = 0)', () => {
        const bytes = buildDsig([]);
        const d = parseDsig(bytes);
        expect(d.version).toBe(1);
        expect(d.numSignatures).toBe(0);
        expect(d.signatures).toEqual([]);
    });

    test('parses a single PKCS#7 blob', () => {
        const blob = new Uint8Array([0x30, 0x82, 0x01, 0xAB, 0x00, 0xFF]);
        const bytes = buildDsig([blob]);
        const d = parseDsig(bytes);
        expect(d.numSignatures).toBe(1);
        expect(d.signatures[0].format).toBe(DSIG_FORMAT_PKCS7);
        expect(d.signatures[0].signatureLength).toBe(blob.length);
        expect(Array.from(d.signatures[0].signature)).toEqual(Array.from(blob));
    });

    test('parses multiple signatures preserving order', () => {
        const a = new Uint8Array([1, 2, 3]);
        const b = new Uint8Array([4, 5, 6, 7]);
        const bytes = buildDsig([a, b]);
        const d = parseDsig(bytes);
        expect(d.numSignatures).toBe(2);
        expect(Array.from(d.signatures[0].signature)).toEqual([1, 2, 3]);
        expect(Array.from(d.signatures[1].signature)).toEqual([4, 5, 6, 7]);
    });

    test('factory returns parseDsig', () => {
        const mod = extraDsig.factory(testRuntime.resolve('fontErrors'), { BinaryReader });
        expect(typeof mod.parseDsig).toBe('function');
    });

    test('rejects short input', () => {
        expect(() => parseDsig(new Uint8Array(4))).toThrow(ParseError);
    });

    test('rejects unsupported version', () => {
        const w = new BinaryWriter();
        w.writeUint32(99).writeUint16(0).writeUint16(0);
        expect(() => parseDsig(w.finalize())).toThrow(ParseError);
    });

    test('rejects non-Uint8Array input', () => {
        expect(() => parseDsig('nope')).toThrow(ParseError);
    });
});
