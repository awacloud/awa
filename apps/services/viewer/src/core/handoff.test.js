// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The handoff of a file to a new window: given under a
 * random token, taken once, refused when stale or malformed, swept; the
 * new window's address carries the token.
 *
 * @module viewer/core/handoff.test
 */
import { describe, test, expect } from 'bun:test';
import { createHandoff, TTL_MS, PARAM } from './handoff.js';

/** A Map-backed store with the fw `indexedDB` accessor's shape. */
function store() {
    const map = new Map();
    return {
        map,
        get: async (k) => map.get(k),
        set: async (k, v) => { map.set(k, v); },
        del: async (k) => { map.delete(k); },
        getAllKeys: async () => [...map.keys()]
    };
}

describe('handoff', () => {
    test('a file is given under a token and taken once', async () => {
        const s = store();
        const h = createHandoff({ store: s });
        const file = new File(['x'], 'a.pdf');
        const token = await h.give({ file });
        expect(token).toMatch(/^[0-9a-z]{4,64}$/);
        const item = await h.take(token);
        expect(item?.file).toBe(file);
        expect(await h.take(token)).toBe(null);
        expect(s.map.size).toBe(0);
    });

    test('two gifts get two tokens', async () => {
        const h = createHandoff({ store: store() });
        const a = await h.give({ file: new File(['a'], 'a') });
        const b = await h.give({ file: new File(['b'], 'b') });
        expect(a).not.toBe(b);
    });

    test('stale and malformed tokens give nothing, and stale entries are swept', async () => {
        const s = store();
        let clock = 0;
        const h = createHandoff({ store: s, now: () => clock });
        const old = await h.give({ file: new File(['x'], 'old') });
        clock = TTL_MS + 1;
        expect(await h.take(old)).toBe(null);
        const left = await h.give({ file: new File(['y'], 'left') });
        clock = 2 * TTL_MS + 2;
        expect(await h.take('../etc')).toBe(null);
        expect(await h.take(null)).toBe(null);
        await h.take('zzzz');                       // sweeps
        await new Promise((r) => setTimeout(r, 0));
        expect(s.map.has(left)).toBe(false);
    });

    test('the new window\'s address carries the token next to the page', () => {
        const h = createHandoff({ store: store() });
        expect(h.url('abc123', 'https://viewer.awacloud.com/')).toBe(`https://viewer.awacloud.com/?${PARAM}=abc123`);
        expect(h.url('abc123', 'http://localhost:8793/apps/services/viewer/public/index.html'))
            .toBe(`http://localhost:8793/apps/services/viewer/public/?${PARAM}=abc123`);
    });
});
