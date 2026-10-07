// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Archive-limit overrides on `docx.read(bytes, opts)`: `maxParts`,
 * `maxUncompressed` and `maxRatio` are forwarded to `opc.read`, which keeps
 * its semantics (an absent key keeps the `opc.defaultLimits` value, `0`
 * disables that check). The package under test carries one extra 1 MiB
 * zero-filled part, whose compression ratio trips the default `maxRatio`.
 *
 * These tests are the citations behind the `read` row of
 * `docs/api/docx/docx.md` and the resource-bounds section of
 * `docs/guide/performance.md`.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';
import { docxLargeBundle } from '../bundles/docx-large.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const d = runtime.resolve('docx');
const opc = runtime.resolve('opcPackage');
const zipInst = runtime.resolve('zip');

// A separate runtime so the bundle's extension wiring never leaks into `d`.
const bundleRuntime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules, ...ooxmlMods.extras]) {
    bundleRuntime.register(m);
}
bundleRuntime.register(docxLargeBundle);
const bundle = bundleRuntime.resolve('docxLargeBundle');

const ZERO_PART = '/word/media/zeros.bin';

/** Run `fn`, return the error it throws (or `null`). */
function thrown(fn) {
    try { fn(); } catch (e) { return e; }
    return null;
}

/** The number of entries (parts, content types, relationships) of a package. */
function entryCount(bytes) {
    let n = 0;
    zipInst.unzipSync(bytes, { filter() { n++; return false; } });
    return n;
}

/** A one-paragraph document written by `docx.write`. */
function baseBytes() {
    return d.write({
        type: 'document',
        body: [{ type: 'paragraph', children: [d.run('hello')] }]
    });
}

/** A `docx.write` output plus one 1 MiB zero-filled part. */
function zeroBytes() {
    const pkg = opc.read(baseBytes());
    pkg.parts[ZERO_PART] = new Uint8Array(1024 * 1024);
    return opc.write(pkg);
}

describe('docx.read — archive limits', () => {
    test('defaults are unchanged', () => {
        expect(opc.defaultLimits).toEqual(
            { maxParts: 1024, maxUncompressed: 268435456, maxRatio: 200 });
    });

    test('zero-filled part: default throws opc/zip-bomb on maxRatio', () => {
        const bytes = zeroBytes();
        const err = thrown(() => d.read(bytes));
        expect(err).not.toBeNull();
        expect(err.code).toBe('opc/zip-bomb');
        expect(err.context.limit).toBe('maxRatio');
    });

    test('maxRatio 0 and maxRatio 1e9 read it and list the part', () => {
        const bytes = zeroBytes();
        for (const maxRatio of [0, 1e9]) {
            const r = d.read(bytes, { maxRatio });
            expect(r.unmodelledParts.map(u => u.partName)).toContain(ZERO_PART);
        }
    });

    test('maxParts: N - 1 throws, N reads', () => {
        const bytes = baseBytes();
        const n = entryCount(bytes);
        const err = thrown(() => d.read(bytes, { maxParts: n - 1 }));
        expect(err).not.toBeNull();
        expect(err.code).toBe('opc/zip-bomb');
        expect(err.context.limit).toBe('maxParts');
        expect(d.read(bytes, { maxParts: n }).document).toBeDefined();
    });

    test('maxUncompressed below the total throws', () => {
        const bytes = baseBytes();
        const err = thrown(() => d.read(bytes, { maxUncompressed: 100 }));
        expect(err).not.toBeNull();
        expect(err.code).toBe('opc/zip-bomb');
        expect(err.context.limit).toBe('maxUncompressed');
    });

    test('an empty or unrelated options object behaves as no options', () => {
        const bytes = zeroBytes();
        for (const opts of [{}, { unrelated: 1 }]) {
            const err = thrown(() => d.read(bytes, opts));
            expect(err).not.toBeNull();
            expect(err.context.limit).toBe('maxRatio');
        }
        const ok = baseBytes();
        expect(d.read(ok, { unrelated: 1 }).unmodelledParts)
            .toEqual(d.read(ok).unmodelledParts);
    });

    test('through docxLargeBundle the override reaches opc.read', () => {
        const bytes = zeroBytes();
        expect(thrown(() => bundle.read(bytes)).context.limit).toBe('maxRatio');
        expect(bundle.read(bytes, { maxRatio: 0 }).unmodelledParts
            .map(u => u.partName)).toContain(ZERO_PART);
    });
});
