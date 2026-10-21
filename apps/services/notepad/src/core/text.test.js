// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Encodings, line endings and positions: every encoding
 * round-trips, detection follows the byte order mark then strict UTF-8,
 * binaries are spotted, lossy Windows-1252 is counted.
 *
 * @module notepad/core/text.test
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { utf8 } from '@awacloud/fw/io/codec/utf8.js';
import { ui8 } from '@awacloud/fw/io/utils/ui8.js';
import {
    createCodec, detectEol, normalizeEol, platformEol, unencodable, position, lineOffset, lineCount, ENCODINGS
} from './text.js';

const rt = new ModuleRuntime();
rt.registerAllDeep([utf8, ui8]);
const { decode, encode, encodeChunks } = createCodec({ utf8: rt.resolve('utf8'), ui8: rt.resolve('ui8') });

describe('decode', () => {
    test('plain UTF-8, line endings detected and normalised', () => {
        const d = decode(new TextEncoder().encode('été\r\nhiver\r\n'));
        expect(d).toEqual({ text: 'été\nhiver\n', encoding: 'utf-8', eol: 'crlf', binary: false });
    });
    test('byte order marks: UTF-8, UTF-16 LE, UTF-16 BE', () => {
        expect(decode(Uint8Array.of(0xef, 0xbb, 0xbf, 0x41)).encoding).toBe('utf-8-bom');
        expect(decode(Uint8Array.of(0xef, 0xbb, 0xbf, 0x41)).text).toBe('A');
        expect(decode(Uint8Array.of(0xff, 0xfe, 0x41, 0x00, 0x0a, 0x00, 0x42, 0x00))).toEqual({ text: 'A\nB', encoding: 'utf-16le', eol: 'lf', binary: false });
        expect(decode(Uint8Array.of(0xfe, 0xff, 0x00, 0xe9)).text).toBe('é');
    });
    test('invalid UTF-8 falls back to Windows-1252', () => {
        const d = decode(Uint8Array.of(0x63, 0x61, 0x66, 0xe9, 0x20, 0x80));
        expect(d.encoding).toBe('windows-1252');
        expect(d.text).toBe('café €');
    });
    test('a NUL byte without a UTF-16 mark is a binary', () => {
        expect(decode(Uint8Array.of(0x50, 0x4b, 0x03, 0x04, 0x00, 0x00)).binary).toBe(true);
        expect(decode(new TextEncoder().encode('text')).binary).toBe(false);
    });
    test('no line break: no line ending', () => {
        expect(decode(new TextEncoder().encode('one line')).eol).toBe(null);
    });
});

describe('encode', () => {
    const sample = 'Ligne 1 — été\nLigne 2 €\n';
    test('every encoding round-trips through decode', () => {
        for (const encoding of ENCODINGS) {
            for (const eol of /** @type {const} */ (['crlf', 'lf', 'cr'])) {
                const back = decode(encode(sample, { encoding, eol }));
                expect(back.text).toBe(sample);
                expect(back.encoding).toBe(encoding);
                expect(back.eol).toBe(eol);
            }
        }
    });
    test('line endings and byte order marks are written', () => {
        expect([...encode('a\nb', { encoding: 'utf-8', eol: 'crlf' })]).toEqual([0x61, 0x0d, 0x0a, 0x62]);
        expect([...encode('a', { encoding: 'utf-8-bom', eol: 'lf' })]).toEqual([0xef, 0xbb, 0xbf, 0x61]);
        expect([...encode('a', { encoding: 'utf-16be', eol: 'lf' })]).toEqual([0xfe, 0xff, 0x00, 0x61]);
    });
    test('Windows-1252 writes ? for what it cannot hold, and counts it', () => {
        expect([...encode('€ é 😀', { encoding: 'windows-1252', eol: 'lf' })]).toEqual([0x80, 0x20, 0xe9, 0x20, 0x3f]);
        expect(unencodable('€ é 😀 中', 'windows-1252')).toBe(2);
        expect(unencodable('😀', 'utf-8')).toBe(0);
    });
    test('in pieces: the same bytes, a surrogate pair never split, the mark in the first piece only', () => {
        const text = 'ab😀cd\néé€😀😀\nlast line 😀';
        for (const encoding of ENCODINGS) {
            for (const eol of /** @type {const} */ (['crlf', 'lf'])) {
                for (const size of [1, 2, 3, 7, 1000]) {
                    const pieces = encodeChunks(text, { encoding, eol }, size);
                    const joined = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
                    let at = 0;
                    for (const p of pieces) { joined.set(p, at); at += p.length; }
                    expect([...joined], `${encoding} ${eol} ${size}`).toEqual([...encode(text, { encoding, eol })]);
                }
            }
        }
        expect(encodeChunks('', { encoding: 'utf-8-bom', eol: 'lf' }).map((p) => [...p])).toEqual([[0xef, 0xbb, 0xbf]]);
    });
    test('an unknown encoding is refused', () => {
        expect(() => encode('a', { encoding: /** @type {any} */ ('ebcdic'), eol: 'lf' })).toThrow(RangeError);
    });
});

describe('line endings', () => {
    test('the dominant one wins', () => {
        expect(detectEol('a\nb\nc\r\n')).toBe('lf');
        expect(detectEol('a\rb\rc')).toBe('cr');
        expect(detectEol('a\r\nb')).toBe('crlf');
        expect(normalizeEol('a\r\nb\rc\n')).toBe('a\nb\nc\n');
    });
    test('the platform decides for a new document', () => {
        expect(platformEol({ platform: 'Win32' })).toBe('crlf');
        expect(platformEol({ userAgentData: { platform: 'Windows' } })).toBe('crlf');
        expect(platformEol({ platform: 'Linux x86_64' })).toBe('lf');
        expect(platformEol({})).toBe('lf');
    });
});

describe('positions', () => {
    const text = 'ab\ncde\n\nf';
    test('line and column of an offset', () => {
        expect(position(text, 0)).toEqual({ line: 1, col: 1 });
        expect(position(text, 2)).toEqual({ line: 1, col: 3 });
        expect(position(text, 3)).toEqual({ line: 2, col: 1 });
        expect(position(text, text.length)).toEqual({ line: 4, col: 2 });
    });
    test('start of a line, line count', () => {
        expect(lineOffset(text, 1)).toBe(0);
        expect(lineOffset(text, 2)).toBe(3);
        expect(lineOffset(text, 4)).toBe(8);
        expect(lineOffset(text, 99)).toBe(8);
        expect(lineCount(text)).toBe(4);
        expect(lineCount('')).toBe(1);
    });
});
