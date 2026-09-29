// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { url } from './url.js';

const codec = url.factory();


describe('url module', () => {
    test('metadata', () => {
        expect(url.name).toBe('url');
        expect(url.dependencies).toEqual([]);
        expect(typeof url.factory).toBe('function');
    });

    test('factory API', () => {
        expect(typeof codec.parseQuery).toBe('function');
        expect(typeof codec.stringifyQuery).toBe('function');
        expect(typeof codec.parseURL).toBe('function');
        expect(typeof codec.buildURL).toBe('function');
        expect(typeof codec.encodeSafe).toBe('function');
        expect(typeof codec.decodeSafe).toBe('function');
    });

    describe('parseQuery', () => {
        test('empty string returns empty object', () => {
            expect(codec.parseQuery('')).toEqual({});
            expect(codec.parseQuery(null)).toEqual({});
            expect(codec.parseQuery(undefined)).toEqual({});
        });

        test('simple pairs', () => {
            expect(codec.parseQuery('a=1&b=2')).toEqual({ a: '1', b: '2' });
        });

        test('leading ? is stripped', () => {
            expect(codec.parseQuery('?a=1&b=2')).toEqual({ a: '1', b: '2' });
        });

        test('leading # is stripped (for hash-style)', () => {
            expect(codec.parseQuery('#a=1')).toEqual({ a: '1' });
        });

        test('key without value', () => {
            expect(codec.parseQuery('flag')).toEqual({ flag: '' });
            expect(codec.parseQuery('a&b=2')).toEqual({ a: '', b: '2' });
        });

        test('value with = inside', () => {
            expect(codec.parseQuery('eq=a=b')).toEqual({ eq: 'a=b' });
        });

        test('percent-decoding', () => {
            expect(codec.parseQuery('q=hello%20world')).toEqual({ q: 'hello world' });
            expect(codec.parseQuery('n=caf%C3%A9')).toEqual({ n: 'café' });
        });

        test('invalid percent-encoding returns raw', () => {
            expect(codec.parseQuery('q=%ZZ')).toEqual({ q: '%ZZ' });
        });

        test('+ treated literal by default', () => {
            expect(codec.parseQuery('q=a+b')).toEqual({ q: 'a+b' });
        });

        test('space: plus decodes + as space', () => {
            expect(codec.parseQuery('q=a+b', { space: 'plus' })).toEqual({ q: 'a b' });
        });

        test('arrayFormat: repeat (default)', () => {
            expect(codec.parseQuery('a=1&a=2&a=3')).toEqual({ a: ['1', '2', '3'] });
        });

        test('arrayFormat: none takes last', () => {
            expect(codec.parseQuery('a=1&a=2', { arrayFormat: 'none' }))
                .toEqual({ a: '2' });
        });

        test('arrayFormat: brackets', () => {
            expect(codec.parseQuery('a[]=1&a[]=2', { arrayFormat: 'brackets' }))
                .toEqual({ a: ['1', '2'] });
        });

        test('arrayFormat: indices', () => {
            expect(codec.parseQuery('a[0]=x&a[1]=y&a[2]=z', { arrayFormat: 'indices' }))
                .toEqual({ a: ['x', 'y', 'z'] });
        });

        test('arrayFormat: comma', () => {
            expect(codec.parseQuery('tags=js,web,ts', { arrayFormat: 'comma' }))
                .toEqual({ tags: ['js', 'web', 'ts'] });
        });

        test('arrayFormat: comma single value stays string', () => {
            expect(codec.parseQuery('tags=only', { arrayFormat: 'comma' }))
                .toEqual({ tags: 'only' });
        });

        test('nested objects (nested: true)', () => {
            expect(codec.parseQuery('user[name]=Alice&user[age]=30', { nested: true }))
                .toEqual({ user: { name: 'Alice', age: '30' } });
        });

        test('deep nested', () => {
            expect(codec.parseQuery('a[b][c]=x', { nested: true }))
                .toEqual({ a: { b: { c: 'x' } } });
        });

        test('nested + brackets array mix', () => {
            expect(codec.parseQuery('user[tags][]=a&user[tags][]=b', { arrayFormat: 'brackets' }))
                .toEqual({ user: { tags: ['a', 'b'] } });
        });

        test('custom delimiter ;', () => {
            expect(codec.parseQuery('a=1;b=2', { delimiter: ';' }))
                .toEqual({ a: '1', b: '2' });
        });

        test('empty pair segments skipped', () => {
            expect(codec.parseQuery('a=1&&b=2')).toEqual({ a: '1', b: '2' });
        });

        test('key is percent-decoded', () => {
            expect(codec.parseQuery('my%20key=v')).toEqual({ 'my key': 'v' });
        });
    });

    describe('stringifyQuery', () => {
        test('empty / invalid inputs', () => {
            expect(codec.stringifyQuery(null)).toBe('');
            expect(codec.stringifyQuery(undefined)).toBe('');
            expect(codec.stringifyQuery({})).toBe('');
        });

        test('simple pairs', () => {
            expect(codec.stringifyQuery({ a: '1', b: '2' })).toBe('a=1&b=2');
        });

        test('percent-encoding special chars', () => {
            expect(codec.stringifyQuery({ q: 'hello world' })).toBe('q=hello%20world');
            expect(codec.stringifyQuery({ n: 'café' })).toBe('n=caf%C3%A9');
        });

        test('space: plus encodes spaces as +', () => {
            expect(codec.stringifyQuery({ q: 'hello world' }, { space: 'plus' }))
                .toBe('q=hello+world');
        });

        test('numbers and booleans', () => {
            expect(codec.stringifyQuery({ a: 1, b: true, c: false }))
                .toBe('a=1&b=true&c=false');
        });

        test('null emits empty value, undefined skipped', () => {
            expect(codec.stringifyQuery({ a: null, b: undefined, c: 1 }))
                .toBe('a=&c=1');
        });

        test('skipNull omits null/undefined entries', () => {
            expect(codec.stringifyQuery({ a: null, b: undefined, c: 1 }, { skipNull: true }))
                .toBe('c=1');
        });

        test('Date serializes as ISO', () => {
            const d = new Date('2024-01-02T03:04:05.000Z');
            expect(codec.stringifyQuery({ d }))
                .toBe('d=2024-01-02T03%3A04%3A05.000Z');
        });

        test('arrayFormat: repeat (default)', () => {
            expect(codec.stringifyQuery({ a: ['1', '2', '3'] }))
                .toBe('a=1&a=2&a=3');
        });

        test('arrayFormat: brackets', () => {
            expect(codec.stringifyQuery({ a: ['1', '2'] }, { arrayFormat: 'brackets' }))
                .toBe('a%5B%5D=1&a%5B%5D=2');
        });

        test('arrayFormat: indices', () => {
            expect(codec.stringifyQuery({ a: ['x', 'y'] }, { arrayFormat: 'indices' }))
                .toBe('a%5B0%5D=x&a%5B1%5D=y');
        });

        test('arrayFormat: comma (separator not encoded)', () => {
            expect(codec.stringifyQuery({ tags: ['js', 'web'] }, { arrayFormat: 'comma' }))
                .toBe('tags=js,web');
        });

        test('empty array produces nothing', () => {
            expect(codec.stringifyQuery({ a: [], b: 1 })).toBe('b=1');
        });

        test('nested object (nested: true)', () => {
            expect(codec.stringifyQuery({ u: { name: 'Alice' } }, { nested: true }))
                .toBe('u%5Bname%5D=Alice');
        });

        test('nested not enabled → [object Object]', () => {
            // Without nested, objects become string "[object Object]"
            const s = codec.stringifyQuery({ u: { name: 'Alice' } });
            expect(s).toContain('u=');
        });

        test('sort option', () => {
            expect(codec.stringifyQuery({ b: 2, a: 1, c: 3 }, { sort: true }))
                .toBe('a=1&b=2&c=3');
        });

        test('custom delimiter', () => {
            expect(codec.stringifyQuery({ a: 1, b: 2 }, { delimiter: ';' }))
                .toBe('a=1;b=2');
        });
    });

    describe('round-trip', () => {
        test('repeat', () => {
            const obj = { a: ['1', '2'], b: 'x' };
            expect(codec.parseQuery(codec.stringifyQuery(obj))).toEqual(obj);
        });

        test('brackets', () => {
            const obj = { tags: ['a', 'b', 'c'] };
            const s = codec.stringifyQuery(obj, { arrayFormat: 'brackets' });
            expect(codec.parseQuery(s, { arrayFormat: 'brackets' })).toEqual(obj);
        });

        test('indices', () => {
            const obj = { tags: ['a', 'b'] };
            const s = codec.stringifyQuery(obj, { arrayFormat: 'indices' });
            expect(codec.parseQuery(s, { arrayFormat: 'indices' })).toEqual(obj);
        });

        test('comma', () => {
            const obj = { tags: ['a', 'b'] };
            const s = codec.stringifyQuery(obj, { arrayFormat: 'comma' });
            expect(codec.parseQuery(s, { arrayFormat: 'comma' })).toEqual(obj);
        });

        test('nested', () => {
            const obj = { user: { name: 'Alice', age: '30' } };
            const s = codec.stringifyQuery(obj, { nested: true });
            expect(codec.parseQuery(s, { nested: true })).toEqual(obj);
        });

        test('unicode preserved', () => {
            const obj = { q: 'café ☕' };
            expect(codec.parseQuery(codec.stringifyQuery(obj))).toEqual(obj);
        });
    });

    describe('parseURL', () => {
        test('full URL', () => {
            const u = codec.parseURL('https://user:pass@example.com:8080/a/b?x=1&y=2#top');
            expect(u.protocol).toBe('https:');
            expect(u.hostname).toBe('example.com');
            expect(u.port).toBe('8080');
            expect(u.pathname).toBe('/a/b');
            expect(u.search).toBe('?x=1&y=2');
            expect(u.hash).toBe('#top');
            expect(u.username).toBe('user');
            expect(u.password).toBe('pass');
            expect(u.query).toEqual({ x: '1', y: '2' });
        });

        test('simple URL', () => {
            const u = codec.parseURL('https://example.com/');
            expect(u.protocol).toBe('https:');
            expect(u.hostname).toBe('example.com');
            expect(u.pathname).toBe('/');
            expect(u.query).toEqual({});
        });

        test('query decomposed', () => {
            const u = codec.parseURL('https://example.com/?a=1&b=hello%20world');
            expect(u.query).toEqual({ a: '1', b: 'hello world' });
        });

        test('relative URL with base', () => {
            const u = codec.parseURL('/api/users?id=5', 'https://example.com');
            expect(u.hostname).toBe('example.com');
            expect(u.pathname).toBe('/api/users');
            expect(u.query).toEqual({ id: '5' });
        });
    });

    describe('buildURL', () => {
        test('from components', () => {
            expect(codec.buildURL({
                protocol: 'https',
                hostname: 'example.com',
                pathname: '/a/b',
                query: { x: 1, y: 2 }
            })).toBe('https://example.com/a/b?x=1&y=2');
        });

        test('with port', () => {
            expect(codec.buildURL({
                protocol: 'http:',
                hostname: 'localhost',
                port: '3000',
                pathname: '/api'
            })).toBe('http://localhost:3000/api');
        });

        test('with hash', () => {
            expect(codec.buildURL({
                protocol: 'https',
                hostname: 'example.com',
                pathname: '/',
                hash: 'section-1'
            })).toBe('https://example.com/#section-1');
        });

        test('query as string', () => {
            expect(codec.buildURL({
                protocol: 'https',
                hostname: 'example.com',
                pathname: '/',
                query: 'a=1&b=2'
            })).toBe('https://example.com/?a=1&b=2');
        });

        test('userinfo', () => {
            expect(codec.buildURL({
                protocol: 'https',
                username: 'u',
                password: 'p',
                hostname: 'example.com',
                pathname: '/'
            })).toBe('https://u:p@example.com/');
        });

        test('round-trip via parseURL', () => {
            const input = 'https://example.com:443/path?a=1&b=hello%20world#h';
            const parsed = codec.parseURL(input);
            const rebuilt = codec.buildURL({
                protocol: parsed.protocol,
                hostname: parsed.hostname,
                port: parsed.port,
                pathname: parsed.pathname,
                query: parsed.query,
                hash: parsed.hash
            });
            expect(codec.parseURL(rebuilt).query).toEqual({ a: '1', b: 'hello world' });
        });
    });

    // -----------------------------------------------------------------------
    // encodeSafe
    // -----------------------------------------------------------------------

    describe('encodeSafe', () => {
        // --- Regression: factory metadata still correct ---
        test('factory metadata unchanged (regression)', () => {
            expect(url.name).toBe('url');
            expect(url.dependencies).toEqual([]);
            expect(typeof url.factory).toBe('function');
        });

        // --- ASCII safe-set pass-through (mirrors mdurl.test.js) ---
        test('plain ASCII URL with safe-set chars is returned unchanged', () => {
            expect(codec.encodeSafe('http://example.com/?q=1&b=2'))
                .toBe('http://example.com/?q=1&b=2');
        });

        test('preserves the default safe punctuation set', () => {
            const safe = ";/?:@&=+$,-_.!~*'()#";
            expect(codec.encodeSafe(safe)).toBe(safe);
        });

        test('encodes characters outside the safe set', () => {
            expect(codec.encodeSafe('a<b>c d')).toBe('a%3Cb%3Ec%20d');
        });

        // --- Space ---
        test('encodes space as %20', () => {
            expect(codec.encodeSafe('http://example.com/?q=foo bar'))
                .toBe('http://example.com/?q=foo%20bar');
        });

        // --- UTF-8 multi-byte ---
        test('encodes é as %C3%A9', () => {
            expect(codec.encodeSafe('Café')).toBe('Caf%C3%A9');
        });

        test('encodes CJK char 中 as %E4%B8%AD', () => {
            expect(codec.encodeSafe('中')).toBe('%E4%B8%AD');
        });

        test('encodes non-ASCII in URL path', () => {
            expect(codec.encodeSafe('http://x.com/é')).toBe('http://x.com/%C3%A9');
        });

        // --- Surrogate pair ---
        test('encodes surrogate pair 🎉 (U+1F389) as %F0%9F%8E%89', () => {
            expect(codec.encodeSafe('\u{1F389}')).toBe('%F0%9F%8E%89');
        });

        test('encodes surrogate pair U+1F600 as full UTF-8', () => {
            expect(codec.encodeSafe('\u{1F600}')).toBe('%F0%9F%98%80');
        });

        // --- Lone surrogate ---
        test('lone high surrogate is replaced by encoded U+FFFD', () => {
            expect(codec.encodeSafe('\uD800')).toBe('%EF%BF%BD');
        });

        // --- %HH pass-through ---
        test('valid %HH sequences pass through unchanged', () => {
            expect(codec.encodeSafe('http://x.com/%20foo')).toBe('http://x.com/%20foo');
            expect(codec.encodeSafe('http://x.com/%C3%A9')).toBe('http://x.com/%C3%A9');
        });

        // --- Invalid %HH re-encoded ---
        test('invalid %HH sequences are re-encoded', () => {
            expect(codec.encodeSafe('%G1')).toBe('%25G1');
            expect(codec.encodeSafe('http://x.com/%G1')).toBe('http://x.com/%25G1');
        });

        // --- Control characters ---
        test('encodes NUL as %00', () => {
            expect(codec.encodeSafe('\x00')).toBe('%00');
        });

        test('encodes DEL as %7F', () => {
            expect(codec.encodeSafe('\x7F')).toBe('%7F');
        });

        // --- Custom safe-set ---
        test('custom safe set: only listed chars pass through', () => {
            // Space is not in 'ABCabc', so it is encoded
            expect(codec.encodeSafe('foo bar', { safe: 'ABCabc' })).toBe('foo%20bar');
        });

        test('custom safe set: slash not safe → encoded', () => {
            expect(codec.encodeSafe('a/b', { safe: '' })).toBe('a%2Fb');
        });

        // --- Empty string ---
        test('returns empty string for empty input', () => {
            expect(codec.encodeSafe('')).toBe('');
        });
    });

    // -----------------------------------------------------------------------
    // decodeSafe
    // -----------------------------------------------------------------------

    describe('decodeSafe', () => {
        test('decodes %C3%A9 back to é', () => {
            expect(codec.decodeSafe('Caf%C3%A9')).toBe('Café');
        });

        test('decodes %20 as space', () => {
            expect(codec.decodeSafe('hello%20world')).toBe('hello world');
        });

        test('plain string returned unchanged', () => {
            expect(codec.decodeSafe('hello')).toBe('hello');
        });

        test('invalid sequence returned as-is (fail-soft)', () => {
            // decodeURIComponent('%G1') throws - decodeSafe must not throw
            expect(codec.decodeSafe('%G1')).toBe('%G1');
        });

        test('returns empty string for empty input', () => {
            expect(codec.decodeSafe('')).toBe('');
        });
    });

    // -----------------------------------------------------------------------
    // round-trip encodeSafe / decodeSafe
    // -----------------------------------------------------------------------

    describe('round-trip encodeSafe/decodeSafe', () => {
        test('ASCII string', () => {
            const s = 'hello world!';
            expect(codec.decodeSafe(codec.encodeSafe(s))).toBe(s);
        });

        test('UTF-8 string', () => {
            const s = 'Café au lait';
            expect(codec.decodeSafe(codec.encodeSafe(s))).toBe(s);
        });

        test('URL with path and query', () => {
            const s = 'http://example.com/?q=foo bar&lang=fr';
            expect(codec.decodeSafe(codec.encodeSafe(s))).toBe(s);
        });

        test('CJK characters', () => {
            const s = '中文测试';
            expect(codec.decodeSafe(codec.encodeSafe(s))).toBe(s);
        });
    });
});
