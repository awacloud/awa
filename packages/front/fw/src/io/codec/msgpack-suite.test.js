// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// msgpack against an external conformance corpus: kawanet/msgpack-test-suite
// (MIT, vendored unchanged in tests/_vectors/msgpack-test-suite/, see its
// PROVENANCE.md). For every value the corpus lists all its valid encodings:
// each one must decode to the value, and fw's encoder must emit one of them.

import { describe, test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { msgpack } from './msgpack.js';
import { utf8 } from './utf8.js';

const M = msgpack.factory(utf8.factory());
const SUITE = JSON.parse(fs.readFileSync(path.join(import.meta.dir, '../../../tests/_vectors/msgpack-test-suite/msgpack-test-suite.json'), 'utf8'));

const bytes = (h) => new Uint8Array(h === '' ? [] : h.split('-').map((x) => parseInt(x, 16)));
const hex = (u) => Array.from(u, (x) => x.toString(16).padStart(2, '0')).join('-');

/** The JS value a corpus case stands for, and how to compare a decoded one. */
function expected(c) {
    if ('nil' in c) return { value: null, eq: (v) => v === null };
    if ('bool' in c) return { value: c.bool, eq: (v) => v === c.bool };
    if ('binary' in c) {
        const b = bytes(c.binary);
        return { value: b, eq: (v) => v instanceof Uint8Array && hex(v) === hex(b) };
    }
    if ('bignum' in c) {
        const n = BigInt(c.bignum);
        return { value: n, eq: (v) => (typeof v === 'bigint' ? v === n : typeof v === 'number' && Number.isInteger(v) && BigInt(v) === n) };
    }
    if ('number' in c) return { value: c.number, eq: (v) => (typeof v === 'bigint' ? v === BigInt(c.number) : Object.is(v, c.number)) };
    if ('string' in c) return { value: c.string, eq: (v) => v === c.string };
    if ('array' in c) return { value: c.array, eq: (v) => JSON.stringify(v) === JSON.stringify(c.array) };
    if ('map' in c) return { value: c.map, eq: (v) => JSON.stringify(v) === JSON.stringify(c.map) };
    if ('timestamp' in c) {
        const [sec, ns] = c.timestamp;
        const ms = sec * 1000 + Math.round(ns / 1e6);
        // A Date holds milliseconds: fw decodes to the nearest one, and can
        // only encode a timestamp that a Date represents exactly.
        return { value: ns % 1e6 === 0 ? new Date(ms) : undefined, eq: (v) => v instanceof Date && v.getTime() === ms };
    }
    if ('ext' in c) {
        const [type, data] = c.ext;
        const d = bytes(data);
        return { value: new M.Ext(type, d), eq: (v) => v instanceof M.Ext && v.type === type && hex(v.data) === hex(d) };
    }
    throw new Error('unknown case ' + JSON.stringify(c));
}

describe('msgpack — kawanet/msgpack-test-suite (MIT, external corpus)', () => {
    test('the corpus is the pinned one: 15 groups, 85 values', () => {
        const groups = Object.keys(SUITE);
        expect(groups.length).toBe(15);
        expect(groups.reduce((n, g) => n + SUITE[g].length, 0)).toBe(85);
    });

    for (const [group, cases] of Object.entries(SUITE)) {
        test(`${group}: every listed encoding decodes to the value`, () => {
            for (const c of cases) {
                const { eq } = expected(c);
                for (const enc of c.msgpack) {
                    const v = M.decode(bytes(enc));
                    expect([group, enc, eq(v)]).toEqual([group, enc, true]);
                }
            }
        });

        test(`${group}: fw encodes each value to one of the listed encodings`, () => {
            let n = 0;
            for (const c of cases) {
                const { value } = expected(c);
                if (value === undefined) continue; // a sub-millisecond timestamp: no Date holds it
                const enc = hex(M.encode(value));
                expect([group, JSON.stringify(c).slice(0, 60), c.msgpack.includes(enc) ? 'listed' : enc]).toEqual([group, JSON.stringify(c).slice(0, 60), 'listed']);
                n++;
            }
            expect(n).toBeGreaterThan(0);
        });
    }
});
