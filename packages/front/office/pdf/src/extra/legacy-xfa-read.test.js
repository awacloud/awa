// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfParserObj } from '../syntax/parser-obj.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
import { pdfLegacyXfaRead } from './legacy-xfa-read.js';

const u8 = (s) => new TextEncoder().encode(s);
const m = pdfLegacyXfaRead.factory(_pdfErrors_TD1);

const stream = (raw) => obj.stream(obj.dict({}), raw);

describe('extra/legacy-xfa-read', () => {
    test('single XDP stream shape', () => {
        const xdp = u8('<xdp/>');
        const r = m.readXfa(stream(xdp));
        expect(r._legacy.xfa.shape).toBe('stream');
        expect(r._legacy.xfa.xdp).toBe(xdp);
    });

    test('array shape with preamble/config/template', () => {
        const r = m.readXfa(obj.array([
            obj.string(u8('preamble')), stream(u8('<p/>')),
            obj.string(u8('config')),   stream(u8('<c/>')),
            obj.string(u8('template')), stream(u8('<t/>'))
        ]));
        expect(r._legacy.xfa.shape).toBe('array');
        expect(r._legacy.xfa.order).toEqual(['preamble', 'config', 'template']);
        expect(r._legacy.xfa.packets.config).toBeInstanceOf(Uint8Array);
        expect(r._legacy.xfa.unknownPackets).toEqual([]);
    });

    test('flags unknown packet names', () => {
        const r = m.readXfa(obj.array([
            obj.string(u8('weirdPacket')), stream(u8('x'))
        ]));
        expect(r._legacy.xfa.unknownPackets).toEqual(['weirdPacket']);
    });

    test('rejects odd-length array', () => {
        expect(() => m.readXfa(obj.array([obj.string(u8('preamble'))]))).toThrow(ParseError);
    });

    test('rejects non-string key', () => {
        expect(() => m.readXfa(obj.array([obj.int(1), stream(u8('x'))]))).toThrow(ParseError);
    });

    test('rejects non-stream packet', () => {
        expect(() => m.readXfa(obj.array([obj.string(u8('preamble')), obj.int(1)]))).toThrow(ParseError);
    });

    test('rejects bad top-level shape', () => {
        expect(() => m.readXfa(obj.int(1))).toThrow(ParseError);
    });

    test('isKnownPacket', () => {
        expect(m.isKnownPacket('template')).toBe(true);
        expect(m.isKnownPacket('nope')).toBe(false);
    });

    test('factory shape', () => {
        expect(pdfLegacyXfaRead.name).toBe('pdfLegacyXfaRead');
        expect(pdfLegacyXfaRead.dependencies).toEqual(['pdfErrors']);
        expect(pdfLegacyXfaRead.factory.toString()).toContain('function');
    });
});
