// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `pdf.read(bytes)` against `pdf.read(source)` over every PDF fixture of
 * the package (`tests/_fixtures/**`): the read through a byte source, its
 * first window 64 bytes so that nearly every object makes it grow, gives
 * the same outcome — the same error code, or the same version, pages,
 * trailer and every in-use object resolved to the same value (or the same
 * error code for it). An encrypted fixture is read as stored
 * (`allowEncrypted`).
 */

import { describe, test, expect } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRuntime } from './_helpers/build.js';

const pdf = getRuntime().resolve('pdf');
const ROOT = fileURLToPath(new URL('_fixtures/', import.meta.url));

function walk(dir, out = []) {
    for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.pdf$/i.test(n)) out.push(p);
    }
    return out;
}

function sourceOf(bytes) {
    return { byteLength: bytes.length, read: (offset, length) => bytes.slice(offset, offset + length) };
}

/** The read's outcome: its error code, or its parts and every in-use object (or that object's error code). */
function outcome(input, opts) {
    let doc;
    try { doc = pdf.read(input, opts); } catch (e) { return { error: e.code || String(e) }; }
    const objects = {};
    for (const [num, e] of Object.entries(doc.xref.entries)) {
        if (e.free) continue;
        try { objects[num] = doc._raw.resolve({ type: 'ref', num: Number(num), gen: e.gen || 0 }); } catch (err) { objects[num] = { error: err.code || String(err) }; }
    }
    return { version: doc.version, pages: doc.pages.length, trailer: doc.trailer, losses: doc.losses.map((l) => l.code), objects };
}

describe('pdf.read(source) gives pdf.read(bytes) on every fixture (T6)', () => {
    const files = walk(ROOT);

    test('the fixtures are found', () => {
        expect(files.length).toBeGreaterThan(900);
    });

    test('same outcome, file by file', () => {
        const differ = [];
        let read = 0;
        for (const f of files) {
            const bytes = new Uint8Array(readFileSync(f));
            const a = outcome(bytes, { allowEncrypted: true });
            const b = outcome(sourceOf(bytes), { allowEncrypted: true, sourceWindow: 64 });
            if (!a.error) read++;
            if (!Bun.deepEquals(a, b)) differ.push(f.slice(ROOT.length));
        }
        expect(differ).toEqual([]);
        expect(read).toBeGreaterThan(800);
    }, 300_000);
});
