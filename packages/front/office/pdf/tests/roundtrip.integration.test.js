// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview L1 integration test — full read → write → read
 * roundtrip via `@awacloud/fw`'s `ModuleRuntime`.
 *
 * Covers:
 * - Stand-alone factory wiring (pdf without fw runtime).
 * - Full fw `ModuleRuntime` wiring (including Flate via fw `zlib`).
 * - Read → write → read byte roundtrip on synthesized fixtures.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman }   from '@awacloud/fw/io/compress/huffman.js';
import { deflate }   from '@awacloud/fw/io/compress/deflate.js';
import { lz77 }     from '@awacloud/fw/io/compress/lz77.js';
import { adler32 }   from '@awacloud/fw/io/calc/adler32.js';
import { utf8 }      from '@awacloud/fw/io/codec/utf8.js';
import { hex }       from '@awacloud/fw/io/codec/hex.js';
import { b64 }       from '@awacloud/fw/io/codec/b64.js';
import { bn }        from '@awacloud/fw/crypto/utils/bn.js';
import { random }    from '@awacloud/fw/crypto/utils/random.js';
import { hmac }      from '@awacloud/fw/crypto/hash/hmac.js';
import { fw_require, pkg_require, modules } from '../src/main.js';
import { buildDocument, bootstrapPdf } from './_helpers/build.js';

function buildRuntime() {
    const rt = new ModuleRuntime();
    // zlib transitive helpers (not part of fw_require but needed by zlib).
    rt.register(bitstream); rt.register(huffman); rt.register(lz77); rt.register(deflate);
    rt.register(adler32);
    rt.register(utf8); rt.register(hex); rt.register(b64);
    rt.register(bn); rt.register(random); rt.register(hmac);
    for (const m of fw_require)  rt.register(m);
    for (const m of pkg_require) rt.register(m);
    for (const m of modules)     rt.register(m);
    return rt;
}

describe('integration — @awacloud/fw runtime wiring', () => {
    test('all L1 pdf modules resolve via ModuleRuntime + fw deps', () => {
        const rt = buildRuntime();
        for (const m of modules) {
            // Skip modules that require @awacloud/fonts bindings (none here).
            const inst = rt.resolve(m.name);
            expect(inst).toBeDefined();
        }
    });

    test('runtime-resolved pdf reads + writes a fixture document', () => {
        const rt  = buildRuntime();
        const api = rt.resolve('pdf');
        const original = buildDocument({ pages: ['BT (hi) Tj ET', '(p2)'] });
        const doc = api.read(original);
        expect(doc.pages.length).toBe(2);
        const out = api.write(doc);
        const head = new TextDecoder('latin1').decode(out.subarray(0, 8));
        expect(head).toBe('%PDF-2.0');
    });

    test('flate decode + encode round-trips via runtime', () => {
        const rt    = buildRuntime();
        const flate = rt.resolve('pdfFlate');
        const src   = new TextEncoder().encode('zzz '.repeat(100));
        const enc   = flate.encode(src);
        const dec   = flate.decode(enc);
        expect(Array.from(dec)).toEqual(Array.from(src));
    });

    test('filter dispatch resolves all standard filters', () => {
        const rt   = buildRuntime();
        const disp = rt.resolve('pdfFilterDispatch');
        const names = disp.names();
        for (const expected of ['FlateDecode', 'ASCIIHexDecode',
                'ASCII85Decode', 'RunLengthDecode', 'DCTDecode',
                'JPXDecode', 'Crypt']) {
            expect(names).toContain(expected);
        }
    });
});

describe('integration — read → write → read roundtrip', () => {
    test('preserves page count', () => {
        const api = bootstrapPdf();
        for (const N of [1, 2, 3, 5, 10]) {
            const pages = Array.from({ length: N }, (_, i) => `content ${i}`);
            const original = buildDocument({ pages });
            const doc = api.read(original);
            const out = api.write(doc);
            const reread = api.read(out);
            expect(reread.pages.length).toBe(N);
        }
    });

    test('preserves catalog root + media boxes', () => {
        const api = bootstrapPdf();
        const original = buildDocument({
            pages: ['x'], mediaBox: [0, 0, 595, 842]
        });
        const doc = api.read(original);
        const out = api.write(doc);
        const reread = api.read(out);
        expect(reread.pages[0].mediaBox).toEqual([0, 0, 595, 842]);
    });

    test('emits canonical %PDF-2.0 even from a 1.7 input', () => {
        const api = bootstrapPdf();
        const original = buildDocument({ version: '1.7' });
        const doc = api.read(original);
        expect(doc.version).toBe('1.7');
        const out = api.write(doc);
        const head = new TextDecoder('latin1').decode(out.subarray(0, 8));
        expect(head).toBe('%PDF-2.0');
    });
});

describe('integration — worker safety surface', () => {
    test('every factory.toString() is transportable', () => {
        for (const m of modules) {
            const s = m.factory.toString();
            expect(s).toContain('function');
            // `this.` is forbidden in factory body itself (would bind to
            // the descriptor object during serialised transport). It IS
            // allowed inside nested class constructors declared in the
            // body (e.g. `pdfErrors` declares its error hierarchy with
            // `this.name = …`) — those `this` bindings refer to the
            // class instance, not to the descriptor, and are safe.
            // Strip class bodies before checking.
            const stripped = s.replace(
                /class\s+\w+(?:\s+extends\s+\w+)?\s*\{[\s\S]*?\n\s*\}/g, ''
            );
            expect(stripped).not.toContain('this.');
        }
    });
});
