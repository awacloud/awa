// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Wiring guard — asserts that a `ModuleRuntime` seeded with the FULL
 * descriptor manifest exported by `src/main.js` (`fw_require` +
 * `pkg_require` + `modules` + `extras` + `bundle`, so every transitive
 * provider a `modules` factory might need is available) resolves every
 * descriptor declared in this package's OWN `modules` array with no
 * missing dependency, and that two specific graph paths actually WORK
 * (not just "resolve to something"):
 *
 * - GAP-PDF-1: `fw_require` used to omit zlib's own transitive closure
 *   (`bitstream`, `huffman`, `deflate`, `adler32`), so a runtime built
 *   from this package's own manifest resolved `zlib` but threw
 *   `Module not found: deflate` the first time a Flate stream was
 *   actually decoded. Same pattern for `pem` (missing `b64`) and for
 *   `pdfSign`'s `rsa`/`ecc` (missing `bn`/`random`/`hex`/`hmac`).
 * - GAP-PDF-2: `pdfContentStream` declares `pdfParser` as its `tokenize`
 *   source, but `pdfParser`'s factory did not return a `tokenize`
 *   function, so a `parseContentStream` resolved through the runtime
 *   threw `tokenize is not a function`.
 *
 * Deliberately scoped to `modules` (not `pkg_require`'s cross-package
 * `@awacloud/fonts` entries too): `@awacloud/fonts`'s own `fw_require` USED TO
 * carry a pre-existing, separate gap (`brotli` deps `lz77`/`brotliDict`/
 * `brotliDictWords`, not registered by `@awacloud/fonts`'s manifest) — fixed
 * upstream by office/BATCH_40 task 04 (BL-32), so `@awacloud/fonts`'s own
 * manifest is dependency-closed too; this file still doesn't assert over
 * `pkg_require`, staying scoped to `@awacloud/pdf`'s own wiring.
 *
 * Precedent: `md/tests/wiring.integration.test.js`.
 *
 * @module pdf/tests/wiring.integration
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules, extras, bundle } from '../src/main.js';

const ALL = [...fw_require, ...pkg_require, ...modules, ...extras, ...bundle];

function buildRuntime() {
    const rt = new ModuleRuntime();
    for (const m of ALL) rt.register(m);
    return rt;
}

describe('pdf wiring — manifest is dependency-closed', () => {
    test('every descriptor exposes a string name', () => {
        for (const m of ALL) expect(typeof m.name).toBe('string');
    });

    test('runtime resolves every descriptor in the package\'s own `modules` array (no missing dependency)', () => {
        const rt = buildRuntime();
        for (const m of modules) {
            expect(() => rt.resolve(m.name)).not.toThrow();
        }
    });

    test('parseContentStream parses a minimal content stream end-to-end (GAP-PDF-2)', () => {
        const rt = buildRuntime();
        const { parseContentStream } = rt.resolve('pdfContentStream');
        const te = new TextEncoder();
        const bytes = te.encode('q\n1 0 0 1 10 20 cm\n1 0 0 RG\n0 0 100 100 re\nS\nQ\n');
        const ops = parseContentStream(bytes);
        expect(Array.isArray(ops)).toBe(true);
        expect(ops.map(o => o.op)).toEqual(['q', 'cm', 'RG', 're', 'S', 'Q']);
        expect(ops[1].args.map(a => a.value)).toEqual([1, 0, 0, 1, 10, 20]);
    });

    test('a Flate-compressed stream inflates without a hand-supplied zlib closure (GAP-PDF-1)', () => {
        const rt = buildRuntime();
        const flate = rt.resolve('pdfFlate');
        const te = new TextEncoder();
        const src = te.encode('BT /F1 12 Tf (Hello world) Tj ET');
        const compressed = flate.encode(src);
        const decoded = flate.decode(compressed);
        expect(Array.from(decoded)).toEqual(Array.from(src));
    });
});
