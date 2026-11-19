// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// The runtime's WHATWG URL and URLSearchParams as the oracle (D21: no
// vendored suite). parseURL delegates to URL when present, so the checks
// bear on what fw does itself: parseQuery, buildURL, and the fallback parser
// used when the realm has no URL.

import { describe, test, expect } from 'bun:test';
import { url } from './url.js';

const u = url.factory();

const URLS = [
    'https://example.com/', 'http://example.com:8080/a/b?x=1#top', 'https://u:p@example.com:8443/p?r=%20#h',
    'https://example.com/a/./b/../c', 'https://EXAMPLE.com/%7Euser', 'https://example.com:443/', 'http://example.com:80/x',
    'https://example.com/?a=1&a=2&b=', 'https://example.com/path with space', 'https://example.com/#frag?x',
    'ftp://files.example.com/pub/file.txt', 'mailto:someone@example.com', 'urn:isbn:0451450523', 'file:///C:/dir/file.txt',
    'https://[::1]:8080/x', 'https://example.com/caf\u00e9?q=\u6c34', 'https://xn--caf-dma.example/', 'https://example.com/a%2Fb',
];
const QUERIES = ['?a=1&b=2', '?q=a+b', '?q=a%2Bb', '?x=%20y', '?k', '?k=', '?a=1&a=2', '?%E2%82%AC=1', '?a=b=c', '?=v', '?a&&b'];

/** URLSearchParams folded the way parseQuery folds repeats (an array). */
function uspObject(search) {
    const out = {};
    for (const [k, v] of new URLSearchParams(search)) out[k] = k in out ? [].concat(out[k], v) : v;
    return out;
}

describe('url against the runtime URL / URLSearchParams', () => {
    test('parseQuery with space "plus" equals URLSearchParams', () => {
        for (const q of QUERIES) expect(u.parseQuery(q, { space: 'plus' }), q).toEqual(uspObject(q));
    });

    test('buildURL(parseURL(x)) equals new URL(x).href', () => {
        for (const s of URLS) expect(u.buildURL(u.parseURL(s)), s).toBe(new URL(s).href);
    });

    test('a "+" in the query is a space, as URLSearchParams reads it (D17): a parse-build round trip keeps the meaning', () => {
        const s = 'https://example.com/p?q=a+b';
        expect(u.parseURL(s).query).toEqual(uspObject('?q=a+b'));
        const rebuilt = u.buildURL(u.parseURL(s));
        expect(rebuilt).toBe('https://example.com/p?q=a%20b');
        expect(uspObject(new URL(rebuilt).search)).toEqual(uspObject(new URL(s).search));
        // a %2B stays a plus; { space: 'percent' } keeps the literal reading
        expect(u.parseURL('https://example.com/p?q=a%2Bb').query).toEqual({ q: 'a+b' });
        expect(u.parseURL(s, undefined, { space: 'percent' }).query).toEqual({ q: 'a+b' });
    });

    test('the fallback parser (no URL in the realm) agrees on normalised URLs, IPv6 included', () => {
        const normalised = [
            'https://example.com/', 'http://example.com:8080/a/b?x=1#top', 'https://u:p@example.com:8443/p?r=%20#h',
            'ftp://files.example.com/pub/file.txt', 'https://[::1]:8080/x', 'https://[2001:db8::1]/a?b#c',
        ];
        const saved = globalThis.URL;
        let got;
        try {
            delete globalThis.URL;
            got = normalised.map((s) => u.parseURL(s));
        } finally {
            globalThis.URL = saved;
        }
        normalised.forEach((s, i) => {
            const want = new URL(s);
            for (const k of ['protocol', 'username', 'password', 'hostname', 'port', 'host', 'pathname', 'search', 'hash', 'origin']) {
                expect(got[i][k], `${s} ${k}`).toBe(want[k]);
            }
        });
    });
});
