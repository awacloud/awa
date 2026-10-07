// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { layoutClassDefinitions } from './classDefinitions.js';
import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { fontFixed } from '../primitives/fixed.js';
import { fontWriter } from '../primitives/writer.js';
import { binaryReader as fwBinaryReader } from '@awacloud/fw/io/binary/reader.js';
import { binaryWriter as fwBinaryWriter } from '@awacloud/fw/io/binary/writer.js';
const _errs = fontErrors.factory();
const { ParseError } = _errs;
const _fixed = fontFixed.factory();
const _readerApi = fontReader.factory(_errs, fwBinaryReader.factory(), _fixed);
const { BinaryWriter } = fontWriter.factory(_errs, fwBinaryWriter.factory(), _fixed);
const { parseCoverage, parseClassDef } = layoutClassDefinitions.factory(_errs, _readerApi);

describe('Coverage', () => {
    test('module metadata', () => { expect(layoutClassDefinitions.name).toBe('layoutClassDefinitions'); });

    test('format 1', () => {
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(3).writeUint16(10).writeUint16(20).writeUint16(30);
        const cov = parseCoverage(w.finalize());
        expect(cov.lookup(10)).toBe(0);
        expect(cov.lookup(20)).toBe(1);
        expect(cov.lookup(30)).toBe(2);
        expect(cov.lookup(15)).toBeNull();
    });

    test('format 2', () => {
        const w = new BinaryWriter();
        w.writeUint16(2).writeUint16(2);
        w.writeUint16(10).writeUint16(13).writeUint16(0);
        w.writeUint16(100).writeUint16(102).writeUint16(4);
        const cov = parseCoverage(w.finalize());
        expect(cov.lookup(10)).toBe(0);
        expect(cov.lookup(13)).toBe(3);
        expect(cov.lookup(100)).toBe(4);
        expect(cov.lookup(102)).toBe(6);
        expect(cov.lookup(50)).toBeNull();
    });

    test('rejects bad format', () => {
        const u = new Uint8Array([0, 9, 0, 0]);
        expect(() => parseCoverage(u)).toThrow(ParseError);
    });
});

describe('ClassDef', () => {
    test('format 1', () => {
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(10).writeUint16(3).writeUint16(5).writeUint16(7).writeUint16(9);
        const cd = parseClassDef(w.finalize());
        expect(cd.lookup(10)).toBe(5);
        expect(cd.lookup(11)).toBe(7);
        expect(cd.lookup(12)).toBe(9);
        expect(cd.lookup(5)).toBe(0);   // outside range
    });

    test('format 2', () => {
        const w = new BinaryWriter();
        w.writeUint16(2).writeUint16(2);
        w.writeUint16(10).writeUint16(15).writeUint16(1);
        w.writeUint16(100).writeUint16(110).writeUint16(2);
        const cd = parseClassDef(w.finalize());
        expect(cd.lookup(10)).toBe(1);
        expect(cd.lookup(15)).toBe(1);
        expect(cd.lookup(100)).toBe(2);
        expect(cd.lookup(50)).toBe(0);
    });
});
