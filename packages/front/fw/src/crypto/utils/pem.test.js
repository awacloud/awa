// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { pem } from './pem.js';
import { b64 } from '../../io/codec/b64.js';
import { hex } from '../../io/codec/hex.js';

const _b64 = b64.factory();
const _hex = hex.factory();
const _pem = pem.factory(_b64);

describe('pem module (RFC 7468)', () => {

    test('module metadata', () => {
        expect(pem.name).toBe('pem');
        expect(pem.dependencies).toEqual(['b64']);
    });

    test('encode produces canonical block', () => {
        const out = _pem.encode(new Uint8Array([1, 2, 3, 4, 5]), 'EXAMPLE');
        expect(out).toBe('-----BEGIN EXAMPLE-----\nAQIDBAU=\n-----END EXAMPLE-----\n');
    });

    test('64-char line wrapping for long input', () => {
        const data = new Uint8Array(80).fill(0xab);
        const out = _pem.encode(data, 'TEST');
        const lines = out.split('\n').filter(l => l.length > 0);
        // Lines: BEGIN, body lines (64 chars max each), END.
        for (let i = 1; i < lines.length - 1; i++) {
            expect(lines[i].length).toBeLessThanOrEqual(64);
        }
    });

    test('round-trip', () => {
        const data = _hex.toBytes('deadbeefcafebabe0011223344556677');
        const enc = _pem.encode(data, 'PRIVATE KEY');
        const dec = _pem.decode(enc);
        expect(dec.label).toBe('PRIVATE KEY');
        expect(_hex.fromBytes(dec.bytes)).toBe('deadbeefcafebabe0011223344556677');
    });

    test('decode tolerates CRLF line endings', () => {
        const text = '-----BEGIN X-----\r\nAQID\r\n-----END X-----\r\n';
        expect(_hex.fromBytes(_pem.decode(text).bytes)).toBe('010203');
    });

    test('decode rejects mismatched labels', () => {
        const text = '-----BEGIN A-----\nAQID\n-----END B-----\n';
        expect(_pem.decode(text)).toBe(false);
    });

    test('decode rejects when expectLabel does not match', () => {
        const text = '-----BEGIN A-----\nAQID\n-----END A-----\n';
        expect(_pem.decode(text, 'B')).toBe(false);
    });

    test('decode returns false for missing markers', () => {
        expect(_pem.decode('not a pem')).toBe(false);
    });
});
