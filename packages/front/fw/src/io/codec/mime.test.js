// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { mime } from './mime.js';
import { utf8 } from './utf8.js';

// Minimal `random` stub exposing the public surface used by `mime`
// (only `bytes(n)`). Backed by `crypto.getRandomValues` so tests remain
// deterministic in the sense that unique boundaries stay unique.
const randomStub = {
    bytes(n) {
        const out = new Uint8Array(n);
        crypto.getRandomValues(out);
        return out;
    }
};

const codec = mime.factory(utf8.factory(), randomStub);

describe('mime module', () => {
    test('metadata', () => {
        expect(mime.name).toBe('mime');
        expect(mime.dependencies).toEqual(['utf8', 'random']);
        expect(typeof mime.factory).toBe('function');
    });

    test('factory exposes API', () => {
        expect(typeof codec.parseHeader).toBe('function');
        expect(typeof codec.formatHeader).toBe('function');
        expect(typeof codec.parseHeaders).toBe('function');
        expect(typeof codec.formatHeaders).toBe('function');
        expect(typeof codec.encode).toBe('function');
        expect(typeof codec.decode).toBe('function');
        expect(typeof codec.randomBoundary).toBe('function');
    });

    describe('parseHeader', () => {
        test('simple value without params', () => {
            expect(codec.parseHeader('text/plain'))
                .toEqual({ value: 'text/plain', params: {} });
        });

        test('value with one param', () => {
            expect(codec.parseHeader('text/plain; charset=utf-8'))
                .toEqual({ value: 'text/plain', params: { charset: 'utf-8' } });
        });

        test('value with multiple params', () => {
            expect(codec.parseHeader('multipart/form-data; boundary=abc; charset=utf-8'))
                .toEqual({
                    value: 'multipart/form-data',
                    params: { boundary: 'abc', charset: 'utf-8' }
                });
        });

        test('param names lowercased', () => {
            expect(codec.parseHeader('text/plain; CharSet=utf-8').params)
                .toEqual({ charset: 'utf-8' });
        });

        test('quoted param value', () => {
            expect(codec.parseHeader('form-data; name="my field"').params)
                .toEqual({ name: 'my field' });
        });

        test('quoted param value with escape', () => {
            expect(codec.parseHeader('form-data; name="a \\"b\\" c"').params)
                .toEqual({ name: 'a "b" c' });
        });

        test('quoted param value with delimiter inside', () => {
            expect(codec.parseHeader('form-data; name="a;b"').params)
                .toEqual({ name: 'a;b' });
        });

        test('extra whitespace tolerated', () => {
            expect(codec.parseHeader('  text/plain ;  charset = utf-8  '))
                .toEqual({ value: 'text/plain', params: { charset: 'utf-8' } });
        });

        test('RFC 5987 extended param (UTF-8)', () => {
            expect(codec.parseHeader("attachment; filename*=UTF-8''caf%C3%A9.txt").params)
                .toEqual({ filename: 'café.txt' });
        });

        test('RFC 5987 extended param overrides basic form', () => {
            const h = codec.parseHeader(
                "attachment; filename=\"fallback.txt\"; filename*=UTF-8''caf%C3%A9.txt"
            );
            expect(h.params.filename).toBe('café.txt');
        });

        test('non-string input returns empty', () => {
            expect(codec.parseHeader(null))
                .toEqual({ value: '', params: {} });
        });

        test('Content-Disposition form-data part', () => {
            expect(codec.parseHeader('form-data; name="file"; filename="a.txt"'))
                .toEqual({
                    value: 'form-data',
                    params: { name: 'file', filename: 'a.txt' }
                });
        });
    });

    describe('formatHeader', () => {
        test('value alone', () => {
            expect(codec.formatHeader('text/plain')).toBe('text/plain');
        });

        test('value + params', () => {
            expect(codec.formatHeader('text/plain', { charset: 'utf-8' }))
                .toBe('text/plain; charset=utf-8');
        });

        test('object form', () => {
            expect(codec.formatHeader({ value: 'text/plain', params: { charset: 'utf-8' } }))
                .toBe('text/plain; charset=utf-8');
        });

        test('quotes values with special chars', () => {
            expect(codec.formatHeader('form-data', { name: 'a b' }))
                .toBe('form-data; name="a b"');
            expect(codec.formatHeader('form-data', { name: 'a;b' }))
                .toBe('form-data; name="a;b"');
            expect(codec.formatHeader('form-data', { name: 'a"b' }))
                .toBe('form-data; name="a\\"b"');
        });

        test('skips undefined/null params', () => {
            expect(codec.formatHeader('text/plain', { a: undefined, b: null, c: 'x' }))
                .toBe('text/plain; c=x');
        });

        test('round-trip with parseHeader', () => {
            const orig = { value: 'form-data', params: { name: 'file', filename: 'a b.txt' } };
            expect(codec.parseHeader(codec.formatHeader(orig))).toEqual(orig);
        });
    });

    describe('parseHeaders', () => {
        test('empty input', () => {
            expect(codec.parseHeaders('')).toEqual({});
            expect(codec.parseHeaders(null)).toEqual({});
        });

        test('simple headers (CRLF)', () => {
            expect(codec.parseHeaders('Content-Type: text/plain\r\nContent-Length: 5'))
                .toEqual({ 'content-type': 'text/plain', 'content-length': '5' });
        });

        test('LF-only tolerated', () => {
            expect(codec.parseHeaders('Content-Type: text/plain\nContent-Length: 5'))
                .toEqual({ 'content-type': 'text/plain', 'content-length': '5' });
        });

        test('folded line (obsolete) recollects with space', () => {
            expect(codec.parseHeaders('X-Foo: bar\r\n  baz')['x-foo']).toBe('bar baz');
        });

        test('multiple occurrences joined with ", "', () => {
            expect(codec.parseHeaders('Set-Cookie: a=1\r\nSet-Cookie: b=2')['set-cookie'])
                .toBe('a=1, b=2');
        });

        test('colon in value preserved', () => {
            expect(codec.parseHeaders('Location: http://example.com/a:b')['location'])
                .toBe('http://example.com/a:b');
        });
    });

    describe('formatHeaders', () => {
        test('emits Title-Case names + CRLF', () => {
            expect(codec.formatHeaders({ 'content-type': 'text/plain', 'content-length': '5' }))
                .toBe('Content-Type: text/plain\r\nContent-Length: 5\r\n');
        });
    });

    describe('encode / decode multipart', () => {
        test('empty parts list produces closing boundary only', () => {
            const { body, contentType, boundary } = codec.encode([]);
            expect(contentType).toContain('multipart/form-data');
            expect(contentType).toContain('boundary=' + boundary);
            expect(utf8.factory().fromBytes(body)).toBe('--' + boundary + '--\r\n');
        });

        test('single part form-data text field', () => {
            const enc = new TextEncoder();
            const { body, boundary } = codec.encode([
                {
                    headers: { 'content-disposition': 'form-data; name="field"' },
                    body: enc.encode('hello')
                }
            ]);
            const parts = codec.decode(body, boundary);
            expect(parts.length).toBe(1);
            expect(parts[0].headers['content-disposition'])
                .toBe('form-data; name="field"');
            expect(new TextDecoder().decode(parts[0].body)).toBe('hello');
        });

        test('string body converted to UTF-8 bytes', () => {
            const { body, boundary } = codec.encode([
                { headers: { 'content-type': 'text/plain' }, body: 'héllo' }
            ]);
            const parts = codec.decode(body, boundary);
            expect(new TextDecoder().decode(parts[0].body)).toBe('héllo');
        });

        test('multiple parts round-trip', () => {
            const { body, boundary } = codec.encode([
                {
                    headers: { 'content-disposition': 'form-data; name="a"' },
                    body: '1'
                },
                {
                    headers: {
                        'content-disposition': 'form-data; name="file"; filename="b.bin"',
                        'content-type': 'application/octet-stream'
                    },
                    body: new Uint8Array([0xde, 0xad, 0xbe, 0xef])
                }
            ]);
            const parts = codec.decode(body, boundary);
            expect(parts.length).toBe(2);
            expect(new TextDecoder().decode(parts[0].body)).toBe('1');
            expect(Array.from(parts[1].body)).toEqual([0xde, 0xad, 0xbe, 0xef]);
            expect(parts[1].headers['content-type']).toBe('application/octet-stream');
            const disp = codec.parseHeader(parts[1].headers['content-disposition']);
            expect(disp.params.filename).toBe('b.bin');
        });

        test('binary data preserved (NUL bytes, 0xff etc.)', () => {
            const payload = new Uint8Array(256);
            for (let i = 0; i < 256; i++) payload[i] = i;
            const { body, boundary } = codec.encode([
                { headers: { 'content-type': 'application/octet-stream' }, body: payload }
            ]);
            const parts = codec.decode(body, boundary);
            expect(Array.from(parts[0].body)).toEqual(Array.from(payload));
        });

        test('custom boundary', () => {
            const { body } = codec.encode(
                [{ headers: { 'x-a': '1' }, body: 'x' }],
                { boundary: 'MYBOUND' }
            );
            expect(utf8.factory().fromBytes(body)).toContain('--MYBOUND\r\n');
            expect(utf8.factory().fromBytes(body)).toContain('--MYBOUND--\r\n');
        });

        test('decode throws on missing boundary', () => {
            expect(() => codec.decode(new Uint8Array([1, 2, 3]), 'xyz'))
                .toThrow(/boundary not found/);
        });

        test('decode throws on unterminated part', () => {
            const bytes = utf8.factory().toBytes('--abc\r\nContent-Type: x\r\n\r\nhello');
            expect(() => codec.decode(bytes, 'abc'))
                .toThrow(/unterminated/);
        });

        test('randomBoundary produces unique values', () => {
            const a = codec.randomBoundary();
            const b = codec.randomBoundary();
            expect(a).not.toBe(b);
            expect(a).toMatch(/^----FwBoundary[0-9a-f]{16}$/);
        });

        test('encode contentType includes boundary', () => {
            const { contentType, boundary } = codec.encode([], { boundary: 'Z' });
            expect(contentType).toBe('multipart/form-data; boundary=Z');
            expect(boundary).toBe('Z');
        });

        test('custom type (multipart/mixed)', () => {
            const { contentType } = codec.encode([], { boundary: 'X', type: 'multipart/mixed' });
            expect(contentType).toBe('multipart/mixed; boundary=X');
        });

        test('preamble before first boundary tolerated', () => {
            const boundary = 'b';
            const body = utf8.factory().toBytes(
                'This is a preamble\r\n--b\r\nContent-Type: text/plain\r\n\r\nhi\r\n--b--\r\n'
            );
            const parts = codec.decode(body, boundary);
            expect(parts.length).toBe(1);
            expect(new TextDecoder().decode(parts[0].body)).toBe('hi');
        });

        test('round-trip preserves headers case-insensitively', () => {
            const { body, boundary } = codec.encode([
                { headers: { 'x-custom': 'v1' }, body: 'data' }
            ]);
            const parts = codec.decode(body, boundary);
            expect(parts[0].headers['x-custom']).toBe('v1');
        });
    });
});
