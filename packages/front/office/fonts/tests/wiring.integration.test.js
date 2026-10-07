// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Wiring guard — asserts that a `ModuleRuntime` seeded with the FULL
 * descriptor manifest exported by `src/main.js` (`fw_require` + `modules` +
 * `extras` + `bundle`) resolves every descriptor declared in this package's
 * OWN `modules` array with no missing dependency, and that one FUNCTIONAL
 * graph path actually works (not just "resolves to something").
 *
 * office/BATCH_40 task 04 (BL-32): `fw_require` used to list only
 * `binaryReader`, `binaryWriter`, `zlib`, `brotli`, omitting each
 * provider's own transitive deps — `zlib` needs `deflate`/`adler32`
 * (which itself needs `bitstream`/`huffman`/`lz77`), and `brotli` needs
 * `lz77`/`brotliDict`/`brotliDictWords`. A runtime built from this
 * package's own manifest therefore resolved `fontWoff`/`fontWoff2` but
 * threw `Module not found` the first time WOFF/WOFF2 decode actually ran
 * — mirrors the GAP-PDF-1 pattern fixed in `@awacloud/pdf` (see
 * `pdf/tests/wiring.integration.test.js`).
 *
 * Precedent: `pdf/tests/wiring.integration.test.js`.
 *
 * office/BATCH_52 task 01 (BL-1535): a second gap was measured while writing
 * this guard — `embedSubsetForPdf` (`src/embed-pdf/subsetForPdf.js`) declares
 * four dependencies (`embedClosure`, `embedCmapBuilder`, `embedGlyphRewriter`,
 * `embedHash`, its own `src/embed-pdf/subsetForPdf/*` sub-modules) that this
 * package's OWN `modules` array never registered (only `@awacloud/pdf`'s
 * `pkg_require` pulled them in, for ITS graph), so a runtime seeded from
 * fonts' own manifest alone could not resolve it. It was carried here as a
 * documented exclusion until BATCH_52 task 01 registered the four sub-modules
 * in `modules` (before `embedSubsetForPdf`, dependency order): the exclusion
 * is gone and EVERY `modules` entry must now resolve from the manifest alone.
 *
 * @module fonts/tests/wiring.integration
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { binaryReader } from '@awacloud/fw/io/binary/reader.js';
import { binaryWriter } from '@awacloud/fw/io/binary/writer.js';
import { zlib } from '@awacloud/fw/io/compress/zlib.js';
import { brotli } from '@awacloud/fw/io/compress/brotli.js';
import { fw_require, modules, extras, bundle } from '../src/main.js';

const ALL = [...fw_require, ...modules, ...extras, ...bundle];

function buildRuntime() {
    const rt = new ModuleRuntime();
    for (const m of ALL) rt.register(m);
    return rt;
}

describe('fonts wiring — manifest is dependency-closed', () => {
    test('every descriptor exposes a string name', () => {
        for (const m of ALL) expect(typeof m.name).toBe('string');
    });

    test('a runtime seeded ONLY with fw_require + the package own `modules` resolves EVERY module (self-closure, BL-1535)', () => {
        const rt = new ModuleRuntime();
        for (const m of [...fw_require, ...modules]) rt.register(m);
        const failures = [];
        for (const m of modules) {
            try { rt.resolve(m.name); }
            catch (e) { failures.push(`${m.name}: ${e.message}`); }
        }
        expect(failures).toEqual([]);
    });

    test('runtime resolves every descriptor in the own `modules` array (no missing dependency, no exclusion)', () => {
        const rt = buildRuntime();
        for (const m of modules) {
            expect(() => rt.resolve(m.name)).not.toThrow();
        }
    });

    test('the four embedSubsetForPdf sub-modules are registered in `modules`, each BEFORE embedSubsetForPdf', () => {
        const names = modules.map(m => m.name);
        const at = names.indexOf('embedSubsetForPdf');
        expect(at).toBeGreaterThan(-1);
        for (const dep of ['embedClosure', 'embedCmapBuilder', 'embedGlyphRewriter', 'embedHash']) {
            const i = names.indexOf(dep);
            expect(i).toBeGreaterThan(-1);
            expect(i).toBeLessThan(at);
        }
    });

    test('descriptor names in `modules` are unique (a duplicate would be silently shadowed)', () => {
        const names = modules.map(m => m.name);
        expect(new Set(names).size).toBe(names.length);
    });

    test('embedSubsetForPdf resolves and exposes subsetForPdf from the own manifest', () => {
        const rt = buildRuntime();
        expect(typeof rt.resolve('embedSubsetForPdf').subsetForPdf).toBe('function');
    });

    test('runtime resolves every `extras` and `bundle` descriptor (measured 100% resolvable, office/BATCH_40 task 04)', () => {
        const rt = buildRuntime();
        for (const m of [...extras, ...bundle]) {
            expect(() => rt.resolve(m.name)).not.toThrow();
        }
    });

    test('fontWoff and fontWoff2 resolve and expose their read function (BL-32)', () => {
        const rt = buildRuntime();
        const woff = rt.resolve('fontWoff');
        const woff2 = rt.resolve('fontWoff2');
        expect(typeof woff.decode).toBe('function');
        expect(typeof woff2.decode).toBe('function');
    });

    test('fontWoff2 (brotli closure) really did not resolve under the OLD 4-entry fw_require (non-vacuity guard)', () => {
        const rt = new ModuleRuntime();
        for (const m of [binaryReader, binaryWriter, zlib, brotli, ...modules]) {
            rt.register(m);
        }
        expect(() => rt.resolve('fontWoff2')).toThrow(/Module not found/);
    });
});
